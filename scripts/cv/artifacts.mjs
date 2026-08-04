import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeDocxFiles } from './lib/docx.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRootDir = resolve(dirname(scriptPath), '..', '..');
const PREPARE_MESSAGE = 'Run npm run cv:prepare before cv:artifacts.';

export async function generateArtifacts(rootDir = defaultRootDir, { docxOnly = false } = {}) {
  const models = await readNormalizedModels(rootDir);
  const paths = await writeDocxFiles({
    models,
    outputDir: join(rootDir, '_site', 'assets', 'cv')
  });

  // The flag intentionally limits this task to DOCX while leaving room for PDF generation.
  void docxOnly;
  return paths;
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

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== '--docx-only');
  if (unknown.length) throw new Error(`Unknown cv:artifacts option: ${unknown.join(', ')}`);
  const paths = await generateArtifacts(defaultRootDir, { docxOnly: args.includes('--docx-only') });
  console.log(`Generated ${paths.length} editable CV documents.`);
}
