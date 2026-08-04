import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCvModels } from '../../scripts/cv/lib/model.mjs';
import { renderCvFragment } from '../../scripts/cv/lib/html.mjs';
import { prepareCv } from '../../scripts/cv/prepare.mjs';
import { makeSiteFixture, validCvConfig } from './helpers.mjs';

test('English fragment renders five publications and public contact fields', async () => {
  const { en } = await buildCvModels(process.cwd());
  const html = renderCvFragment(en);
  assert.match(html, /Website:\s*https:\/\/zhangbz764\.github\.io/);
  assert.match(html, /0000-0003-3153-2264/);
  assert.doesNotMatch(html, /Phone|Telephone/);
  assert.equal((html.match(/class="cv-publication"/g) ?? []).length, 5);
});

test('awards render an issuer and sections follow configured order', async () => {
  const { en } = await buildCvModels(process.cwd());
  const html = renderCvFragment(en);
  const awards = en.sections.find(({ id }) => id === 'awards').items;
  const issuerElements = [...html.matchAll(/<span class="cv-award-issuer">([^<]+)<\/span>/g)];
  assert.doesNotMatch(html, /class="cv-award"[^>]*>\s*<\/li>/);
  assert.equal(issuerElements.length, awards.length);
  assert.deepEqual(issuerElements.map((match) => match[1]), awards.map(({ issuer }) => issuer));
  assert.ok(html.indexOf('Selected Publications') < html.indexOf('Research Grants'));
  assert.ok(html.indexOf('Research Grants') < html.indexOf('Awards & Honors'));
});

test('Chinese fragment declares Chinese content and links to English', async () => {
  const { zh } = await buildCvModels(process.cwd());
  const html = renderCvFragment(zh);
  assert.match(html, /data-cv-language="zh"/);
  assert.match(html, /href="\/cv\/en\/"/);
  assert.match(html, /个人简历/);
});

test('each language fragment links to its exact PDF and DOCX paths', async () => {
  const { en, zh } = await buildCvModels(process.cwd());
  const enHtml = renderCvFragment(en);
  const zhHtml = renderCvFragment(zh);

  assert.match(enHtml, /href="\/assets\/cv\/zhang-baizhou-cv-en\.pdf" download/);
  assert.match(enHtml, /href="\/assets\/cv\/zhang-baizhou-cv-en\.docx" download/);
  assert.match(zhHtml, /href="\/assets\/cv\/zhang-baizhou-cv-zh\.pdf" download/);
  assert.match(zhHtml, /href="\/assets\/cv\/zhang-baizhou-cv-zh\.docx" download/);
  assert.doesNotMatch(enHtml, /zhang-baizhou-cv-zh\.(?:pdf|docx)/);
  assert.doesNotMatch(zhHtml, /zhang-baizhou-cv-en\.(?:pdf|docx)/);
});

test('uses two explicit sheets with awards starting page two', async () => {
  const { en } = await buildCvModels(process.cwd());
  const html = renderCvFragment(en);
  assert.equal((html.match(/class="cv-sheet"/g) ?? []).length, 2);
  const pageOneEnd = html.indexOf('</div>', html.indexOf('Research Grants'));
  const pageTwo = html.indexOf('class="cv-sheet"', pageOneEnd);
  assert.ok(html.indexOf('Awards & Honors') > pageTwo);
});

test('escapes model data and emphasizes only exact author aliases', () => {
  const model = {
    language: 'en',
    settings: { page_limit: 2 },
    contact: {
      name: '<Zhang>',
      role: 'Research & Design',
      email: 'test@example.com',
      website: 'https://example.com/?a=1&b=2',
      orcid: '0000-0000-0000-0000',
      location: 'Nanjing <China>'
    },
    profile: 'Safe <script>alert(1)</script>',
    author_aliases: ['Baizhou Zhang'],
    sections: [
      { id: 'profile', label: 'Profile', items: 'Safe <script>alert(1)</script>' },
      { id: 'education', label: 'Education', items: [] },
      {
        id: 'publications',
        label: 'Publications',
        items: [{
          authors: ['Baizhou Zhang', 'Baizhou Zhang-Smith'],
          title: 'A <b>title</b>',
          source: 'Journal & Review',
          cv: { year: 2025 }
        }]
      },
      { id: 'grants', label: 'Grants', items: [] },
      { id: 'awards', label: 'Awards', items: [] }
    ]
  };

  const html = renderCvFragment(model);
  assert.doesNotMatch(html, /<script>|<b>title/);
  assert.match(html, /Safe &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<strong class="cv-owner-name">Baizhou Zhang<\/strong>, Baizhou Zhang-Smith/);
});

test('renders unsafe data-derived URLs as non-clickable text', () => {
  const model = {
    language: 'en',
    contact: {
      name: 'Baizhou Zhang',
      email: 'javascript:alert(1)',
      website: 'javascript:alert(2)',
      orcid: '0000-0000-0000-0000'
    },
    author_aliases: [],
    sections: [
      {
        id: 'publications',
        label: 'Publications',
        items: [
          { title: 'Unsafe data link', DOI: 'data', DOI_link: 'data:text/html,<script>alert(3)</script>' },
          { title: 'Unsafe HTTP link', DOI: 'http', DOI_link: 'http://example.com/paper' }
        ]
      },
      { id: 'grants', label: 'Grants', items: [] },
      { id: 'awards', label: 'Awards', items: [] }
    ]
  };

  const html = renderCvFragment(model);
  assert.doesNotMatch(html, /href="(?:javascript:|data:|http:|mailto:javascript:)/i);
  assert.match(html, /Website: javascript:alert\(2\)/);
  assert.match(html, /DOI: data/);
  assert.match(html, /DOI: http/);
});

test('prepare writes both generated fragments and normalized models', async (t) => {
  const fixture = await makeSiteFixture({ cv: validCvConfig() });
  t.after(fixture.cleanup);

  await prepareCv(fixture.rootDir);

  const enHtml = await readFile(join(fixture.rootDir, '_includes', 'generated', 'cv-en.html'), 'utf8');
  const zhHtml = await readFile(join(fixture.rootDir, '_includes', 'generated', 'cv-zh.html'), 'utf8');
  const enModel = JSON.parse(await readFile(join(fixture.rootDir, '.cv-build', 'models', 'en.json'), 'utf8'));
  const zhModel = JSON.parse(await readFile(join(fixture.rootDir, '.cv-build', 'models', 'zh.json'), 'utf8'));
  assert.match(enHtml, /data-cv-language="en"/);
  assert.match(zhHtml, /data-cv-language="zh"/);
  assert.equal(enModel.language, 'en');
  assert.equal(zhModel.language, 'zh');
});
