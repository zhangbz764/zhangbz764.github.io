import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';

const PRINT_OPTIONS = {
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: false
};

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

export async function assertPdfPageLimit(bytes, pageLimit) {
  if (!Number.isInteger(pageLimit) || pageLimit < 1) {
    throw new Error(`PDF page limit must be a positive integer; received ${pageLimit}.`);
  }
  const document = await PDFDocument.load(bytes);
  const pageCount = document.getPageCount();
  if (pageCount > pageLimit) {
    throw new Error(`Generated PDF has ${pageCount} pages, but the configured limit is ${pageLimit}.`);
  }
  return pageCount;
}

export async function printCvPdf({
  page,
  url,
  outputPath,
  pageLimit = 2,
  screenshotDir
}) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  if (pageLimit === 2) {
    const sheetCount = await page.locator('.cv-sheet').count();
    if (sheetCount !== 2) {
      throw new Error(`Default CV must contain exactly 2 .cv-sheet elements; found ${sheetCount}.`);
    }
  }

  if (screenshotDir) await captureScreenshots(page, outputPath, screenshotDir);

  await page.emulateMedia({ media: 'print' });
  const bytes = await page.pdf(PRINT_OPTIONS);
  const pageCount = await assertPdfPageLimit(bytes, pageLimit);
  if (pageLimit === 2 && pageCount !== 2) {
    throw new Error(`Default CV expected exactly 2 pages; found ${pageCount}.`);
  }
  await writeAtomically(outputPath, bytes);
  return pageCount;
}

async function captureScreenshots(page, outputPath, screenshotDir) {
  const absoluteScreenshotDir = resolve(screenshotDir);
  await mkdir(absoluteScreenshotDir, { recursive: true });
  const extension = extname(outputPath);
  const stem = basename(outputPath, extension);

  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.screenshot({
    path: join(absoluteScreenshotDir, `${stem}-desktop.png`),
    fullPage: true
  });
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.screenshot({
    path: join(absoluteScreenshotDir, `${stem}-mobile.png`),
    fullPage: true
  });
  await page.setViewportSize(DESKTOP_VIEWPORT);
}

async function writeAtomically(outputPath, bytes) {
  const finalPath = resolve(outputPath);
  await mkdir(dirname(finalPath), { recursive: true });
  const transactionId = randomUUID();
  const temporaryPath = `${finalPath}.${transactionId}.tmp`;
  const backupPath = `${finalPath}.${transactionId}.bak`;
  let backedUp = false;
  let installed = false;

  try {
    await writeFile(temporaryPath, bytes);
    try {
      await rename(finalPath, backupPath);
      backedUp = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rename(temporaryPath, finalPath);
    installed = true;
    if (backedUp) await rm(backupPath, { force: true });
  } catch (error) {
    const rollbackErrors = [];
    if (installed) {
      try {
        await rm(finalPath, { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (backedUp) {
      try {
        await rm(finalPath, { force: true });
        await rename(backupPath, finalPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    await Promise.allSettled([
      rm(temporaryPath, { force: true }),
      rm(backupPath, { force: true })
    ]);
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], `Failed to write PDF atomically: ${error.message}`);
    }
    throw error;
  }
}
