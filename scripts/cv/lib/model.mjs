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

const SELECTIONS = {
  publications: { collection: 'publications', section: 'publications' },
  patents: { collection: 'publications', section: 'patents' },
  projects: { collection: 'projects', section: 'projects' },
  teaching: { collection: 'activities', section: 'teaching' },
  presentations: { collection: 'activities', section: 'presentations' }
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
  const sections = Array.isArray(cv.section_order) ? cv.section_order : [];

  if (!Array.isArray(cv.section_order)) issues.push('section_order must be an array');
  const sectionIds = new Set();
  for (const id of sections) {
    if (!APPROVED_SECTION_IDS.includes(id)) issues.push(`section_order contains unapproved id ${String(id)}`);
    if (sectionIds.has(id)) issues.push(`section_order contains duplicate ${String(id)}`);
    sectionIds.add(id);
  }
  for (const id of APPROVED_SECTION_IDS) {
    if (!sections.includes(id)) issues.push(`section_order is missing approved id ${id}`);
  }

  if (!Number.isFinite(cv.page_limit)) issues.push('page_limit must be a number');
  if (!Array.isArray(cv.author_aliases) || cv.author_aliases.some((alias) => !nonEmptyString(alias))) {
    issues.push('author_aliases must be an array of names');
  }
  if (!cv.contact || typeof cv.contact !== 'object') {
    issues.push('contact must be provided');
  } else {
    for (const field of ['email', 'website', 'orcid']) {
      if (!nonEmptyString(cv.contact[field])) issues.push(`contact.${field} must be provided`);
    }
    if (!isBilingualText(cv.contact.location)) issues.push('contact.location must include en and zh translations');
  }
  for (const language of ['en', 'zh']) {
    if (typeof cv.languages?.[language]?.show_photo !== 'boolean') {
      issues.push(`languages.${language}.show_photo must be a boolean`);
    }
    if (!nonEmptyString(cv.languages?.[language]?.name)) issues.push(`languages.${language}.name must be provided`);
    if (!nonEmptyString(cv.languages?.[language]?.role)) issues.push(`languages.${language}.role must be provided`);
    if (!nonEmptyString(cv.languages?.[language]?.profile)) {
      issues.push(`languages.${language}.profile must be provided`);
    }
  }

  validateBilingualEntries(cv.education, 'education', ['period', 'degree', 'institution'], issues);
  validateBilingualEntries(cv.grants, 'grants', ['period', 'title', 'funder', 'role', 'status'], issues);
  validateBilingualEntries(cv.awards, 'awards', ['title', 'issuer'], issues);
  for (const [index, grant] of (Array.isArray(cv.grants) ? cv.grants : []).entries()) {
    requireText(grant?.grant_number, `grants[${index}].grant_number`, issues);
  }
  for (const [index, award] of (Array.isArray(cv.awards) ? cv.awards : []).entries()) {
    requireValue(award?.year, `awards[${index}].year`, issues);
  }
  for (const id of APPROVED_SECTION_IDS) {
    if (!isBilingualText(cv.labels?.[id])) issues.push(`labels.${id} must include en and zh translations`);
  }
  if (!Array.isArray(cv.service?.reviewers)) issues.push('service.reviewers must be an array');

  for (const [name, { collection }] of Object.entries(SELECTIONS)) {
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
      if (!Object.hasOwn(collections[collection], item.id)) {
        issues.push(`collections.${name} references unknown id ${item.id}`);
      } else {
        validateSelectedEntry(name, item, collections[collection][item.id], issues);
      }
    }
  }
  return issues;
}

function validateSelectedEntry(selection, item, entry, issues) {
  const path = `collections.${selection}.${item.id}`;
  if (selection === 'publications') {
    requireText(entry.title, `${path}.title`, issues);
    requireStringArray(entry.authors, `${path}.authors`, issues);
    requireText(entry.type, `${path}.type`, issues);
    requireText(entry.source, `${path}.source`, issues);
    requireValue(entry.cv?.year, `${path}.cv.year`, issues);
    return;
  }
  if (selection === 'patents') {
    requireText(entry.title, `${path}.title`, issues);
    requireStringArray(entry.authors, `${path}.authors`, issues);
    requireText(entry.source, `${path}.source`, issues);
    requireValue(entry.cv?.year, `${path}.cv.year`, issues);
    requireText(entry.cv?.patent_number, `${path}.cv.patent_number`, issues);
    requireBilingual(entry.cv?.status, `${path}.cv.status`, issues);
    return;
  }
  if (selection === 'projects') {
    requireText(entry.title, `${path}.title`, issues);
    requireBilingual(entry.cv?.period, `${path}.cv.period`, issues);
    requireBilingual(entry.cv?.role, `${path}.cv.role`, issues);
    if (item.detail === 'full') {
      requireBilingual(entry.cv?.contribution, `${path}.cv.contribution`, issues);
    }
    return;
  }
  const requiredActivityFields = selection === 'teaching'
    ? ['title', 'period', 'role', 'location']
    : ['title', 'period', 'presentation_type', 'role', 'location'];
  for (const field of requiredActivityFields) {
    requireBilingual(entry.cv?.[field], `${path}.cv.${field}`, issues);
  }
}

function requireBilingual(value, path, issues) {
  if (!isBilingualText(value)) issues.push(`${path} must include en and zh translations`);
}

function requireText(value, path, issues) {
  if (!nonEmptyString(value)) issues.push(`${path} must be provided`);
}

function requireValue(value, path, issues) {
  if (value === undefined || value === null || String(value).trim() === '') {
    issues.push(`${path} must be provided`);
  }
}

function requireStringArray(value, path, issues) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => !nonEmptyString(entry))) {
    issues.push(`${path} must be a non-empty array of names`);
  }
}

function validateBilingualEntries(entries, path, requiredFields, issues) {
  if (!Array.isArray(entries)) {
    issues.push(`${path} must be an array`);
    return;
  }
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
  const selected = (name) => {
    const { collection } = SELECTIONS[name];
    return cv.collections[name].items.map(({ id, detail }) =>
      resolveBilingual({ id, detail, ...collections[collection][id] }, language)
    );
  };
  const sectionData = {
    profile: cv.languages[language].profile,
    education: resolveBilingual(cv.education ?? [], language),
    publications: selected('publications'),
    grants: resolveBilingual(cv.grants ?? [], language),
    awards: resolveBilingual(cv.awards ?? [], language),
    patents: selected('patents'),
    projects: selected('projects'),
    teaching: selected('teaching'),
    presentations: selected('presentations'),
    service: resolveBilingual(cv.service ?? [], language)
  };
  return {
    language,
    settings: {
      page_limit: cv.page_limit,
      show_photo: cv.languages[language].show_photo,
      publication_count: sectionData.publications.length
    },
    contact: {
      name: cv.languages[language].name,
      role: cv.languages[language].role,
      ...resolveBilingual(cv.contact, language)
    },
    profile: cv.languages[language].profile,
    author_aliases: [...cv.author_aliases],
    sections: cv.section_order.map((id) => ({
      id,
      label: cv.labels[id][language],
      items: sectionData[id]
    }))
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
