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
    settings: { page_limit: 2, photo: { en: false, zh: false } },
    languages: {
      en: {
        profile: 'Academic researcher.',
        contact: {
          name: 'Baizhou Zhang', email: 'baizhou@example.com',
          orcid: '0000-0003-3153-2264'
        }
      },
      zh: {
        profile: '学术研究者。',
        contact: {
          name: '张柏洲', email: 'baizhou@example.com',
          orcid: '0000-0003-3153-2264'
        }
      }
    },
    sections: sectionIds,
    education: [], grants: [], awards: [{
      title: { en: 'Research Award', zh: '研究奖项' },
      issuer: { en: 'University', zh: '大学' }
    }],
    patents: [], teaching: [], presentations: [], service: [],
    collections: {
      publications: { items: [] },
      projects: { items: [] },
      activities: { items: [] }
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
