import { buildCvModels } from './lib/model.mjs';

try {
  const models = await buildCvModels(process.cwd());
  console.log(`CV data valid: ${models.en.sections.length} sections, ${models.en.settings.publication_count} selected publications.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
