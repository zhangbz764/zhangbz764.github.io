import test from 'node:test';
import assert from 'node:assert/strict';
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
        title: { en: 'Research Project', zh: '研究项目' },
        location: { en: 'Nanjing', zh: '南京' }
      }
    }
  });
  t.after(fixture.cleanup);
  const models = await buildCvModels(fixture.rootDir);
  assert.deepEqual(models.en.sections.find((section) => section.id === 'projects').items[0], {
    id: 'project-one', detail: 'full', title: 'Research Project', location: 'Nanjing'
  });
  assert.deepEqual(models.zh.sections.find((section) => section.id === 'projects').items[0], {
    id: 'project-one', detail: 'full', title: '研究项目', location: '南京'
  });
});

test('normalizes activity selections into their matching sections', async (t) => {
  const cv = validCvConfig();
  cv.collections.teaching.items = [{ id: 'workshop', detail: 'compact' }];
  cv.collections.presentations.items = [{ id: 'conference', detail: 'compact' }];
  const fixture = await makeSiteFixture({
    cv,
    activities: {
      workshop: { title: { en: 'Workshop', zh: '工作坊' } },
      conference: { title: { en: 'Conference', zh: '学术会议' } }
    }
  });
  t.after(fixture.cleanup);
  const models = await buildCvModels(fixture.rootDir);
  assert.deepEqual(models.en.sections.find(({ id }) => id === 'teaching').items, [
    { id: 'workshop', detail: 'compact', title: 'Workshop' }
  ]);
  assert.deepEqual(models.zh.sections.find(({ id }) => id === 'presentations').items, [
    { id: 'conference', detail: 'compact', title: '学术会议' }
  ]);
  assert.equal(Object.hasOwn(models.en, 'activities'), false);
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

test('real CV project metadata limits contribution claims to grounded participation', async () => {
  const { en, zh } = await buildCvModels(process.cwd());
  const projects = (model) => model.sections.find(({ id }) => id === 'projects').items;
  const findProject = (model, id) => projects(model).find((item) => item.id === id);

  assert.equal(
    findProject(en, '2024-11-13-flexurban').cv.contribution,
    'Contributed to the development of site subdivision, typology-based building generation, and facade detail generation.'
  );
  assert.equal(
    findProject(zh, '2024-11-13-flexurban').cv.contribution,
    '参与场地划分、基于类型学的建筑生成与立面细部生成功能开发。'
  );
  assert.equal(
    findProject(en, '2023-10-12-simforms').cv.contribution,
    'Contributed to the development of parametric model generation, metric feedback, and AI image synthesis.'
  );
  assert.equal(
    findProject(zh, '2023-10-12-simforms').cv.contribution,
    '参与参数化模型生成、指标反馈与AI图像合成功能开发。'
  );

  const anySiteEn = findProject(en, '2024-03-05-anysite');
  const anySiteZh = findProject(zh, '2024-03-05-anysite');
  assert.equal(anySiteEn.cv.role, 'Project team member');
  assert.equal(anySiteZh.cv.role, '项目成员');
  assert.equal(Object.hasOwn(anySiteEn.cv, 'contribution'), false);
  assert.equal(Object.hasOwn(anySiteZh.cv, 'contribution'), false);
});
