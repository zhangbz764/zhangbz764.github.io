import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCvModels, CvValidationError } from '../../scripts/cv/lib/model.mjs';
import { makeSiteFixture, validCvConfig } from './helpers.mjs';

test('builds matching English and Chinese section order', async (t) => {
  const fixture = await makeSiteFixture({ cv: validCvConfig() });
  t.after(fixture.cleanup);
  const models = await buildCvModels(fixture.rootDir);
  assert.deepEqual(
    models.en.sections.map((section) => section.id),
    models.zh.sections.map((section) => section.id)
  );
  assert.equal(models.en.contact.orcid, '0000-0003-3153-2264');
});

test('resolves bilingual values in selected collection entries', async (t) => {
  const cv = validCvConfig();
  cv.collections.projects.items = [{ id: 'project-one', detail: 'full' }];
  const fixture = await makeSiteFixture({
    cv,
    projects: {
      'project-one': {
        title: 'Research Project',
        location: { en: 'Nanjing', zh: '南京' },
        cv: {
          period: { en: '2025', zh: '2025' },
          role: { en: 'Lead', zh: '负责人' },
          contribution: { en: 'Built the project.', zh: '完成项目开发。' }
        }
      }
    }
  });
  t.after(fixture.cleanup);
  const models = await buildCvModels(fixture.rootDir);
  assert.deepEqual(models.en.sections.find((section) => section.id === 'projects').items[0], {
    id: 'project-one', detail: 'full', title: 'Research Project', location: 'Nanjing',
    cv: { period: '2025', role: 'Lead', contribution: 'Built the project.' }
  });
  assert.deepEqual(models.zh.sections.find((section) => section.id === 'projects').items[0], {
    id: 'project-one', detail: 'full', title: 'Research Project', location: '南京',
    cv: { period: '2025', role: '负责人', contribution: '完成项目开发。' }
  });
});

test('normalizes activity selections into their matching sections', async (t) => {
  const cv = validCvConfig();
  cv.collections.teaching.items = [{ id: 'workshop', detail: 'compact' }];
  cv.collections.presentations.items = [{ id: 'conference', detail: 'compact' }];
  const fixture = await makeSiteFixture({
    cv,
    activities: {
      workshop: { cv: {
        title: { en: 'Workshop', zh: '工作坊' }, period: { en: '2025', zh: '2025' },
        role: { en: 'Teacher', zh: '教师' }, location: { en: 'Nanjing', zh: '南京' }
      } },
      conference: { cv: {
        title: { en: 'Conference', zh: '学术会议' }, period: { en: '2025', zh: '2025' },
        presentation_type: { en: 'Talk', zh: '报告' }, role: { en: 'Speaker', zh: '报告人' },
        location: { en: 'Nanjing', zh: '南京' }
      } }
    }
  });
  t.after(fixture.cleanup);
  const models = await buildCvModels(fixture.rootDir);
  assert.deepEqual(models.en.sections.find(({ id }) => id === 'teaching').items, [
    { id: 'workshop', detail: 'compact', cv: {
      title: 'Workshop', period: '2025', role: 'Teacher', location: 'Nanjing'
    } }
  ]);
  assert.deepEqual(models.zh.sections.find(({ id }) => id === 'presentations').items, [
    { id: 'conference', detail: 'compact', cv: {
      title: '学术会议', period: '2025', presentation_type: '报告', role: '报告人', location: '南京'
    } }
  ]);
  assert.equal(Object.hasOwn(models.en, 'activities'), false);
});

test('parses collection front matter checked out with Windows CRLF endings', async (t) => {
  const fixture = await makeSiteFixture({
    cv: validCvConfig(),
    activities: { windows: { title: 'Windows fixture', cv: {} } }
  });
  t.after(fixture.cleanup);
  const activityPath = join(fixture.rootDir, '_activities', 'windows.md');
  const source = await readFile(activityPath, 'utf8');
  await writeFile(activityPath, source.replaceAll('\n', '\r\n'));

  const models = await buildCvModels(fixture.rootDir);
  assert.equal(models.en.language, 'en');
  assert.equal(models.zh.language, 'zh');
});

test('rejects duplicate approved section ids', async (t) => {
  const cv = validCvConfig();
  cv.section_order.push('profile');
  const fixture = await makeSiteFixture({ cv });
  t.after(fixture.cleanup);
  await assert.rejects(() => buildCvModels(fixture.rootDir), (error) => {
    assert.ok(error instanceof CvValidationError);
    return error.issues.some((issue) => issue.includes('duplicate profile'));
  });
});

test('rejects more than five selected publications', async (t) => {
  const cv = validCvConfig();
  cv.collections.publications.items = Array.from({ length: 6 }, (_, index) => ({
    id: `publication-${index + 1}`,
    detail: 'compact'
  }));
  const publications = Object.fromEntries(
    cv.collections.publications.items.map(({ id }) => [id, { title: id, authors: ['ZHANG Baizhou'], type: 'Journal Article', source: 'Journal' }])
  );
  const fixture = await makeSiteFixture({ cv, publications });
  t.after(fixture.cleanup);
  await assert.rejects(() => buildCvModels(fixture.rootDir), (error) => {
    assert.ok(error instanceof CvValidationError);
    return error.issues.some((issue) => issue.includes('at most 5 publications'));
  });
});

test('rejects an award without an awarding organization', async (t) => {
  const cv = validCvConfig();
  cv.awards[0].issuer = { en: '', zh: '' };
  const fixture = await makeSiteFixture({ cv });
  t.after(fixture.cleanup);
  await assert.rejects(() => buildCvModels(fixture.rootDir), /awards\[0\].issuer/);
});

test('rejects missing fields displayed by education, grant, and award renderers', async (t) => {
  const cv = validCvConfig();
  cv.education = [{
    period: { en: '', zh: '' }, degree: { en: '', zh: '' },
    institution: { en: '', zh: '' }
  }];
  cv.grants = [{
    period: { en: '', zh: '' }, title: { en: '', zh: '' },
    funder: { en: '', zh: '' }, grant_number: '',
    role: { en: '', zh: '' }, status: { en: '', zh: '' }
  }];
  cv.awards = [{
    year: '', title: { en: '', zh: '' }, issuer: { en: '', zh: '' }
  }];
  const fixture = await makeSiteFixture({ cv });
  t.after(fixture.cleanup);

  await assert.rejects(() => buildCvModels(fixture.rootDir), (error) => {
    for (const path of [
      'education[0].period', 'education[0].degree', 'education[0].institution',
      'grants[0].period', 'grants[0].title', 'grants[0].funder',
      'grants[0].grant_number', 'grants[0].role', 'grants[0].status',
      'awards[0].year', 'awards[0].title', 'awards[0].issuer'
    ]) assert.ok(error.issues.some((issue) => issue.includes(path)), path);
    return true;
  });
});

test('reports malformed education, grant, and award section shapes as validation issues', async (t) => {
  const cv = validCvConfig();
  cv.education = {};
  cv.grants = {};
  cv.awards = {};
  const fixture = await makeSiteFixture({ cv });
  t.after(fixture.cleanup);

  await assert.rejects(() => buildCvModels(fixture.rootDir), (error) => {
    assert.ok(error instanceof CvValidationError);
    for (const path of ['education must be an array', 'grants must be an array', 'awards must be an array']) {
      assert.ok(error.issues.some((issue) => issue.includes(path)), path);
    }
    return true;
  });
});

test('rejects incomplete display metadata in every selected collection type', async (t) => {
  const cv = validCvConfig();
  cv.collections.publications.items = [{ id: 'publication', detail: 'compact' }];
  cv.collections.patents.items = [{ id: 'patent', detail: 'compact' }];
  cv.collections.projects.items = [{ id: 'project', detail: 'full' }];
  cv.collections.teaching.items = [{ id: 'teaching', detail: 'compact' }];
  cv.collections.presentations.items = [{ id: 'presentation', detail: 'compact' }];
  const fixture = await makeSiteFixture({
    cv,
    publications: {
      publication: { title: '', authors: [], type: '', source: '', cv: { year: '' } },
      patent: {
        title: '', authors: [], source: '',
        cv: { year: '', patent_number: '', status: { en: '', zh: '' } }
      }
    },
    projects: {
      project: {
        title: '',
        cv: {
          period: { en: '', zh: '' }, role: { en: '', zh: '' },
          contribution: { en: '', zh: '' }
        }
      }
    },
    activities: {
      teaching: {
        cv: {
          title: { en: '', zh: '' }, period: { en: '', zh: '' },
          role: { en: '', zh: '' }, location: { en: '', zh: '' }
        }
      },
      presentation: {
        cv: {
          title: { en: '', zh: '' }, period: { en: '', zh: '' },
          presentation_type: { en: '', zh: '' }, role: { en: '', zh: '' },
          location: { en: '', zh: '' }
        }
      }
    }
  });
  t.after(fixture.cleanup);

  await assert.rejects(() => buildCvModels(fixture.rootDir), (error) => {
    for (const path of [
      'collections.publications.publication.title',
      'collections.publications.publication.authors',
      'collections.publications.publication.type',
      'collections.publications.publication.source',
      'collections.publications.publication.cv.year',
      'collections.patents.patent.title', 'collections.patents.patent.authors',
      'collections.patents.patent.source', 'collections.patents.patent.cv.year',
      'collections.patents.patent.cv.patent_number', 'collections.patents.patent.cv.status',
      'collections.projects.project.title', 'collections.projects.project.cv.period',
      'collections.projects.project.cv.role', 'collections.projects.project.cv.contribution',
      'collections.teaching.teaching.cv.title', 'collections.teaching.teaching.cv.period',
      'collections.teaching.teaching.cv.role', 'collections.teaching.teaching.cv.location',
      'collections.presentations.presentation.cv.title',
      'collections.presentations.presentation.cv.period',
      'collections.presentations.presentation.cv.presentation_type',
      'collections.presentations.presentation.cv.role',
      'collections.presentations.presentation.cv.location'
    ]) assert.ok(error.issues.some((issue) => issue.includes(path)), path);
    return true;
  });
});

test('rejects an unknown collection id', async (t) => {
  const cv = validCvConfig();
  cv.collections.projects.items = [{ id: 'missing-project', detail: 'full' }];
  const fixture = await makeSiteFixture({ cv });
  t.after(fixture.cleanup);
  await assert.rejects(() => buildCvModels(fixture.rootDir), /missing-project/);
});

test('reports duplicate ids, invalid detail levels, and missing translations together', async (t) => {
  const cv = validCvConfig();
  cv.collections.projects.items = [
    { id: 'project-one', detail: 'expanded' },
    { id: 'project-one', detail: 'compact' }
  ];
  cv.languages.zh.profile = '';
  const fixture = await makeSiteFixture({
    cv,
    projects: { 'project-one': { title: 'Project One' } }
  });
  t.after(fixture.cleanup);
  await assert.rejects(() => buildCvModels(fixture.rootDir), (error) => {
    assert.ok(error.issues.some((issue) => issue.includes('duplicate project-one')));
    assert.ok(error.issues.some((issue) => issue.includes('expanded')));
    assert.ok(error.issues.some((issue) => issue.includes('languages.zh.profile')));
    return true;
  });
});

test('real CV config contains the approved faculty-application structure', async () => {
  const { en, zh } = await buildCvModels(process.cwd());
  assert.deepEqual(en.sections.map(({ id }) => id), [
    'profile', 'education', 'publications', 'grants', 'awards',
    'patents', 'projects', 'teaching', 'presentations', 'service'
  ]);
  assert.equal(en.sections.find(({ id }) => id === 'publications').items.length, 5);
  assert.equal(zh.sections.find(({ id }) => id === 'publications').items.length, 5);
  assert.equal(en.contact.website, 'https://zhangbz764.github.io');
  assert.equal(en.contact.orcid, '0000-0003-3153-2264');
  assert.equal(en.settings.show_photo, false);
  assert.equal(zh.settings.show_photo, false);
});

test('real selected projects normalize matching bilingual CV metadata', async () => {
  const { en, zh } = await buildCvModels(process.cwd());
  const projects = (model) => model.sections.find(({ id }) => id === 'projects').items;
  const enProjects = projects(en);
  const zhProjects = projects(zh);

  assert.ok(enProjects.length > 0);
  assert.deepEqual(enProjects.map(({ id }) => id), zhProjects.map(({ id }) => id));
  enProjects.forEach((item, index) => {
    const localized = zhProjects[index];
    assert.ok(item.cv.period);
    assert.ok(localized.cv.period);
    assert.ok(item.cv.role);
    assert.ok(localized.cv.role);
    if (item.detail === 'full') {
      assert.ok(item.cv.contribution);
      assert.ok(localized.cv.contribution);
    }
  });
});

test('real selected activities normalize matching bilingual CV fields', async () => {
  const { en, zh } = await buildCvModels(process.cwd());
  const sectionItems = (model, id) => model.sections.find((section) => section.id === id).items;
  const teachingEn = sectionItems(en, 'teaching');
  const teachingZh = sectionItems(zh, 'teaching');
  const presentationsEn = sectionItems(en, 'presentations');
  const presentationsZh = sectionItems(zh, 'presentations');

  assert.ok(teachingEn.length > 0);
  assert.ok(presentationsEn.length > 0);
  assert.deepEqual(teachingEn.map(({ id }) => id), teachingZh.map(({ id }) => id));
  assert.deepEqual(presentationsEn.map(({ id }) => id), presentationsZh.map(({ id }) => id));

  for (const [english, chinese] of [...teachingEn.map((item, index) => [item, teachingZh[index]]),
    ...presentationsEn.map((item, index) => [item, presentationsZh[index]])]) {
    for (const field of ['title', 'period', 'role', 'location']) {
      assert.ok(english.cv[field]);
      assert.ok(chinese.cv[field]);
    }
  }
});
