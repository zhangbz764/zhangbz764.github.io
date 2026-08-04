import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { generateArtifacts } from '../../scripts/cv/artifacts.mjs';
import { runCvBuild } from '../../scripts/cv/build.mjs';
import { assertPdfPageLimit, printCvPdf } from '../../scripts/cv/lib/pdf.mjs';
import { buildCvModels } from '../../scripts/cv/lib/model.mjs';

test('accepts a two-page PDF and rejects a three-page PDF', async () => {
  assert.equal(await assertPdfPageLimit(await makePdf(2), 2), 2);
  await assert.rejects(
    assertPdfPageLimit(await makePdf(3), 2),
    /3 pages.*limit is 2/
  );
});

test('waits for fonts, requires two sheets, and prints with A4 options', async (t) => {
  const outputDir = await mkdtemp(join(tmpdir(), 'cv-pdf-print-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const outputPath = join(outputDir, 'zhang-baizhou-cv-en.pdf');
  const calls = [];
  let releaseFonts;
  const fontsReady = new Promise((resolve) => { releaseFonts = resolve; });
  const page = fakePage({ calls, fontsReady, pdfBytes: await makePdf(2) });

  const printing = printCvPdf({
    page,
    url: 'http://127.0.0.1:1234/cv/en/',
    outputPath,
    pageLimit: 2
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls.map(({ name }) => name), ['goto', 'fonts']);
  releaseFonts();
  assert.equal(await printing, 2);

  assert.deepEqual(calls.map(({ name }) => name), [
    'goto', 'fonts', 'sheet-count', 'print-media', 'pdf'
  ]);
  assert.deepEqual(calls.at(-1).options, {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false
  });
  assert.ok((await readFile(outputPath)).length > 0);
});

test('rejects a default CV page that does not contain exactly two sheets', async (t) => {
  const outputDir = await mkdtemp(join(tmpdir(), 'cv-pdf-sheets-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const outputPath = join(outputDir, 'zhang-baizhou-cv-en.pdf');
  const page = fakePage({ sheetCount: 1, pdfBytes: await makePdf(2) });

  await assert.rejects(
    printCvPdf({ page, url: 'http://example.test/cv/en/', outputPath, pageLimit: 2 }),
    /exactly 2 \.cv-sheet elements.*found 1/
  );
  await assert.rejects(readFile(outputPath), { code: 'ENOENT' });
});

test('leaves an existing PDF untouched when the generated file exceeds the page limit', async (t) => {
  const outputDir = await mkdtemp(join(tmpdir(), 'cv-pdf-limit-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const outputPath = join(outputDir, 'zhang-baizhou-cv-en.pdf');
  await writeFile(outputPath, 'old-pdf');

  await assert.rejects(
    printCvPdf({
      page: fakePage({ pdfBytes: await makePdf(3) }),
      url: 'http://example.test/cv/en/',
      outputPath,
      pageLimit: 2
    }),
    /3 pages.*limit is 2/
  );

  assert.equal(await readFile(outputPath, 'utf8'), 'old-pdf');
  assert.deepEqual(await readdir(outputDir), ['zhang-baizhou-cv-en.pdf']);
});

test('requires exactly two PDF pages for the default two-page configuration', async (t) => {
  const outputDir = await mkdtemp(join(tmpdir(), 'cv-pdf-exact-pages-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const outputPath = join(outputDir, 'zhang-baizhou-cv-en.pdf');

  await assert.rejects(
    printCvPdf({
      page: fakePage({ pdfBytes: await makePdf(1) }),
      url: 'http://example.test/cv/en/',
      outputPath,
      pageLimit: 2
    }),
    /expected exactly 2 pages.*found 1/
  );
  await assert.rejects(readFile(outputPath), { code: 'ENOENT' });
});

test('captures stable desktop and mobile screenshots before printing', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'cv-pdf-screenshots-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const calls = [];
  const screenshotDir = join(rootDir, '.cv-build', 'screenshots');

  await printCvPdf({
    page: fakePage({ calls, pdfBytes: await makePdf(2), writeScreenshots: true }),
    url: 'http://example.test/cv/zh/',
    outputPath: join(rootDir, 'zhang-baizhou-cv-zh.pdf'),
    pageLimit: 2,
    screenshotDir
  });

  const viewportCalls = calls.filter(({ name }) => name === 'viewport').map(({ size }) => size);
  assert.deepEqual(viewportCalls, [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
    { width: 1280, height: 900 }
  ]);
  assert.deepEqual((await readdir(screenshotDir)).sort(), [
    'zhang-baizhou-cv-zh-desktop.png',
    'zhang-baizhou-cv-zh-mobile.png'
  ]);
  assert.ok(
    calls.filter(({ name }) => name === 'screenshot')
      .every(({ options }) => options.fullPage === false)
  );
});

test('generates and verifies the exact four artifact names as one set', async (t) => {
  const fixture = await makeArtifactFixture();
  t.after(fixture.cleanup);
  const lifecycle = [];

  const paths = await generateArtifacts(fixture.rootDir, artifactDependencies({ lifecycle }));

  assert.deepEqual(paths.map((path) => basename(path)).sort(), [
    'zhang-baizhou-cv-en.docx',
    'zhang-baizhou-cv-en.pdf',
    'zhang-baizhou-cv-zh.docx',
    'zhang-baizhou-cv-zh.pdf'
  ]);
  for (const path of paths) assert.ok((await readFile(path)).length > 0, path);
  assert.deepEqual(lifecycle.slice(-2).sort(), ['browser-close', 'server-close']);
});

test('keeps the previous four-file set and cleans staging after a partial PDF failure', async (t) => {
  const fixture = await makeArtifactFixture({ seedOutputs: true });
  t.after(fixture.cleanup);
  const lifecycle = [];
  const options = artifactDependencies({
    lifecycle,
    pdfPrinter: async ({ outputPath }) => {
      if (outputPath.endsWith('-zh.pdf')) throw new Error('deterministic PDF failure');
      await writeFile(outputPath, 'new-en-pdf');
      return 2;
    }
  });

  await assert.rejects(generateArtifacts(fixture.rootDir, options), /deterministic PDF failure/);

  for (const [filename, contents] of Object.entries(fixture.oldOutputs)) {
    assert.equal(await readFile(join(fixture.outputDir, filename), 'utf8'), contents);
  }
  assert.deepEqual(await readdir(join(fixture.rootDir, '_site', 'assets')), ['cv']);
  assert.deepEqual(lifecycle.slice(-2).sort(), ['browser-close', 'server-close']);
});

test('rejects an empty generated output before replacing the previous artifact set', async (t) => {
  const fixture = await makeArtifactFixture({ seedOutputs: true });
  t.after(fixture.cleanup);
  const options = artifactDependencies({
    docxWriter: async ({ outputDir }) => {
      const en = join(outputDir, 'zhang-baizhou-cv-en.docx');
      const zh = join(outputDir, 'zhang-baizhou-cv-zh.docx');
      await Promise.all([writeFile(en, 'new-en-docx'), writeFile(zh, '')]);
      return [en, zh];
    }
  });

  await assert.rejects(generateArtifacts(fixture.rootDir, options), /zhang-baizhou-cv-zh\.docx.*empty/);

  for (const [filename, contents] of Object.entries(fixture.oldOutputs)) {
    assert.equal(await readFile(join(fixture.outputDir, filename), 'utf8'), contents);
  }
});

test('rolls back all four outputs when a staged artifact replacement fails', async (t) => {
  const fixture = await makeArtifactFixture({ seedOutputs: true });
  t.after(fixture.cleanup);
  const zhPdfPath = join(fixture.outputDir, 'zhang-baizhou-cv-zh.pdf');
  let replacementFailed = false;
  const fileSystem = {
    mkdir,
    rm,
    stat,
    rename: async (source, destination) => {
      if (!replacementFailed && source.includes('.cv-artifacts-') && destination === zhPdfPath) {
        replacementFailed = true;
        throw new Error('deterministic artifact replacement failure');
      }
      return rename(source, destination);
    }
  };

  await assert.rejects(
    generateArtifacts(fixture.rootDir, artifactDependencies({ fileSystem })),
    /deterministic artifact replacement failure/
  );

  for (const [filename, contents] of Object.entries(fixture.oldOutputs)) {
    assert.equal(await readFile(join(fixture.outputDir, filename), 'utf8'), contents);
  }
  assert.deepEqual(await readdir(join(fixture.rootDir, '_site', 'assets')), ['cv']);
});

test('runs build commands in order and stops at the first non-zero exit code', async () => {
  const calls = [];
  const exitCodes = [0, 7, 0];
  const exitCode = await runCvBuild({
    rootDir: 'C:\\cv-site',
    nodePath: 'bundled-node',
    platform: 'linux',
    spawnProcess: fakeSpawn(exitCodes, calls)
  });

  assert.equal(exitCode, 7);
  assert.deepEqual(calls, [
    ['bundled-node', ['scripts/cv/prepare.mjs']],
    ['bundle', ['exec', 'jekyll', 'build']]
  ]);
});

async function makePdf(pageCount) {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) document.addPage();
  return document.save();
}

function fakePage({
  calls = [],
  fontsReady = Promise.resolve(),
  sheetCount = 2,
  pdfBytes,
  writeScreenshots = false
} = {}) {
  return {
    async goto(url, options) { calls.push({ name: 'goto', url, options }); },
    evaluate(callback) {
      calls.push({ name: 'fonts' });
      const previousDocument = globalThis.document;
      globalThis.document = { fonts: { ready: fontsReady } };
      try {
        return callback();
      } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
      }
    },
    locator(selector) {
      assert.equal(selector, '.cv-sheet');
      return { count: async () => {
        calls.push({ name: 'sheet-count' });
        return sheetCount;
      } };
    },
    async setViewportSize(size) { calls.push({ name: 'viewport', size }); },
    async screenshot(options) {
      calls.push({ name: 'screenshot', options });
      if (writeScreenshots) await writeFile(options.path, 'png');
    },
    async emulateMedia(options) { calls.push({ name: 'print-media', options }); },
    async pdf(options) {
      calls.push({ name: 'pdf', options });
      return pdfBytes;
    }
  };
}

async function makeArtifactFixture({ seedOutputs = false } = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'cv-artifact-set-'));
  const modelDir = join(rootDir, '.cv-build', 'models');
  const outputDir = join(rootDir, '_site', 'assets', 'cv');
  await Promise.all([
    mkdir(modelDir, { recursive: true }),
    mkdir(join(rootDir, '_site', 'cv', 'en'), { recursive: true }),
    mkdir(join(rootDir, '_site', 'cv', 'zh'), { recursive: true }),
    mkdir(outputDir, { recursive: true })
  ]);
  const models = await buildCvModels(process.cwd());
  await Promise.all([
    writeFile(join(modelDir, 'en.json'), JSON.stringify(models.en)),
    writeFile(join(modelDir, 'zh.json'), JSON.stringify(models.zh)),
    writeFile(join(rootDir, '_site', 'cv', 'en', 'index.html'), '<html lang="en"></html>'),
    writeFile(join(rootDir, '_site', 'cv', 'zh', 'index.html'), '<html lang="zh-CN"></html>')
  ]);

  const oldOutputs = {
    'zhang-baizhou-cv-en.pdf': 'old-en-pdf',
    'zhang-baizhou-cv-zh.pdf': 'old-zh-pdf',
    'zhang-baizhou-cv-en.docx': 'old-en-docx',
    'zhang-baizhou-cv-zh.docx': 'old-zh-docx'
  };
  if (seedOutputs) {
    await Promise.all(Object.entries(oldOutputs)
      .map(([filename, contents]) => writeFile(join(outputDir, filename), contents)));
  }

  return {
    rootDir,
    outputDir,
    oldOutputs,
    cleanup: () => rm(rootDir, { recursive: true, force: true })
  };
}

function artifactDependencies({ lifecycle = [], pdfPrinter, docxWriter, fileSystem } = {}) {
  const browser = {
    async newPage() { return {}; },
    async close() { lifecycle.push('browser-close'); }
  };
  return {
    serverFactory: async () => ({
      url: 'http://127.0.0.1:43210',
      close: async () => { lifecycle.push('server-close'); }
    }),
    browserLauncher: async () => browser,
    pdfPrinter: pdfPrinter ?? (async ({ outputPath }) => {
      await writeFile(outputPath, `pdf:${basename(outputPath)}`);
      return 2;
    }),
    docxWriter: docxWriter ?? (async ({ outputDir }) => {
      const en = join(outputDir, 'zhang-baizhou-cv-en.docx');
      const zh = join(outputDir, 'zhang-baizhou-cv-zh.docx');
      await Promise.all([writeFile(en, 'en-docx'), writeFile(zh, 'zh-docx')]);
      return [en, zh];
    }),
    ...(fileSystem ? { fileSystem } : {})
  };
}

function fakeSpawn(exitCodes, calls) {
  return (command, args, options) => {
    assert.equal(options.stdio, 'inherit');
    calls.push([command, args]);
    const child = new EventEmitter();
    process.nextTick(() => child.emit('close', exitCodes.shift(), null));
    return child;
  };
}
