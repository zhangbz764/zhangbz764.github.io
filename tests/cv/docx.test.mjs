import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import JSZip from 'jszip';
import { buildCvModels } from '../../scripts/cv/lib/model.mjs';
import { createDocxBuffer, writeDocxFiles } from '../../scripts/cv/lib/docx.mjs';
import { generateArtifacts } from '../../scripts/cv/artifacts.mjs';

const A4_WIDTH_DXA = '11906';
const A4_HEIGHT_DXA = '16838';
const MARGIN_18_MM_DXA = '1021';

async function inspectDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const readPart = async (path) => {
    const part = zip.file(path);
    assert.ok(part, `Expected DOCX part ${path}`);
    return part.async('string');
  };

  return {
    zip,
    documentXml: await readPart('word/document.xml'),
    relationshipsXml: await readPart('word/_rels/document.xml.rels'),
    stylesXml: await readPart('word/styles.xml'),
    numberingXml: await readPart('word/numbering.xml'),
    footerXml: await readPart('word/footer1.xml')
  };
}

function visibleText(xml) {
  return xml
    .replace(/<w:tab\/?[^>]*>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function numberedParagraphs(documentXml) {
  return (documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [])
    .filter((paragraph) => paragraph.includes('<w:numPr>'));
}

function boldRunTexts(paragraphXml) {
  return (paragraphXml.match(/<w:r\b[\s\S]*?<\/w:r>/g) ?? [])
    .filter((run) => /<w:b\/>|<w:b[^>]*w:val="(?:true|1)"[^>]*\/>/.test(run))
    .map(visibleText)
    .filter(Boolean);
}

test('creates an editable A4 Word package with explicit academic CV styles', async () => {
  const { en } = await buildCvModels(process.cwd());
  const buffer = await createDocxBuffer(en);
  const { documentXml, stylesXml, numberingXml, footerXml } = await inspectDocx(buffer);

  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  assert.ok(buffer.length > 10000);
  assert.match(documentXml, new RegExp(`<w:pgSz[^>]*w:w="${A4_WIDTH_DXA}"[^>]*w:h="${A4_HEIGHT_DXA}"`));
  assert.match(documentXml, new RegExp(`<w:pgMar[^>]*w:top="${MARGIN_18_MM_DXA}"[^>]*w:right="${MARGIN_18_MM_DXA}"[^>]*w:bottom="${MARGIN_18_MM_DXA}"[^>]*w:left="${MARGIN_18_MM_DXA}"`));
  assert.match(stylesXml, /<w:style[^>]*w:styleId="CvBody"[\s\S]*?<w:rFonts[^>]*w:ascii="Arial"[^>]*w:eastAsia="Noto Sans CJK SC"/);
  assert.match(stylesXml, /<w:style[^>]*w:styleId="CvBody"[\s\S]*?<w:sz w:val="20"/);
  assert.match(stylesXml, /<w:style[^>]*w:styleId="CvSection"[\s\S]*?<w:pBdr>[\s\S]*?<w:bottom/);
  assert.match(numberingXml, /<w:numFmt w:val="decimal"/);
  assert.match(numberingXml, /<w:lvlText w:val="%1\."/);
  assert.match(numberingXml, /<w:ind w:left="540" w:hanging="270"/);
  assert.match(footerXml, /PAGE/);
});

test('uses relationship-backed contact links and excludes unstable layout objects', async () => {
  const { en } = await buildCvModels(process.cwd());
  const { zip, documentXml, relationshipsXml } = await inspectDocx(await createDocxBuffer(en));
  const allXml = (await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name.endsWith('.xml'))
      .map((entry) => entry.async('string'))
  )).join('\n');

  assert.match(relationshipsXml, /Target="mailto:zhang_baizhou@seu\.edu\.cn"/);
  assert.match(relationshipsXml, /Target="https:\/\/zhangbz764\.github\.io"/);
  assert.match(relationshipsXml, /Target="https:\/\/orcid\.org\/0000-0003-3153-2264"/);
  assert.match(visibleText(documentXml), /https:\/\/zhangbz764\.github\.io/);
  assert.equal((documentXml.match(/<w:hyperlink\b/g) ?? []).length, 3);
  assert.doesNotMatch(allXml, /<w:txbxContent\b|<v:textbox\b|<wp:anchor\b|<w:drawing\b/);
  assert.doesNotMatch(documentXml, /<w:cols[^>]*w:num=/);
});

test('renders exactly five real numbered publications with exact owner aliases bolded', async () => {
  const models = await buildCvModels(process.cwd());

  for (const model of Object.values(models)) {
    const { documentXml } = await inspectDocx(await createDocxBuffer(model));
    const publications = numberedParagraphs(documentXml);
    assert.equal(publications.length, 5, `${model.language} publication count`);
    assert.deepEqual(
      publications.map((paragraph) => boldRunTexts(paragraph)),
      [['Baizhou Zhang'], ['Baizhou Zhang'], ['Baizhou Zhang'], ['Baizhou Zhang'], ['Baizhou Zhang']]
    );
  }
});

test('renders language-specific text and award issuers in both documents', async () => {
  const models = await buildCvModels(process.cwd());
  const enText = visibleText((await inspectDocx(await createDocxBuffer(models.en))).documentXml);
  const zhText = visibleText((await inspectDocx(await createDocxBuffer(models.zh))).documentXml);

  assert.match(enText, /ZHANG Baizhou/);
  assert.match(enText, /Selected Publications/);
  assert.match(enText, /Association for Computer-Aided Architectural Design Research in Asia/);
  assert.match(zhText, /张柏洲/);
  assert.match(zhText, /代表性论文/);
  assert.match(zhText, /亚洲计算机辅助建筑设计研究协会/);
});

test('writes both exact language filenames', async (t) => {
  const outputDir = await mkdtemp(join(tmpdir(), 'cv-docx-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const paths = await writeDocxFiles({ models: await buildCvModels(process.cwd()), outputDir });

  assert.deepEqual(paths.map((path) => basename(path)).sort(), [
    'zhang-baizhou-cv-en.docx',
    'zhang-baizhou-cv-zh.docx'
  ]);
  assert.ok((await readFile(paths[0])).length > 10000);
});

test('artifact generation reads normalized JSON and emits both DOCX files', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'cv-artifacts-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const modelDir = join(rootDir, '.cv-build', 'models');
  await mkdir(modelDir, { recursive: true });
  const models = await buildCvModels(process.cwd());
  await Promise.all([
    writeFile(join(modelDir, 'en.json'), JSON.stringify(models.en)),
    writeFile(join(modelDir, 'zh.json'), JSON.stringify(models.zh))
  ]);

  const paths = await generateArtifacts(rootDir, { docxOnly: true });

  assert.deepEqual(paths.map((path) => basename(path)).sort(), [
    'zhang-baizhou-cv-en.docx',
    'zhang-baizhou-cv-zh.docx'
  ]);
  assert.ok(paths.every((path) => path.includes(join('_site', 'assets', 'cv'))));
});

test('artifact generation explains how to create missing normalized JSON', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'cv-artifacts-missing-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));

  await assert.rejects(
    generateArtifacts(rootDir, { docxOnly: true }),
    /Run npm run cv:prepare before cv:artifacts\./
  );
});
