import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { writeDocxFiles } from './lib/docx.mjs';
import { printCvPdf } from './lib/pdf.mjs';
import { startStaticServer } from './lib/server.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRootDir = resolve(dirname(scriptPath), '..', '..');
const PREPARE_MESSAGE = 'Run npm run cv:prepare before cv:artifacts.';
const OUTPUTS = [
  ['en', 'pdf', 'zhang-baizhou-cv-en.pdf'],
  ['zh', 'pdf', 'zhang-baizhou-cv-zh.pdf'],
  ['en', 'docx', 'zhang-baizhou-cv-en.docx'],
  ['zh', 'docx', 'zhang-baizhou-cv-zh.docx']
];
const FILE_SYSTEM = { mkdir, rename, rm, stat };

export async function generateArtifacts(rootDir = defaultRootDir, {
  docxOnly = false,
  serverFactory = startStaticServer,
  browserLauncher = () => chromium.launch(),
  pdfPrinter = printCvPdf,
  docxWriter = writeDocxFiles,
  fileSystem = FILE_SYSTEM
} = {}) {
  const models = await readNormalizedModels(rootDir);
  const outputDir = resolve(rootDir, '_site', 'assets', 'cv');

  if (docxOnly) return docxWriter({ models, outputDir });

  const stagingDir = resolve(dirname(outputDir), `.cv-artifacts-${randomUUID()}.tmp`);
  const finalPaths = OUTPUTS.map(([, , filename]) => resolve(outputDir, filename));
  let server;
  let browser;
  let result;
  let operationError;
  let cleanupErrors = [];

  try {
    await fileSystem.mkdir(stagingDir, { recursive: true });
    server = await serverFactory({
      rootDir: resolve(rootDir, '_site'),
      port: 0,
      renderCv: (language) => readBuiltPage(rootDir, language)
    });
    browser = await browserLauncher();

    for (const language of ['en', 'zh']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await pdfPrinter({
        page,
        url: `${server.url}/cv/${language}/`,
        outputPath: resolve(stagingDir, `zhang-baizhou-cv-${language}.pdf`),
        pageLimit: models[language].page_limit,
        screenshotDir: resolve(rootDir, '.cv-build', 'screenshots')
      });
    }

    await docxWriter({ models, outputDir: stagingDir });
    const stagedPaths = OUTPUTS.map(([, , filename]) => resolve(stagingDir, filename));
    await verifyOutputs(stagedPaths, fileSystem);
    await installArtifactSet({ stagedPaths, finalPaths, fileSystem });
    result = finalPaths;
  } catch (error) {
    operationError = error;
  } finally {
    cleanupErrors = await closeAndClean({ browser, server, stagingDir, fileSystem });
  }

  if (operationError) {
    if (cleanupErrors.length) {
      throw new AggregateError(
        [operationError, ...cleanupErrors],
        `CV artifact generation failed and cleanup also failed: ${operationError.message}`
      );
    }
    throw operationError;
  }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, 'CV artifact cleanup failed.');
  }
  return result;
}

async function readBuiltPage(rootDir, language) {
  return readFile(join(rootDir, '_site', 'cv', language, 'index.html'), 'utf8');
}

async function readNormalizedModels(rootDir) {
  const modelDir = join(rootDir, '.cv-build', 'models');
  try {
    const [en, zh] = await Promise.all([
      readFile(join(modelDir, 'en.json'), 'utf8'),
      readFile(join(modelDir, 'zh.json'), 'utf8')
    ]);
    return { en: JSON.parse(en), zh: JSON.parse(zh) };
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(PREPARE_MESSAGE);
    throw error;
  }
}

async function verifyOutputs(paths, fileSystem) {
  for (const path of paths) {
    let details;
    try {
      details = await fileSystem.stat(path);
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Required CV artifact is missing: ${path}`);
      throw error;
    }
    if (!details.isFile() || details.size === 0) {
      throw new Error(`Required CV artifact ${path} is empty.`);
    }
  }
}

async function installArtifactSet({ stagedPaths, finalPaths, fileSystem }) {
  await fileSystem.mkdir(dirname(finalPaths[0]), { recursive: true });
  const transactionId = randomUUID();
  const files = stagedPaths.map((stagedPath, index) => ({
    stagedPath,
    finalPath: finalPaths[index],
    backupPath: `${finalPaths[index]}.${transactionId}.bak`
  }));
  const backedUp = [];
  const installed = [];

  try {
    for (const file of files) {
      try {
        await fileSystem.rename(file.finalPath, file.backupPath);
        backedUp.push(file);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    for (const file of files) {
      await fileSystem.rename(file.stagedPath, file.finalPath);
      installed.push(file);
    }
    await verifyOutputs(finalPaths, fileSystem);
  } catch (error) {
    const rollbackErrors = [];
    for (const file of installed.toReversed()) {
      try {
        await fileSystem.rm(file.finalPath, { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const file of backedUp.toReversed()) {
      try {
        await fileSystem.rm(file.finalPath, { force: true });
        await fileSystem.rename(file.backupPath, file.finalPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Failed to replace the CV artifact set and roll back: ${error.message}`
      );
    }
    throw error;
  }

  const backupCleanup = await Promise.allSettled(
    backedUp.map((file) => fileSystem.rm(file.backupPath, { force: true }))
  );
  const cleanupFailure = backupCleanup.find(({ status }) => status === 'rejected');
  if (cleanupFailure) throw cleanupFailure.reason;
}

async function closeAndClean({ browser, server, stagingDir, fileSystem }) {
  const errors = [];
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (server) {
    try {
      await server.close();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await fileSystem.rm(stagingDir, { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== '--docx-only');
  if (unknown.length) throw new Error(`Unknown cv:artifacts option: ${unknown.join(', ')}`);
  const paths = await generateArtifacts(defaultRootDir, { docxOnly: args.includes('--docx-only') });
  console.log(`Generated and verified ${paths.length} CV artifacts.`);
}
