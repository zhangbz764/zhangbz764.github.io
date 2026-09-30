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
  assert.doesNotMatch(
    allXml,
    /<w:tbl\b|<w:pict\b|<w:txbxContent\b|<wp:anchor\b|<w:drawing\b|<(?:v|wps|wpg|wsp):[A-Za-z]/
  );
  assert.doesNotMatch(documentXml, /<w:cols[^>]*w:num=/);
});

test('renders unsafe contact values as plain text without external relationships', async () => {
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
  assert.equal((documentXml.match(/<w:hyperlink\b/g) ?? []).length, 0);
  assert.doesNotMatch(relationshipsXml, /relationships\/hyperlink|mailto:|javascript:|attacker\.example/);
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

test('Chinese DOCX uses localized teaching and presentation titles and locations', async () => {
  const { zh } = await buildCvModels(process.cwd());
  const text = visibleText((await inspectDocx(await createDocxBuffer(zh))).documentXml);

  assert.match(text, /2024年秋季硕士建筑设计课程助教/);
  assert.match(text, /中国南京，东南大学；意大利佛罗伦萨，佛罗伦萨大学/);
  assert.match(text, /SIMForms论文报告与青年CAADRIA奖/);
  assert.match(text, /新加坡科技设计大学，新加坡/);
  assert.doesNotMatch(text, /TA for Master's Architectural Design Program/);
  assert.doesNotMatch(text, /SUTD, Singapore/);
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

test('preserves explicit separators and punctuation in English entry paragraphs', async () => {
  const { en } = await buildCvModels(process.cwd());
  const texts = paragraphTexts((await inspectDocx(await createDocxBuffer(en))).documentXml);

  const expected = [
    '2022 - Present | PhD Candidate, Architecture, School of Architecture, Southeast University',
    '[Journal Article] Baizhou Zhang, Yichen Mo, Biao Li (2025). Web-based computational design tools for architectural design studio: enhancing pedagogical framework. Nexus Network Journal, 27(3), pp. 663-680, DOI: 10.1007/s00004-025-00826-y.',
    '2025 - 2026 | SEU Innovation Capability Enhancement Plan for Doctoral Students; Southeast University; Grant No. CXJH_SEU 25057; Project Investigator; Ongoing.',
    '2025 | Southeast University “Zhishan” Scholarship for PhD Students; Southeast University.',
    '2022 | Method and system for generating loop animation; Biao Li, Qiyan Zhang, Baizhou Zhang, Peng Tang, Zhehao Song, Hongjian Li; CN113888683A; Patent application published; 国家知识产权局 CNIPA.',
    '2024 | FLEXUrban; Main contributor; Contributed to the development of site subdivision, typology-based building generation, and facade detail generation.',
    "Autumn 2024 | TA for Master's Architectural Design Program, Autumn 2024; Teaching Assistant; Southeast University, Nanjing, China & Università degli Studi di Firenze, Firenze, Italy.",
    'April 22-26, 2024 | SIMForms presentation and Young CAADRIA Award; Conference paper presentation; Presenter; SUTD, Singapore.',
    'Reviewer for: Frontiers of Architectural Research; Scientific Reports; Archives of Computational Methods in Engineering; URBAN DESIGN International; CAADRIA'
  ];

  for (const paragraph of expected) assert.ok(texts.includes(paragraph), paragraph);
});

test('preserves explicit separators and punctuation in Chinese entry paragraphs', async () => {
  const { zh } = await buildCvModels(process.cwd());
  const texts = paragraphTexts((await inspectDocx(await createDocxBuffer(zh))).documentXml);

  const expected = [
    '2022 - 至今 | 建筑学博士研究生, 东南大学建筑学院',
    '[Journal Article] Baizhou Zhang, Yichen Mo, Biao Li (2025). Web-based computational design tools for architectural design studio: enhancing pedagogical framework. Nexus Network Journal, 27(3), pp. 663-680, DOI: 10.1007/s00004-025-00826-y.',
    '2025 - 2026 | 东南大学博士研究生创新能力提升计划; 东南大学; 项目编号 CXJH_SEU 25057; 项目负责人; 在研.',
    '2025 | 东南大学博士研究生至善奖学金; 东南大学.',
    '2022 | 一种循环动画的生成方法及其系统; Biao Li, Qiyan Zhang, Baizhou Zhang, Peng Tang, Zhehao Song, Hongjian Li; CN113888683A; 发明专利申请公布; 国家知识产权局 CNIPA.',
    '2024 | FLEXUrban; 主要贡献者; 参与场地划分、基于类型学的建筑生成与立面细部生成功能开发。',
    '2024年秋季学期 | 2024年秋季硕士建筑设计课程助教; 助教; 中国南京，东南大学；意大利佛罗伦萨，佛罗伦萨大学.',
    '2024年4月22-26日 | SIMForms论文报告与青年CAADRIA奖; 会议论文报告; 报告人; 新加坡科技设计大学，新加坡.',
    '审稿服务: Frontiers of Architectural Research; Scientific Reports; Archives of Computational Methods in Engineering; URBAN DESIGN International; CAADRIA'
  ];

  for (const paragraph of expected) assert.ok(texts.includes(paragraph), paragraph);
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
