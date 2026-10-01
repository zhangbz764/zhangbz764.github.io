import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCvModels } from '../../scripts/cv/lib/model.mjs';
import { renderCvFragment, renderStandalonePage } from '../../scripts/cv/lib/html.mjs';
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

test('publication citations append language-specific indexing notes', async () => {
  const models = await buildCvModels(process.cwd());
  const enHtml = renderCvFragment(models.en);
  const zhHtml = renderCvFragment(models.zh);

  assert.match(enHtml, /DOI: CNKI<\/a> <span class="cv-indexing">\(CSSCI, CSCD, Peking University Core Journal\)<\/span>\./);
  assert.match(zhHtml, /DOI: CNKI<\/a> <span class="cv-indexing">\(CSSCI, CSCD, 北大核心\)<\/span>\./);
  assert.match(enHtml, /EI-indexed conference paper/);
  assert.match(zhHtml, /EI会议/);
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

test('Chinese teaching entries use localized CV title and location fields', async () => {
  const { zh } = await buildCvModels(process.cwd());
  const html = renderCvFragment(zh);

  assert.match(html, /2024年秋季研究生建筑设计课题“基于数字技术的佛罗伦萨弗兰基球场周边城市更新”/);
  assert.match(html, /东南大学；佛罗伦萨大学/);
  assert.doesNotMatch(html, /TA for Master&#39;s Architectural Design Program/);
  assert.doesNotMatch(html, /SIMForms论文报告与青年CAADRIA奖/);
});

test('project titles use title in English and subtitle in Chinese', async () => {
  const models = await buildCvModels(process.cwd());

  const enHtml = renderCvFragment(models.en);
  const zhHtml = renderCvFragment(models.zh);

  assert.match(enHtml, /Shopping Centre Layout Generator/);
  assert.doesNotMatch(enHtml, /购物中心平面布局生成工具/);
  assert.match(zhHtml, /购物中心平面布局生成工具/);
  assert.doesNotMatch(zhHtml, /Shopping Centre Layout Generator/);
});

test('project links use localized labels on the role metadata line', async () => {
  const models = await buildCvModels(process.cwd());
  const enHtml = renderCvFragment(models.en);
  const zhHtml = renderCvFragment(models.zh);

  assert.equal((enHtml.match(/class="cv-project-link"/g) ?? []).length, 4);
  assert.equal((zhHtml.match(/class="cv-project-link"/g) ?? []).length, 4);
  assert.match(enHtml, /Core Developer[^<]*· <a class="cv-project-link" href="https:\/\/web\.archialgo\.com\/simforms"[^>]*>Link<\/a>/);
  assert.match(zhHtml, /核心开发者[^<]*· <a class="cv-project-link" href="https:\/\/web\.archialgo\.com\/simforms"[^>]*>链接<\/a>/);
});

test('indexing annotations use muted medium italic styling', async () => {
  const css = await readFile(new URL('../../assets/cv/cv.css', import.meta.url), 'utf8');
  const rule = css.match(/\.cv-indexing\s*\{([^}]+)\}/)?.[1] ?? '';

  assert.match(rule, /color:\s*var\(--cv-muted\)/);
  assert.match(rule, /font-weight:\s*500/);
  assert.match(rule, /font-style:\s*italic/);
});

test('print sheet uses wider balanced content margins', async () => {
  const css = await readFile(new URL('../../assets/cv/cv.css', import.meta.url), 'utf8');
  const printCss = css.slice(css.indexOf('@media print'));
  const sheetRule = printCss.match(/\.cv-sheet\s*\{([^}]+)\}/)?.[1] ?? '';

  assert.match(sheetRule, /padding:\s*13mm 12mm/);
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

test('standalone pages apply a concrete base path to internal CV and asset links', async () => {
  const { en } = await buildCvModels(process.cwd());
  const html = renderStandalonePage(en, { basePath: '/portfolio/' });

  assert.match(html, /href="\/portfolio\/assets\/cv\/cv\.css"/);
  assert.match(html, /href="\/portfolio\/cv\/zh\/"/);
  assert.match(html, /href="\/portfolio\/assets\/cv\/zhang-baizhou-cv-en\.pdf"/);
  assert.doesNotMatch(html, /href="\/assets\/cv\//);
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
  assert.match(enHtml, /href="\{\{ site\.baseurl \}\}\/cv\/zh\/"/);
  assert.match(enHtml, /href="\{\{ site\.baseurl \}\}\/assets\/cv\/zhang-baizhou-cv-en\.pdf"/);
  assert.match(zhHtml, /href="\{\{ site\.baseurl \}\}\/cv\/en\/"/);
});
