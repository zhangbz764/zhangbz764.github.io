import { readFile, readdir } from 'node:fs/promises';
import { join, parse } from 'node:path';
import matter from 'gray-matter';
import YAML from 'yaml';

const APPROVED_SECTION_IDS = [
  'profile', 'education', 'publications', 'grants', 'awards',
  'patents', 'projects', 'teaching', 'presentations', 'service'
];

const COLLECTIONS = {
  publications: '_publications',
  projects: '_projects',
  activities: '_activities'
};

export class CvValidationError extends Error {
  constructor(issues) {
    super(`CV validation failed:\n- ${issues.join('\n- ')}`);
    this.name = 'CvValidationError';
    this.issues = issues;
  }
}

export async function buildCvModels(rootDir) {
  const source = await loadSource(rootDir);
  const issues = validateSource(source);
  if (issues.length) throw new CvValidationError(issues);
  return {
    en: normalizeLanguage(source, 'en'),
    zh: normalizeLanguage(source, 'zh')
  };
}

async function loadSource(rootDir) {
  let cv;
  try {
    cv = YAML.parse(await readFile(join(rootDir, '_data', 'cv.yml'), 'utf8'));
  } catch (error) {
    throw new CvValidationError([`Unable to read _data/cv.yml: ${error.message}`]);
  }

  const collections = Object.fromEntries(await Promise.all(
    Object.entries(COLLECTIONS).map(async ([name, directory]) => [
      name,
      await loadCollection(join(rootDir, directory))
    ])
  ));
  return { cv: cv ?? {}, collections };
}

async function loadCollection(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const parsedEntries = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
      const filename = entry.name;
      const extension = parse(filename).ext;
      const id = extension ? filename.slice(0, -extension.length) : filename;
      const contents = await readFile(join(directory, filename), 'utf8');
      return [id, matter(contents, { engines: { yaml: YAML.parse } }).data];
    }));
    return Object.fromEntries(parsedEntries);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function validateSource(source) {
  const { cv, collections } = source;
  const issues = [];
  const sections = Array.isArray(cv.sections) ? cv.sections : [];

  if (!Array.isArray(cv.sections)) issues.push('sections must be an array');
  for (const section of sections) {
    const id = typeof section === 'string' ? section : section?.id;
    if (!APPROVED_SECTION_IDS.includes(id)) issues.push(`sections contains unapproved id ${String(id)}`);
  }
  for (const id of APPROVED_SECTION_IDS) {
    if (!sections.some((section) => (typeof section === 'string' ? section : section?.id) === id)) {
      issues.push(`sections is missing approved id ${id}`);
    }
  }

  if (!Number.isFinite(cv.settings?.page_limit)) issues.push('settings.page_limit must be a number');
  for (const language of ['en', 'zh']) {
    if (typeof cv.settings?.photo?.[language] !== 'boolean') {
      issues.push(`settings.photo.${language} must be a boolean`);
    }
    if (!nonEmptyString(cv.languages?.[language]?.profile)) {
      issues.push(`languages.${language}.profile must be provided`);
    }
    const contact = cv.languages?.[language]?.contact;
    if (!contact || typeof contact !== 'object') {
      issues.push(`languages.${language}.contact must be provided`);
    } else {
      for (const field of Object.keys(contact)) {
        if (!nonEmptyString(contact[field])) issues.push(`languages.${language}.contact.${field} must be provided`);
      }
    }
  }

  validateBilingualEntries(cv.awards, 'awards', ['issuer'], issues);
  for (const section of ['education', 'grants', 'patents', 'teaching', 'presentations', 'service']) {
    validateBilingualEntries(cv[section], section, [], issues);
  }

  for (const [name, collection] of Object.entries(COLLECTIONS)) {
    const items = cv.collections?.[name]?.items;
    if (!Array.isArray(items)) {
      issues.push(`collections.${name}.items must be an array`);
      continue;
    }
    if (name === 'publications' && items.length > 5) issues.push('Select at most 5 publications');
    const ids = new Set();
    for (const item of items) {
      if (!item?.id) {
        issues.push(`collections.${name}.items contains an item without an id`);
        continue;
      }
      if (ids.has(item.id)) issues.push(`collections.${name} contains duplicate ${item.id}`);
      ids.add(item.id);
      if (!['full', 'compact'].includes(item.detail)) {
        issues.push(`collections.${name}.${item.id} has invalid detail level ${String(item.detail)}`);
      }
      if (!Object.hasOwn(collections[name], item.id)) {
        issues.push(`collections.${name} references unknown id ${item.id}`);
      }
    }
  }
  return issues;
}

function validateBilingualEntries(entries, path, requiredFields, issues) {
  if (!Array.isArray(entries)) return;
  entries.forEach((entry, index) => {
    for (const field of requiredFields) {
      if (!isBilingualText(entry?.[field])) issues.push(`${path}[${index}].${field} must include en and zh translations`);
    }
    for (const [field, value] of Object.entries(entry ?? {})) {
      if (value && typeof value === 'object' && !Array.isArray(value) && ('en' in value || 'zh' in value) && !isBilingualText(value)) {
        issues.push(`${path}[${index}].${field} must include en and zh translations`);
      }
    }
  });
}

function normalizeLanguage(source, language) {
  const { cv, collections } = source;
  const selected = (name) => cv.collections[name].items.map(({ id, detail }) => ({
    id,
    detail,
    ...collections[name][id]
  }));
  const sectionData = {
    profile: cv.languages[language].profile,
    education: resolveBilingual(cv.education ?? [], language),
    publications: selected('publications'),
    grants: resolveBilingual(cv.grants ?? [], language),
    awards: resolveBilingual(cv.awards ?? [], language),
    patents: resolveBilingual(cv.patents ?? [], language),
    projects: selected('projects'),
    teaching: resolveBilingual(cv.teaching ?? [], language),
    presentations: resolveBilingual(cv.presentations ?? [], language),
    service: resolveBilingual(cv.service ?? [], language)
  };
  return {
    language,
    settings: {
      ...cv.settings,
      photo: cv.settings.photo[language],
      page_limit: cv.settings.page_limit,
      publication_count: sectionData.publications.length
    },
    contact: { ...cv.languages[language].contact },
    profile: cv.languages[language].profile,
    sections: cv.sections.map((section) => {
      const id = typeof section === 'string' ? section : section.id;
      return { id, items: sectionData[id] };
    })
  };
}

function resolveBilingual(value, language) {
  if (Array.isArray(value)) return value.map((entry) => resolveBilingual(entry, language));
  if (!value || typeof value !== 'object') return value;
  if (Object.hasOwn(value, 'en') && Object.hasOwn(value, 'zh')) return value[language];
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveBilingual(entry, language)]));
}

function isBilingualText(value) {
  return value && typeof value === 'object' && nonEmptyString(value.en) && nonEmptyString(value.zh);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
