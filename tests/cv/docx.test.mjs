import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
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

function paragraphTexts(documentXml) {
  return (documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [])
    .map(visibleText)
    .filter(Boolean);
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
  assert.match(stylesXml, /<w:style[^>]*w:styleId="CvBody"[\s\S]*?<w:rFonts[^>]*w:ascii="Microsoft YaHei"[^>]*w:cs="Microsoft YaHei"[^>]*w:eastAsia="Microsoft YaHei"[^>]*w:hAnsi="Microsoft YaHei"/);
  assert.match(stylesXml, /<w:style[^>]*w:styleId="CvBody"[\s\S]*?<w:sz w:val="20"/);
  assert.match(stylesXml, /<w:style[^>]*w:styleId="CvBody"[\s\S]*?<w:spacing[^>]*w:after="60"[^>]*w:line="276"[^>]*w:lineRule="auto"/);
  assert.match(stylesXml, /<w:style[^>]*w:styleId="CvSection"[\s\S]*?<w:spacing[^>]*w:after="70"[^>]*w:before="160"[^>]*w:line="288"/);
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
  const projectCount = en.sections.find(({ id }) => id === 'projects').items
    .filter((item) => item.cv?.url).length;
  assert.equal((documentXml.match(/<w:hyperlink\b/g) ?? []).length, 3 + projectCount);
  assert.doesNotMatch(
    allXml,
    /<w:tbl\b|<w:pict\b|<w:txbxContent\b|<wp:anchor\b|<w:drawing\b|<(?:v|wps|wpg|wsp):[A-Za-z]/
  );
  assert.doesNotMatch(documentXml, /<w:cols[^>]*w:num=/);
});

test('renders unsafe contact values as plain text without unsafe external relationships', async () => {
  const { en } = await buildCvModels(process.cwd());
  const model = structuredClone(en);
  model.contact.email = 'bad address@example.com';
  model.contact.website = 'javascript:alert(1)';
  model.contact.orcid = 'http://attacker.example/not-an-orcid';

  const { documentXml, relationshipsXml } = await inspectDocx(await createDocxBuffer(model));
  const text = visibleText(documentXml);

  assert.match(text, /Email: bad address@example\.com/);
  assert.match(text, /Website: javascript:alert\(1\)/);
  assert.match(text, /ORCID: http:\/\/attacker\.example\/not-an-orcid/);
  const projectCount = en.sections.find(({ id }) => id === 'projects').items
    .filter((item) => item.cv?.url).length;
  assert.equal((documentXml.match(/<w:hyperlink\b/g) ?? []).length, projectCount);
  assert.doesNotMatch(relationshipsXml, /mailto:|javascript:|attacker\.example/);
});

test('renders exactly five real numbered publications with exact owner aliases bolded', async () => {
  const models = await buildCvModels(process.cwd());

  for (const model of Object.values(models)) {
    const { documentXml } = await inspectDocx(await createDocxBuffer(model));
    const publications = numberedParagraphs(documentXml);
    const items = model.sections.find(({ id }) => id === 'publications').items;
    assert.equal(publications.length, 5, `${model.language} publication count`);
    assert.deepEqual(
      publications.map((paragraph) => boldRunTexts(paragraph)
        .filter((text) => items.some((item) => item.authors.includes(text)))),
      items.map(({ authors }) => authors.filter((author) => model.author_aliases.includes(author)))
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

test('Chinese DOCX uses localized teaching titles and locations', async () => {
  const { zh } = await buildCvModels(process.cwd());
  const text = visibleText((await inspectDocx(await createDocxBuffer(zh))).documentXml);

  assert.match(text, /2024年秋季研究生建筑设计课题“基于数字技术的佛罗伦萨弗兰基球场周边城市更新”/);
  assert.match(text, /东南大学；佛罗伦萨大学/);
  assert.doesNotMatch(text, /TA for Master's Architectural Design Program/);
  assert.doesNotMatch(text, /SIMForms论文报告与青年CAADRIA奖/);
});

test('DOCX project titles use title in English and subtitle in Chinese', async () => {
  const models = await buildCvModels(process.cwd());
  const enText = visibleText((await inspectDocx(await createDocxBuffer(models.en))).documentXml);
  const zhText = visibleText((await inspectDocx(await createDocxBuffer(models.zh))).documentXml);

  assert.match(enText, /Shopping Centre Layout Generator/);
  assert.doesNotMatch(enText, /购物中心平面布局生成工具/);
  assert.match(zhText, /购物中心平面布局生成工具/);
  assert.doesNotMatch(zhText, /Shopping Centre Layout Generator/);
});

test('DOCX projects include localized link labels with relationship-backed URLs', async () => {
  const models = await buildCvModels(process.cwd());
  const enParts = await inspectDocx(await createDocxBuffer(models.en));
  const zhParts = await inspectDocx(await createDocxBuffer(models.zh));
  const enProjects = models.en.sections.find(({ id }) => id === 'projects').items;

  for (const project of enProjects.filter((item) => item.cv?.url)) {
    assert.ok(enParts.relationshipsXml.includes(`Target="${project.cv.url}"`));
  }
  assert.match(visibleText(enParts.documentXml), /\bLink\b/);
  assert.match(visibleText(zhParts.documentXml), /链接/);
  assert.doesNotMatch(visibleText(enParts.documentXml), /https:\/\/web\.archialgo\.com\/simforms/);
});

test('DOCX indexing annotations render gray, bold, and italic', async () => {
  const models = await buildCvModels(process.cwd());

  for (const [model, annotation] of [
    [models.en, '(A&HCI, JCR Q1)'],
    [models.zh, '(A&HCI, JCR Q1, 中科院1区Top)']
  ]) {
    const { documentXml } = await inspectDocx(await createDocxBuffer(model));
    const publication = numberedParagraphs(documentXml).find((paragraph) => visibleText(paragraph).includes(annotation));
    assert.ok(publication, `${model.language} citation includes ${annotation}`);
    const run = (publication.match(/<w:r\b[\s\S]*?<\/w:r>/g) ?? [])
      .find((candidate) => visibleText(candidate).includes(annotation));
    assert.ok(run, `${model.language} annotation is its own styled run`);
    assert.match(run, /<w:b\/>/);
    assert.match(run, /<w:i\/>/);
    assert.match(run, /<w:color w:val="657074"\/>/);
  }
});

test('preserves citation and teaching separators in English paragraphs', async () => {
  const { en } = await buildCvModels(process.cwd());
  const texts = paragraphTexts((await inspectDocx(await createDocxBuffer(en))).documentXml);
  const publication = en.sections.find(({ id }) => id === 'publications').items
    .find(({ id }) => id === '2025-06-10-web-tool-studio');
  const teaching = en.sections.find(({ id }) => id === 'teaching').items[0];
  const citation = `${publication.authors.join(', ')} (${publication.cv.year}). ${publication.title}. ${publication.source}, ${publication.cv.volume}(${publication.cv.issue}), pp. ${publication.cv.pages}, DOI: ${publication.DOI} (${publication.cv.indexing_en}).`;
  const teachingEntry = `${teaching.cv.period} | ${teaching.cv.title}; ${teaching.cv.role}; ${teaching.cv.location}.`;

  assert.ok(texts.includes(citation));
  assert.ok(texts.includes(teachingEntry));
  assert.doesNotMatch(citation, /^\[Journal Article\]/);
  assert.ok(texts.some((text) => text.startsWith('Invited Reviewer for:')));
});

test('preserves citation and teaching separators in Chinese paragraphs', async () => {
  const { zh } = await buildCvModels(process.cwd());
  const texts = paragraphTexts((await inspectDocx(await createDocxBuffer(zh))).documentXml);
  const publication = zh.sections.find(({ id }) => id === 'publications').items
    .find(({ id }) => id === '2025-06-10-web-tool-studio');
  const teaching = zh.sections.find(({ id }) => id === 'teaching').items[0];
  const citation = `${publication.authors.join(', ')} (${publication.cv.year}). ${publication.title}. ${publication.source}, ${publication.cv.volume}(${publication.cv.issue}), pp. ${publication.cv.pages}, DOI: ${publication.DOI} (${publication.cv.indexing_zh}).`;
  const teachingEntry = `${teaching.cv.period} | ${teaching.cv.title}; ${teaching.cv.role}; ${teaching.cv.location}.`;

  assert.ok(texts.includes(citation));
  assert.ok(texts.includes(teachingEntry));
  assert.doesNotMatch(citation, /^\[Journal Article\]/);
  assert.ok(texts.some((text) => text.startsWith('受邀审稿人:')));
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

test('leaves an existing bilingual pair untouched when buffer creation fails', async (t) => {
  const outputDir = await mkdtemp(join(tmpdir(), 'cv-docx-create-failure-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const enPath = join(outputDir, 'zhang-baizhou-cv-en.docx');
  const zhPath = join(outputDir, 'zhang-baizhou-cv-zh.docx');
  await Promise.all([
    writeFile(enPath, 'old-en'),
    writeFile(zhPath, 'old-zh')
  ]);
  const models = await buildCvModels(process.cwd());

  await assert.rejects(writeDocxFiles({
    models,
    outputDir,
    createBuffer: async (model) => {
      if (model.language === 'zh') throw new Error('deterministic buffer failure');
      return Buffer.from('new-en');
    }
  }), /deterministic buffer failure/);

  assert.equal(await readFile(enPath, 'utf8'), 'old-en');
  assert.equal(await readFile(zhPath, 'utf8'), 'old-zh');
  assert.deepEqual((await readdir(outputDir)).sort(), [
    'zhang-baizhou-cv-en.docx',
    'zhang-baizhou-cv-zh.docx'
  ]);
});

test('rolls back both final files when the second staged replacement fails', async (t) => {
  const outputDir = await mkdtemp(join(tmpdir(), 'cv-docx-replace-failure-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const enPath = join(outputDir, 'zhang-baizhou-cv-en.docx');
  const zhPath = join(outputDir, 'zhang-baizhou-cv-zh.docx');
  await Promise.all([
    writeFile(enPath, 'old-en'),
    writeFile(zhPath, 'old-zh')
  ]);
  const models = await buildCvModels(process.cwd());
  let replacementFailed = false;
  const fileSystem = {
    mkdir,
    writeFile,
    rm,
    rename: async (source, destination) => {
      if (!replacementFailed && source.endsWith('.tmp') && destination === zhPath) {
        replacementFailed = true;
        throw new Error('deterministic replacement failure');
      }
      return rename(source, destination);
    }
  };

  await assert.rejects(writeDocxFiles({
    models,
    outputDir,
    createBuffer: async (model) => Buffer.from(`new-${model.language}`),
    fileSystem
  }), /deterministic replacement failure/);

  assert.equal(await readFile(enPath, 'utf8'), 'old-en');
  assert.equal(await readFile(zhPath, 'utf8'), 'old-zh');
  assert.deepEqual((await readdir(outputDir)).sort(), [
    'zhang-baizhou-cv-en.docx',
    'zhang-baizhou-cv-zh.docx'
  ]);
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
