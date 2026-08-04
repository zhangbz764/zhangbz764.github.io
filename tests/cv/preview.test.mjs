import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { get } from 'node:http';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
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

test('seeds the refresh poller and rebuilds the model after CV source changes', async (t) => {
  const config = validCvConfig();
  config.languages.en.profile = 'Original profile.';
  const fixture = await makeSiteFixture({ cv: config });
  t.after(fixture.cleanup);
  const preview = await startPreviewServer({ rootDir: fixture.rootDir, port: 0, open: false });
  t.after(preview.close);

  const before = await readVersion(preview.url);
  const initialHtml = await readPage(preview.url, 'en');
  const configPath = join(fixture.rootDir, '_data', 'cv.yml');
  const source = await readFile(configPath, 'utf8');
  await writeFile(configPath, source.replace('Original profile.', 'Updated profile.'), 'utf8');
  const after = await waitForChangedVersion(preview.url, before);
  const updatedHtml = await readPage(preview.url, 'en');

  assert.ok(Number(after) > Number(before));
  assert.equal(embeddedVersion(initialHtml), before);
  assert.match(updatedHtml, /Updated profile\./);
  assert.equal(embeddedVersion(updatedHtml), after);
});

test('rejects an asset symlink that resolves outside the CV asset root', async (t) => {
  const fixture = await makeSiteFixture({ cv: validCvConfig() });
  t.after(fixture.cleanup);
  const assetDirectory = join(fixture.rootDir, 'assets', 'cv');
  const outsideAsset = join(fixture.rootDir, 'outside.css');
  const escapedAsset = join(assetDirectory, 'escaped.css');
  await mkdir(assetDirectory, { recursive: true });
  await writeFile(outsideAsset, 'body { color: red; }', 'utf8');

  try {
    await symlink(outsideAsset, escapedAsset, 'file');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      t.skip(`Symlink creation is not permitted: ${error.code}`);
      return;
    }
    throw error;
  }

  const preview = await startPreviewServer({ rootDir: fixture.rootDir, port: 0, open: false });
  t.after(preview.close);
  const response = await fetch(`${preview.url}/assets/cv/escaped.css`);

  assert.equal(response.status, 404);
});

test('closes already-created watchers when a later watcher setup fails', async (t) => {
  const fixture = await makeSiteFixture({ cv: validCvConfig() });
  t.after(fixture.cleanup);
  const setupFailure = new Error('watcher setup failed');
  let attempts = 0;
  let closed = 0;

  await assert.rejects(async () => {
    const preview = await startPreviewServer({
      rootDir: fixture.rootDir,
      port: 0,
      watcherFactory: () => {
        attempts += 1;
        if (attempts === 2) throw setupFailure;
        return { close: () => { closed += 1; } };
      }
    });
    t.after(preview.close);
  }, setupFailure);

  assert.equal(closed, 1);
});

test('shuts down the preview and exposes watcher runtime errors', async (t) => {
  const fixture = await makeSiteFixture({ cv: validCvConfig() });
  t.after(fixture.cleanup);
  const watchers = [];
  const preview = await startPreviewServer({
    rootDir: fixture.rootDir,
    port: 0,
    watcherFactory: (_directory, { onChange, onError }) => {
      const watcher = new EventEmitter();
      watcher.close = () => { watcher.closed = true; };
      watcher.on('change', onChange);
      watcher.on('error', onError);
      watchers.push(watcher);
      return watcher;
    }
  });
  t.after(preview.close);

  const failure = new Error('watcher runtime failure');
  watchers[0].emit('error', failure);
  await waitFor(() => preview.closed && preview.error === failure);

  assert.ok(watchers.every((watcher) => watcher.closed));
  await assert.rejects(fetch(`${preview.url}/cv/en/`));
});

test('opens only when explicitly requested through an injected helper', async (t) => {
  const fixture = await makeSiteFixture({ cv: validCvConfig() });
  t.after(fixture.cleanup);
  const opened = [];
  const openBrowser = async (url) => { opened.push(url); };

  const importedPreview = await startPreviewServer({
    rootDir: fixture.rootDir,
    port: 0,
    openBrowser
  });
  t.after(importedPreview.close);
  assert.deepEqual(opened, []);

  const requestedPreview = await startPreviewServer({
    rootDir: fixture.rootDir,
    port: 0,
    open: true,
    openBrowser
  });
  t.after(requestedPreview.close);

  assert.deepEqual(opened, [`${requestedPreview.url}/cv/en/`]);
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

async function readPage(url, language) {
  const response = await fetch(`${url}/cv/${language}/`);
  assert.equal(response.status, 200);
  return response.text();
}

function embeddedVersion(html) {
  const match = /let cvVersion = (\d+);/.exec(html);
  assert.ok(match, 'expected the preview page to embed a refresh version');
  return match[1];
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

async function waitFor(check) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('condition did not become true');
}
