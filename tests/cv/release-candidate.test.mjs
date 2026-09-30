import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import { chromium } from 'playwright';
import YAML from 'yaml';
import { renderStandalonePage } from '../../scripts/cv/lib/html.mjs';
import { buildCvModels } from '../../scripts/cv/lib/model.mjs';

const APPROVED_SECTIONS = [
  'profile', 'education', 'publications', 'grants', 'awards',
  'patents', 'projects', 'teaching', 'service'
];

const ROUTES = {
  en: { file: 'cv-en.html', permalink: '/cv/en/', lang: 'en' },
  zh: { file: 'cv-zh.html', permalink: '/cv/zh/', lang: 'zh-CN' }
};

const DOWNLOADS = {
  en: [
    '/assets/cv/zhang-baizhou-cv-en.pdf',
    '/assets/cv/zhang-baizhou-cv-en.docx'
  ],
  zh: [
    '/assets/cv/zhang-baizhou-cv-zh.pdf',
    '/assets/cv/zhang-baizhou-cv-zh.docx'
  ]
};

const CONTACT = {
  email: 'zhang_baizhou@seu.edu.cn',
  website: 'https://zhangbz764.github.io',
  orcid: '0000-0003-3153-2264',
  location: { en: 'Nanjing, Jiangsu, China', zh: '中国 江苏 南京' }
};

test('release previews preserve routes, content, privacy, and source citations', async (t) => {
  const rootDir = process.cwd();
  const [models, cvSource, routeSources] = await Promise.all([
    buildCvModels(rootDir),
    readYaml(join(rootDir, '_data', 'cv.yml')),
    Promise.all(Object.values(ROUTES).map(({ file }) =>
      readFrontMatter(join(rootDir, '_pages', file))))
  ]);

  assert.deepEqual(cvSource.section_order, APPROVED_SECTIONS);
  assert.deepEqual(cvSource.contact, CONTACT);
  assert.equal(Object.hasOwn(cvSource.contact, 'phone'), false);
  assert.equal(cvSource.languages.en.show_photo, false);
  assert.equal(cvSource.languages.zh.show_photo, false);

  const publicationIds = cvSource.collections.publications.items.map(({ id }) => id);
  assert.equal(publicationIds.length, 5);
  const publicationSources = await Promise.all(publicationIds.map((id) =>
    readFrontMatter(join(rootDir, '_publications', `${id}.md`))));
  const sourceAuthors = publicationSources.map(({ authors, cv }) => ({
    en: authors,
    zh: cv?.authors_zh
      ? cv.authors_zh.split(/[,，]/).map((author) => author.trim()).filter(Boolean)
      : authors
  }));
  assert.equal(cvSource.section_order.includes('presentations'), false);

  const browser = await chromium.launch();
  t.after(() => browser.close());
  const foundDownloads = [];

  for (const [index, [language, route]] of Object.entries(ROUTES).entries()) {
    const model = models[language];
    const routeSource = routeSources[index];
    assert.deepEqual(
      {
        permalink: routeSource.permalink,
        lang: routeSource.lang,
        cv_language: routeSource.cv_language,
        cv_page: routeSource.cv_page
      },
      { permalink: route.permalink, lang: route.lang, cv_language: language, cv_page: true }
    );
    assert.deepEqual(model.sections.map(({ id }) => id), APPROVED_SECTIONS);
    assert.equal(model.sections.some(({ id }) => id === 'presentations'), false);

    const publications = model.sections.find(({ id }) => id === 'publications').items;
    assert.equal(publications.length, 5);
    assert.deepEqual(publications.map(({ authors }) => authors), sourceAuthors.map((authors) => authors[language]));

    const page = await browser.newPage();
    await page.setContent(renderStandalonePage(model));
    const rendered = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      sections: [...document.querySelectorAll('.cv-section')]
        .map((section) => section.dataset.section),
      publications: [...document.querySelectorAll('.cv-publication p')]
        .map((publication) => publication.textContent.trim()),
      awards: [...document.querySelectorAll('.cv-award')].map((award) => ({
        issuerCount: award.querySelectorAll('.cv-award-issuer').length,
        issuer: award.querySelector('.cv-award-issuer')?.textContent.trim() ?? ''
      })),
      contactText: document.querySelector('.cv-contact')?.textContent ?? '',
      contactLinks: [...document.querySelectorAll('.cv-contact a')]
        .map((link) => link.getAttribute('href')),
      bodyText: document.body.textContent ?? '',
      privateMediaCount: document.querySelectorAll(
        'img, picture, [class*="photo"], [class*="portrait"], [class*="phone"]'
      ).length,
      downloads: [...document.querySelectorAll('.cv-download')].map((link) => ({
        href: link.getAttribute('href'),
        name: link.getAttribute('href')?.split('/').at(-1),
        downloadable: link.hasAttribute('download')
      }))
    }));
    await page.close();

    assert.equal(rendered.lang, route.lang);
    assert.deepEqual(rendered.sections, APPROVED_SECTIONS);
    assert.equal(rendered.publications.length, 5);
    rendered.publications.forEach((citation, publicationIndex) => {
      assert.ok(
        citation.startsWith(`${sourceAuthors[publicationIndex][language].join(', ')}. (`),
        `${language} citation ${publicationIndex + 1} must preserve source author spelling and order`
      );
    });
    assert.equal(rendered.awards.length, model.sections.find(({ id }) => id === 'awards').items.length);
    assert.ok(rendered.awards.every(({ issuerCount, issuer }) => issuerCount === 1 && issuer.length > 0));
    assert.equal(rendered.privateMediaCount, 0);
    assert.doesNotMatch(rendered.bodyText, /\b(?:phone|telephone|mobile)\b|电话|手机/i);
    assert.match(rendered.contactText, new RegExp(escapeRegExp(CONTACT.email)));
    assert.match(rendered.contactText, new RegExp(escapeRegExp(CONTACT.website)));
    assert.match(rendered.contactText, new RegExp(escapeRegExp(CONTACT.orcid)));
    assert.match(rendered.contactText, new RegExp(escapeRegExp(CONTACT.location[language])));
    assert.deepEqual(rendered.contactLinks, [
      `mailto:${CONTACT.email}`,
      CONTACT.website,
      `https://orcid.org/${CONTACT.orcid}`
    ]);
    assert.deepEqual(rendered.downloads, DOWNLOADS[language].map((href) => ({
      href,
      name: href.split('/').at(-1),
      downloadable: true
    })));
    if (language === 'zh') {
      assert.match(rendered.bodyText, /2024年秋季研究生建筑设计课题“基于数字技术的佛罗伦萨弗兰基球场周边城市更新”/);
      assert.doesNotMatch(rendered.bodyText, /SIMForms论文报告与青年CAADRIA奖/);
      assert.doesNotMatch(rendered.bodyText, /Papers Presented at CAADRIA 2025/);
    }
    foundDownloads.push(...rendered.downloads.map(({ href }) => href));
  }

  assert.deepEqual(foundDownloads.sort(), Object.values(DOWNLOADS).flat().sort());
});

async function readYaml(path) {
  return YAML.parse(await readFile(path, 'utf8'));
}

async function readFrontMatter(path) {
  const source = await readFile(path, 'utf8');
  return matter(source.replace(/\r\n?/g, '\n'), { engines: { yaml: YAML.parse } }).data;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
