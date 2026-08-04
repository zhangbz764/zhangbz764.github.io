import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startPreviewServer } from '../../scripts/cv/preview.mjs';
import { makeSiteFixture, validCvConfig } from './helpers.mjs';

test('serves both language previews, refresh polling, and a numeric change version', async (t) => {
  const preview = await startPreviewServer({ rootDir: process.cwd(), port: 0, open: false });
  t.after(preview.close);

  const en = await fetch(`${preview.url}/cv/en/`);
  const zh = await fetch(`${preview.url}/cv/zh/`);
  const version = await fetch(`${preview.url}/__cv_version`);
  const enHtml = await en.text();

  assert.equal(en.status, 200);
  assert.match(enHtml, /Curriculum Vitae/);
  assert.match(enHtml, /fetch\('\/__cv_version', \{ cache: 'no-store' \}\)/);
  assert.equal(zh.status, 200);
  assert.match(await zh.text(), /个人简历/);
  assert.match(await version.text(), /^\d+$/);
});

test('serves CV CSS without caching and rejects encoded traversal paths', async (t) => {
  const preview = await startPreviewServer({ rootDir: process.cwd(), port: 0, open: false });
  t.after(preview.close);

  const css = await fetch(`${preview.url}/assets/cv/cv.css`);
  const traversal = await request(preview.url, '/assets/cv/%2e%2e/%2e%2e/package.json');

  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type') ?? '', /^text\/css/);
  assert.equal(css.headers.get('cache-control'), 'no-store');
  assert.equal(traversal.statusCode, 404);
  assert.equal(traversal.headers['cache-control'], 'no-store');
});

test('increments the refresh version when CV source files change', async (t) => {
  const fixture = await makeSiteFixture({ cv: validCvConfig() });
  t.after(fixture.cleanup);
  const preview = await startPreviewServer({ rootDir: fixture.rootDir, port: 0, open: false });
  t.after(preview.close);

  const before = await readVersion(preview.url);
  const configPath = join(fixture.rootDir, '_data', 'cv.yml');
  await writeFile(configPath, `${await readFile(configPath, 'utf8')}\n`, 'utf8');
  const after = await waitForChangedVersion(preview.url, before);

  assert.ok(Number(after) > Number(before));
});

function request(url, path) {
  return new Promise((resolve, reject) => {
    get(`${url}${path}`, (response) => {
      response.resume();
      response.on('end', () => resolve(response));
    }).on('error', reject);
  });
}

async function readVersion(url) {
  const response = await fetch(`${url}/__cv_version`);
  assert.equal(response.status, 200);
  return response.text();
}

async function waitForChangedVersion(url, before) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const next = await readVersion(url);
    if (next !== before) return next;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('CV version did not change after editing source data');
}
