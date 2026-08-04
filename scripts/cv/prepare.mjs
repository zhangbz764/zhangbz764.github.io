import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCvModels } from './lib/model.mjs';
import { renderCvFragment } from './lib/html.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRootDir = resolve(dirname(scriptPath), '..', '..');

export async function prepareCv(rootDir = defaultRootDir) {
  const models = await buildCvModels(rootDir);
  const outputs = [
    [join(rootDir, '_includes', 'generated', 'cv-en.html'), `${renderCvFragment(models.en)}\n`],
    [join(rootDir, '_includes', 'generated', 'cv-zh.html'), `${renderCvFragment(models.zh)}\n`],
    [join(rootDir, '.cv-build', 'models', 'en.json'), `${JSON.stringify(models.en, null, 2)}\n`],
    [join(rootDir, '.cv-build', 'models', 'zh.json'), `${JSON.stringify(models.zh, null, 2)}\n`]
  ];

  await Promise.all(outputs.map(([path, contents]) => writeAtomically(path, contents)));
  return outputs.map(([path]) => path);
}

async function writeAtomically(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, 'utf8');
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await prepareCv();
  console.log('Prepared bilingual CV inputs.');
}
