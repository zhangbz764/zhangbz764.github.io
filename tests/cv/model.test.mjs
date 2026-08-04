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
