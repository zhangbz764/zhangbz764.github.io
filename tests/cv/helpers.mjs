import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';

const sectionIds = [
  'profile', 'education', 'publications', 'grants', 'awards',
  'patents', 'projects', 'teaching', 'presentations', 'service'
];

export function validCvConfig() {
  return {
    version: 1,
    page_limit: 2,
    section_order: sectionIds,
    contact: {
      email: 'baizhou@example.com',
      website: 'https://example.com',
      orcid: '0000-0003-3153-2264',
      location: { en: 'Nanjing', zh: '南京' }
    },
    author_aliases: ['ZHANG Baizhou', 'Baizhou Zhang', '张柏洲'],
    languages: {
      en: {
        name: 'Baizhou Zhang', role: 'Researcher',
        profile: 'Academic researcher.', show_photo: false
      },
      zh: {
        name: '张柏洲', role: '研究者',
        profile: '学术研究者。', show_photo: false
      }
    },
    education: [], grants: [], awards: [{
      year: 2025,
      title: { en: 'Research Award', zh: '研究奖项' },
      issuer: { en: 'University', zh: '大学' }
    }],
    service: { reviewers: [] },
    labels: Object.fromEntries(sectionIds.map((id) => [id, { en: id, zh: id }])),
    collections: {
      publications: { items: [] },
      patents: { items: [] },
      projects: { items: [] },
      teaching: { items: [] },
      presentations: { items: [] }
    }
  };
}

export async function makeSiteFixture({ cv, publications = {}, projects = {}, activities = {} }) {
  const rootDir = await mkdtemp(join(tmpdir(), 'cv-model-'));
  await mkdir(join(rootDir, '_data'), { recursive: true });
  await writeFile(join(rootDir, '_data', 'cv.yml'), YAML.stringify(cv));

  await Promise.all([
    writeCollection(rootDir, '_publications', publications),
    writeCollection(rootDir, '_projects', projects),
    writeCollection(rootDir, '_activities', activities)
  ]);

  return { rootDir, cleanup: () => rm(rootDir, { recursive: true, force: true }) };
}

async function writeCollection(rootDir, directory, entries) {
  const path = join(rootDir, directory);
  await mkdir(path, { recursive: true });
  await Promise.all(Object.entries(entries).map(([id, data]) =>
    writeFile(join(path, `${id}.md`), `---\n${YAML.stringify(data)}---\n`)
  ));
}
