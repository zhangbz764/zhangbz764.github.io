# Bilingual Academic CV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build bilingual academic CV preview pages whose PDF and editable DOCX downloads are generated from one validated YAML-driven data model and deployed with the Jekyll site through GitHub Actions.

**Architecture:** A small Node.js CV pipeline reads `_data/cv.yml` plus selected Jekyll collection front matter, validates and normalizes English and Chinese models, and renders shared HTML fragments. Jekyll wraps those fragments in the existing site layout, `docx` renders editable Word files from the same models, and Playwright prints the built preview pages to PDF. A custom GitHub Pages workflow runs the complete pipeline and deploys `_site`.

**Tech Stack:** Jekyll 4.3.x, Liquid, Node.js 22, Node built-in test runner, `yaml` 2.9.0, `gray-matter` 4.0.3, `docx` 9.7.1, Playwright 1.62.0, `pdf-lib` 1.17.1, GitHub Pages Actions.

## Global Constraints

- Do not add full-site i18n; existing non-CV pages remain unchanged except for navigation and language metadata support.
- Keep the default English and Chinese CVs photo-free and phone-free.
- Include email, `Website: https://zhangbz764.github.io`, ORCID `0000-0003-3153-2264`, and location.
- Keep the same selected entries and section order in both languages.
- Limit selected publications to at most five.
- Require an awarding organization for every displayed award.
- Target two A4 PDF pages by default; fail clearly when the configured limit is exceeded.
- Keep DOCX output clean and editable; it does not need to reproduce the PDF pixel-for-pixel.
- Preserve official publication titles, author order, and author spelling; emphasize the matching owner alias without rewriting citations.
- Do not store generated PDF, DOCX, normalized JSON, or generated HTML fragments in Git.
- Do not modify or commit the untracked 2026 publication entries unless a later task explicitly selects one.

## File Structure

### Source And Configuration

- `_data/cv.yml`: primary user-editable content, selection, ordering, and page-limit configuration.
- `_publications/*.md`: authoritative publication and patent metadata; optional `cv` fields hold citation-only additions.
- `_projects/*.md`: authoritative project metadata; optional `cv` fields hold bilingual role and contribution text.
- `_activities/*.md`: authoritative activity metadata; optional `cv` fields hold teaching/presentation-specific text.

### CV Pipeline

- `scripts/cv/lib/model.mjs`: load, validate, resolve references, and normalize bilingual `CvModel` objects.
- `scripts/cv/lib/html.mjs`: render a `CvModel` to the shared CV HTML fragment and standalone preview shell.
- `scripts/cv/lib/docx.mjs`: render a `CvModel` to a DOCX `Buffer`.
- `scripts/cv/lib/pdf.mjs`: print built CV pages and validate PDF page count.
- `scripts/cv/lib/server.mjs`: minimal static server used by local preview and PDF rendering.
- `scripts/cv/check.mjs`: validate source data only.
- `scripts/cv/prepare.mjs`: write generated Jekyll include fragments and normalized JSON.
- `scripts/cv/preview.mjs`: start the CV-only local authoring preview.
- `scripts/cv/artifacts.mjs`: generate PDF and DOCX files into `_site/assets/cv`.
- `scripts/cv/build.mjs`: run prepare, Jekyll build, and artifact generation locally.

### Site Integration

- `_pages/cv-en.html`: English CV route and generated-fragment include.
- `_pages/cv-zh.html`: Chinese CV route and generated-fragment include.
- `_layouts/cv.html`: CV toolbar, language switch, and download controls inside the existing default layout.
- `_includes/generated/cv-en.html`: ignored generated English fragment.
- `_includes/generated/cv-zh.html`: ignored generated Chinese fragment.
- `assets/cv/cv.css`: shared screen and print styling for Jekyll and local preview.
- `_includes/head.html`: load CV CSS only for CV pages.
- `_layouts/default.html`: set `<html lang>` from page front matter.
- `_includes/navigation.html`: add the CV navigation item.

### Tests And Automation

- `tests/cv/helpers.mjs`: create isolated temporary site fixtures.
- `tests/cv/model.test.mjs`: schema, limits, reference resolution, language normalization, and real-data tests.
- `tests/cv/html.test.mjs`: semantic HTML, labels, ordering, and link tests.
- `tests/cv/docx.test.mjs`: DOCX buffer and file-output tests.
- `tests/cv/pdf.test.mjs`: PDF page-limit tests.
- `tests/cv/preview.test.mjs`: local preview route and refresh-version tests.
- `.github/workflows/pages.yml`: validate, build, generate artifacts, and deploy GitHub Pages.
- `package.json` and `package-lock.json`: exact Node dependencies and authoring commands.
- `.ruby-version` and `Gemfile.lock`: reproducible Jekyll runtime.
- `.gitignore`: generated output, local preview, Node dependency, and visual-companion exclusions.

---

### Task 1: Establish The Validated CV Data Model

**Files:**
- Create: `package.json`
- Create mechanically: `package-lock.json`
- Create: `scripts/cv/lib/model.mjs`
- Create: `scripts/cv/check.mjs`
- Create: `tests/cv/helpers.mjs`
- Create: `tests/cv/model.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `buildCvModels(rootDir: string): Promise<{ en: CvModel, zh: CvModel }>`.
- Produces: `CvValidationError` with a stable `issues: string[]` property.
- `CvModel` contains `language`, `settings`, `contact`, `profile`, and an ordered `sections` array.
- Later renderers consume only normalized `CvModel` objects and never parse YAML directly.

- [ ] **Step 1: Add the Node project manifest and generated-file exclusions**

Create `package.json` with exact versions:

```json
{
  "name": "zhangbz764-academic-site",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22 <23"
  },
  "scripts": {
    "test": "node --test tests/cv/*.test.mjs",
    "test:cv": "node --test tests/cv/*.test.mjs",
    "cv:check": "node scripts/cv/check.mjs",
    "cv:prepare": "node scripts/cv/prepare.mjs",
    "cv:preview": "node scripts/cv/preview.mjs",
    "cv:artifacts": "node scripts/cv/artifacts.mjs",
    "cv:build": "node scripts/cv/build.mjs"
  },
  "dependencies": {
    "docx": "9.7.1",
    "gray-matter": "4.0.3",
    "pdf-lib": "1.17.1",
    "playwright": "1.62.0",
    "yaml": "2.9.0"
  }
}
```

Append these entries to `.gitignore` while preserving the existing lines:

```gitignore
node_modules/
.cv-build/
_includes/generated/
.superpowers/
```

Run `npm install` to create `package-lock.json` from the exact versions above.

- [ ] **Step 2: Write model tests that fail before the loader exists**

Create `tests/cv/helpers.mjs` with `makeSiteFixture({ cv, publications, projects, activities })`. It must create a temporary root containing `_data/cv.yml` and collection files, serialize `cv` with `YAML.stringify`, and return the root path plus a cleanup function.

Create `tests/cv/model.test.mjs` with these cases:

```js
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
```

`validCvConfig()` must contain all ten approved section IDs, bilingual profile/contact fields, one award with an issuer, `page_limit: 2`, empty collection selections, and both photo flags set to false.

- [ ] **Step 3: Run the model tests and verify the expected failure**

Run:

```powershell
npm run test:cv -- --test-name-pattern="builds matching|rejects"
```

Expected: FAIL because `scripts/cv/lib/model.mjs` does not exist.

- [ ] **Step 4: Implement the loader, resolver, normalizer, and validation error**

Implement `scripts/cv/lib/model.mjs` with this public shape:

```js
export class CvValidationError extends Error {
  constructor(issues) {
    super(`CV validation failed:\n- ${issues.join('\n- ')}`);
    this.name = 'CvValidationError';
    this.issues = issues;
  }
}

export async function buildCvModels(rootDir) {
  const source = await loadSource(rootDir);
  const issues = validateSource(source);
  if (issues.length) throw new CvValidationError(issues);
  return {
    en: normalizeLanguage(source, 'en'),
    zh: normalizeLanguage(source, 'zh')
  };
}
```

Implementation requirements:

- Parse `_data/cv.yml` with `YAML.parse`.
- Read files in `_publications`, `_projects`, and `_activities` with `readdir` and parse front matter using `gray-matter` configured with the same YAML parser.
- Use each filename without its final extension as its stable collection ID; extensionless files remain readable but are not selected unless explicitly referenced.
- Preserve the order of every `items` array from `_data/cv.yml`.
- Reject duplicate IDs within a section.
- Accept only `full` and `compact` detail levels.
- Validate the exact approved section IDs: `profile`, `education`, `publications`, `grants`, `awards`, `patents`, `projects`, `teaching`, `presentations`, `service`.
- Resolve bilingual objects with `{ en, zh }` at normalization time.
- Keep official publication title, authors, source, DOI, and date unchanged across languages.
- Set `settings.publication_count` from the resolved publication selection and `settings.page_limit` from the YAML value.
- Return all validation issues together instead of stopping at the first one.

Create `scripts/cv/check.mjs`:

```js
import { buildCvModels } from './lib/model.mjs';

try {
  const models = await buildCvModels(process.cwd());
  console.log(`CV data valid: ${models.en.sections.length} sections, ${models.en.settings.publication_count} selected publications.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
```

- [ ] **Step 5: Run tests and the data checker**

Run:

```powershell
npm run test:cv
```

Expected: all Task 1 tests PASS. `npm run cv:check` may still fail with a clear missing `_data/cv.yml` message until Task 2; this is expected and must not be hidden.

- [ ] **Step 6: Commit the data-model foundation**

```powershell
git add .gitignore package.json package-lock.json scripts/cv/lib/model.mjs scripts/cv/check.mjs tests/cv
git commit -m "Add validated CV data model"
```

---

### Task 2: Add The Real CV Configuration And Collection Metadata

**Files:**
- Create: `_data/cv.yml`
- Modify: five selected files in `_publications/`
- Modify: selected files in `_projects/`
- Modify: selected files in `_activities/`
- Modify: `tests/cv/model.test.mjs`

**Interfaces:**
- Consumes: `buildCvModels(rootDir)` from Task 1.
- Produces: the initial real English and Chinese `CvModel` content used by every renderer.
- Selection IDs exactly match collection filename stems.

- [ ] **Step 1: Add a failing real-repository contract test**

Append to `tests/cv/model.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```powershell
node --test --test-name-pattern="real CV config" tests/cv/model.test.mjs
```

Expected: FAIL because `_data/cv.yml` is absent.

- [ ] **Step 3: Create the central YAML editing surface**

Create `_data/cv.yml` with this top-level schema and approved defaults:

```yaml
version: 1
page_limit: 2
section_order:
  - profile
  - education
  - publications
  - grants
  - awards
  - patents
  - projects
  - teaching
  - presentations
  - service

contact:
  email: zhang_baizhou@seu.edu.cn
  website: https://zhangbz764.github.io
  orcid: 0000-0003-3153-2264
  location:
    en: Nanjing, China
    zh: 中国南京

author_aliases:
  - ZHANG Baizhou
  - Baizhou Zhang
  - 张柏洲

languages:
  en:
    name: ZHANG Baizhou
    role: PhD Candidate · Computational Design
    profile: >-
      PhD candidate at the School of Architecture, Southeast University.
      Research focuses on computational design, generative design, and AI
      applications in architecture, with particular interest in typology-based
      urban form generation and data-driven design workflows.
    show_photo: false
  zh:
    name: 张柏洲
    role: 博士研究生 · 建筑计算性设计
    profile: >-
      东南大学建筑学院博士研究生，主要研究建筑计算性设计、生成式设计及人工智能在建筑学中的应用，
      关注基于类型学的城市形态生成与数据驱动设计工作流。
    show_photo: false

collections:
  publications:
    limit: 5
    items:
      - id: 2025-06-10-web-tool-studio
        detail: compact
      - id: 2025-03-26-topological-encoding-street
        detail: compact
      - id: 2025-03-28-reusable-voxelized-formwork
        detail: compact
      - id: 2024-04-23-simforms
        detail: compact
      - id: 2023-01-31-urban-block-generative-cbr
        detail: compact
  patents:
    items:
      - id: 2025-04-04-moire-wall-patent
        detail: compact
      - id: 2021-02-09-uhpc-patent
        detail: compact
  projects:
    items:
      - id: 2024-11-13-flexurban
        detail: full
      - id: 2023-10-12-simforms
        detail: full
      - id: 2024-03-05-anysite
        detail: compact
  teaching:
    items:
      - id: 2025-01-11-ta-firenze
        detail: compact
      - id: 2025-01-08-ta-biao-urban
        detail: compact
      - id: 2024-04-14-ta-biao-school
        detail: compact
  presentations:
    items:
      - id: 2025-03-28-caadria2025
        detail: compact
      - id: 2024-04-23-caadria2024
        detail: compact

education:
  - period: { en: "2022 - Present", zh: "2022 - 至今" }
    degree: { en: "PhD Candidate, Architecture", zh: "建筑学博士研究生" }
    institution: { en: "School of Architecture, Southeast University", zh: "东南大学建筑学院" }
  - period: { en: "2020 - 2022", zh: "2020 - 2022" }
    degree: { en: "Master's-stage Study, Integrated Master-PhD Track", zh: "硕士阶段学习，硕博贯通培养" }
    institution: { en: "School of Architecture, Southeast University", zh: "东南大学建筑学院" }
  - period: { en: "2015 - 2020", zh: "2015 - 2020" }
    degree: { en: "Bachelor of Architecture", zh: "建筑学学士" }
    institution: { en: "School of Architecture, Southeast University", zh: "东南大学建筑学院" }
```

Continue the same file with the three grants and the awards currently listed in `_pages/about.md`. Every award must use this exact shape:

```yaml
awards:
  - year: 2025
    title:
      en: Southeast University “Zhishan” Scholarship for PhD Students
      zh: 东南大学博士研究生至善奖学金
    issuer:
      en: Southeast University
      zh: 东南大学
```

Add `service.reviewers` containing the five journal/conference names currently under Peer Review Activities. Add bilingual section labels under `labels`, including `Selected Publications`, `Research Grants`, `Awards & Honors`, `Patents & Intellectual Property`, `Selected Research Projects`, `Teaching Experience`, `Academic Presentations`, and `Academic Service`.

- [ ] **Step 4: Add CV-only metadata beside selected collection entries**

For each selected project, add front matter with this shape, using the actual personal role and a one-sentence contribution grounded in the existing page body:

```yaml
cv:
  role:
    en: Main contributor
    zh: 主要贡献者
  contribution:
    en: Developed the typology-based generation workflow and interactive design logic.
    zh: 负责基于类型学的生成流程与交互式设计逻辑开发。
```

For selected publications, add only missing citation fields, for example:

```yaml
cv:
  volume:
  issue:
  pages:
  author_note:
```

Do not change existing `authors`, `title`, or publication-specific name spelling. For selected activities, add a bilingual `cv.role` and, for presentations, a bilingual `cv.presentation_type`.

- [ ] **Step 5: Run validation and real-data tests**

Run:

```powershell
npm run cv:check
npm run test:cv
```

Expected: validation reports 10 sections and 5 selected publications; all model tests PASS.

- [ ] **Step 6: Commit the initial CV content**

Stage only `_data/cv.yml`, the deliberately edited selected collection files, and the real-data test. Do not stage the untracked 2026 files.

```powershell
git add _data/cv.yml tests/cv/model.test.mjs
git add _publications/2025-06-10-web-tool-studio.md _publications/2025-03-26-topological-encoding-street.md _publications/2025-03-28-reusable-voxelized-formwork.md _publications/2024-04-23-simforms.md _publications/2023-01-31-urban-block-generative-cbr.md
git add _publications/2025-04-04-moire-wall-patent.md _publications/2021-02-09-uhpc-patent.md
git add _projects/2024-11-13-flexurban.md _projects/2023-10-12-simforms.md _projects/2024-03-05-anysite.md
git add _activities/2025-01-11-ta-firenze.md _activities/2025-01-08-ta-biao-urban.md _activities/2024-04-14-ta-biao-school.md _activities/2025-03-28-caadria2025.md _activities/2024-04-23-caadria2024.md
git diff --cached --name-only
git commit -m "Add bilingual academic CV content"
```

Before committing, confirm the cached name list does not contain `_publications/2026-10-20-wanggu-icomos` or `_publications/2026-12-31-flexurban`.

---

### Task 3: Render The CV HTML And Integrate It With Jekyll

**Files:**
- Create: `scripts/cv/lib/html.mjs`
- Create: `scripts/cv/prepare.mjs`
- Create: `tests/cv/html.test.mjs`
- Create: `_pages/cv-en.html`
- Create: `_pages/cv-zh.html`
- Create: `_layouts/cv.html`
- Create: `assets/cv/cv.css`
- Modify: `_includes/head.html`
- Modify: `_layouts/default.html`
- Modify: `_includes/navigation.html`

**Interfaces:**
- Consumes: `CvModel` from Task 1.
- Produces: `renderCvFragment(model: CvModel): string`.
- Produces: `renderStandalonePage(model: CvModel, options): string` for Task 4.
- `prepare.mjs` writes `_includes/generated/cv-en.html`, `_includes/generated/cv-zh.html`, `.cv-build/models/en.json`, and `.cv-build/models/zh.json`.

- [ ] **Step 1: Write failing semantic HTML tests**

Create `tests/cv/html.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCvModels } from '../../scripts/cv/lib/model.mjs';
import { renderCvFragment } from '../../scripts/cv/lib/html.mjs';

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
  assert.doesNotMatch(html, /class="cv-award"[^>]*>\s*<\/li>/);
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
```

- [ ] **Step 2: Run the HTML tests and verify they fail**

Run:

```powershell
node --test tests/cv/html.test.mjs
```

Expected: FAIL because `scripts/cv/lib/html.mjs` does not exist.

- [ ] **Step 3: Implement accessible, escaped HTML rendering**

Implement `renderCvFragment` so it:

- Escapes all YAML/front-matter text before interpolation.
- Renders a `.cv-toolbar` containing an EN/中文 segmented switch and PDF/DOCX links.
- Uses semantic `<article>`, `<header>`, `<section>`, `<h1>`, `<h2>`, `<ol>`, and `<ul>` elements.
- Adds stable classes such as `.cv-publication`, `.cv-award`, `.cv-entry`, `.cv-period`, and `.cv-entry-body`.
- Applies `<strong class="cv-owner-name">` only around an exact token listed in `author_aliases`, preserving the selected publication's original spelling.
- Uses full absolute download routes from the design spec.
- Adds `rel="noopener noreferrer"` only to external links opened in a new tab.
- Omits empty optional values without leaving punctuation artifacts.

The toolbar structure must be:

```html
<div class="cv-toolbar" aria-label="CV controls">
  <div class="cv-language-switch" role="group" aria-label="Language">
    <a href="/cv/en/" aria-current="page">EN</a>
    <a href="/cv/zh/">中文</a>
  </div>
  <div class="cv-downloads">
    <a class="cv-download cv-download-primary" href="/assets/cv/zhang-baizhou-cv-en.pdf" download>PDF</a>
    <a class="cv-download" href="/assets/cv/zhang-baizhou-cv-en.docx" download>DOCX</a>
  </div>
</div>
```

`renderStandalonePage` wraps the fragment in a complete document, sets `<html lang>`, links `/assets/cv/cv.css`, and includes a small site-header approximation for local authoring only.

- [ ] **Step 4: Implement generated fragments and Jekyll routes**

Create `scripts/cv/prepare.mjs` to call `buildCvModels`, ensure `_includes/generated` and `.cv-build/models` exist, and write both language fragments and JSON models atomically.

Create `_pages/cv-en.html`:

```liquid
---
layout: cv
title: Curriculum Vitae
permalink: /cv/en/
lang: en
cv_language: en
cv_page: true
---
{% include generated/cv-en.html %}
```

Create `_pages/cv-zh.html` with `title: 个人简历`, `permalink: /cv/zh/`, `lang: zh-CN`, `cv_language: zh`, `cv_page: true`, and the Chinese include.

Create `_layouts/cv.html`:

```liquid
---
layout: default
---
<div class="cv-page" data-language="{{ page.cv_language }}">
  {{ content }}
</div>
```

Set `cv_page: true` in both page front matters and add this conditional to `_includes/head.html` after `main.css`:

```liquid
{% if page.cv_page %}
  <link rel="stylesheet" href="{{ '/assets/cv/cv.css' | relative_url }}">
{% endif %}
```

Change `_layouts/default.html` to:

```liquid
<html lang="{{ page.lang | default: 'en' }}">
```

Add `CV` after `About` in `_includes/navigation.html`, linking to `/cv/en/`. Do not add `_includes/generated` to `_config.yml`; Jekyll must read the generated fragments during the build and special underscore directories are not copied as ordinary static assets.

- [ ] **Step 5: Add the approved screen and print stylesheet**

Create `assets/cv/cv.css` with these fixed design rules:

```css
:root {
  --cv-ink: #172022;
  --cv-muted: #657074;
  --cv-line: #d9dedf;
  --cv-accent: #126b61;
  --cv-accent-soft: #e5f0ee;
}

.cv-page { max-width: 1180px; margin: 1.75rem auto 3rem; }
.cv-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.cv-language-switch { display: inline-flex; padding: 3px; border: 1px solid #cbd2d3; border-radius: 6px; }
.cv-language-switch a { min-width: 52px; padding: 0.4rem 0.7rem; text-align: center; border-radius: 4px; }
.cv-language-switch a[aria-current="page"] { color: #fff; background: var(--cv-accent); }
.cv-downloads { display: flex; gap: 0.5rem; }
.cv-download { padding: 0.55rem 0.9rem; border: 1px solid #bfc8c9; border-radius: 6px; font-weight: 700; }
.cv-download-primary { color: #fff; border-color: var(--cv-accent); background: var(--cv-accent); }
.cv-paper { width: min(100%, 210mm); margin: 0 auto; padding: 16mm 18mm; background: #fff; color: var(--cv-ink); box-shadow: 0 12px 34px rgba(33, 46, 48, 0.09); }
.cv-section { break-inside: avoid; margin-top: 1.1rem; }
.cv-entry { display: grid; grid-template-columns: 7rem 1fr; gap: 0.8rem; }
.cv-owner-name { font-weight: 800; }

@media (max-width: 600px) {
  .cv-toolbar { align-items: flex-start; flex-direction: column; }
  .cv-paper { padding: 1.5rem 1.1rem; box-shadow: none; }
  .cv-entry { grid-template-columns: 5.2rem 1fr; gap: 0.55rem; }
}

@page { size: A4; margin: 0; }
@media print {
  .nav, footer, #btn-back-to-top, .cv-toolbar { display: none !important; }
  .cv-page, .cv-paper { width: 210mm; margin: 0; padding: 0; box-shadow: none; }
  .cv-sheet { width: 210mm; min-height: 297mm; padding: 16mm 18mm; break-after: page; }
  .cv-sheet:last-child { break-after: auto; }
}
```

Complete typography and spacing to match the approved mockup, keeping body text at least 9pt in PDF and avoiding split entries. Use explicit `.cv-sheet` page containers so the approved section boundary between grants and awards remains stable.

- [ ] **Step 6: Run renderer tests and prepare generated inputs**

Run:

```powershell
npm run cv:prepare
node --test tests/cv/html.test.mjs
```

Expected: generated files exist, all HTML tests PASS, and `git status --short` does not list generated fragments or `.cv-build` because both are ignored.

- [ ] **Step 7: Commit HTML and Jekyll integration**

```powershell
git add scripts/cv/lib/html.mjs scripts/cv/prepare.mjs tests/cv/html.test.mjs _pages/cv-en.html _pages/cv-zh.html _layouts/cv.html assets/cv/cv.css _includes/head.html _layouts/default.html _includes/navigation.html
git commit -m "Add bilingual CV preview pages"
```

---

### Task 4: Add The Lightweight Local CV Preview

**Files:**
- Create: `scripts/cv/lib/server.mjs`
- Create: `scripts/cv/preview.mjs`
- Create: `tests/cv/preview.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: `buildCvModels` and `renderStandalonePage`.
- Produces: `startStaticServer({ rootDir, renderCv, port }): Promise<{ url, close }>`.
- Produces: `startPreviewServer({ rootDir, port, open }): Promise<{ url, close }>` as the CV-specific wrapper used by the command and tests.
- Preview routes: `/cv/en/`, `/cv/zh/`, `/assets/cv/cv.css`, and `/__cv_version`.

- [ ] **Step 1: Write failing preview server tests**

Create `tests/cv/preview.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { startPreviewServer } from '../../scripts/cv/preview.mjs';

test('serves both language previews and a change version', async (t) => {
  const preview = await startPreviewServer({ rootDir: process.cwd(), port: 0, open: false });
  t.after(preview.close);
  const en = await fetch(`${preview.url}/cv/en/`);
  const zh = await fetch(`${preview.url}/cv/zh/`);
  const version = await fetch(`${preview.url}/__cv_version`);
  assert.equal(en.status, 200);
  assert.match(await en.text(), /Curriculum Vitae/);
  assert.match(await zh.text(), /个人简历/);
  assert.match(await version.text(), /^\d+$/);
});
```

- [ ] **Step 2: Run the preview test and verify it fails**

Run:

```powershell
node --test tests/cv/preview.test.mjs
```

Expected: FAIL because the preview server is not implemented.

- [ ] **Step 3: Implement the preview server and refresh behavior**

Implement `scripts/cv/lib/server.mjs` with Node's `http.createServer`, safe path normalization, explicit MIME types, `Cache-Control: no-store`, and a `port: 0` option for tests.

Implement `startPreviewServer` in `scripts/cv/preview.mjs` so every CV request rebuilds the in-memory models, and `fs.watch` on `_data`, `_publications`, `_projects`, and `_activities` increments a numeric version. Inject this script into standalone pages:

```html
<script>
let cvVersion;
setInterval(async () => {
  const next = await fetch('/__cv_version', { cache: 'no-store' }).then((response) => response.text());
  if (cvVersion && next !== cvVersion) location.reload();
  cvVersion = next;
}, 1000);
</script>
```

When run directly, print the complete URL, open the default browser on Windows with `Start-Process` through a small platform-specific helper, and keep the server alive until Ctrl+C. Export `startPreviewServer` without opening a browser when imported by tests.

- [ ] **Step 4: Run tests and manually exercise YAML refresh**

Run:

```powershell
node --test tests/cv/preview.test.mjs
npm run cv:preview
```

Expected: both tests PASS; the browser opens the English preview; changing only the order of two project IDs in `_data/cv.yml` refreshes the page and changes their order; restore the original order before committing.

- [ ] **Step 5: Document the authoring loop and commit**

Add this concise section to `README.md`:

```markdown
## CV authoring

Edit `_data/cv.yml`, then run `npm run cv:preview` for a local English/Chinese preview. Run `npm run cv:check` to validate selection and required fields. `npm run cv:build` creates the complete Jekyll site and all CV downloads locally once Ruby and Chromium dependencies are installed.
```

Commit:

```powershell
git add scripts/cv/lib/server.mjs scripts/cv/preview.mjs tests/cv/preview.test.mjs README.md
git commit -m "Add local CV authoring preview"
```

---

### Task 5: Generate Editable English And Chinese DOCX Files

**Files:**
- Create: `scripts/cv/lib/docx.mjs`
- Create: `tests/cv/docx.test.mjs`
- Modify: `scripts/cv/artifacts.mjs` or create it if absent

**Interfaces:**
- Consumes: normalized `CvModel` JSON.
- Produces: `createDocxBuffer(model: CvModel): Promise<Buffer>`.
- Produces: `writeDocxFiles({ models, outputDir }): Promise<string[]>`.

- [ ] **Step 1: Write failing DOCX generation tests**

Create `tests/cv/docx.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCvModels } from '../../scripts/cv/lib/model.mjs';
import { createDocxBuffer, writeDocxFiles } from '../../scripts/cv/lib/docx.mjs';

test('creates a non-empty Word-compatible zip buffer', async () => {
  const { en } = await buildCvModels(process.cwd());
  const buffer = await createDocxBuffer(en);
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  assert.ok(buffer.length > 10000);
});

test('writes both language filenames', async (t) => {
  const outputDir = await mkdtemp(join(tmpdir(), 'cv-docx-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const models = await buildCvModels(process.cwd());
  const paths = await writeDocxFiles({ models, outputDir });
  assert.deepEqual(paths.map((path) => path.split(/[\\/]/).at(-1)).sort(), [
    'zhang-baizhou-cv-en.docx', 'zhang-baizhou-cv-zh.docx'
  ]);
  assert.ok((await readFile(paths[0])).length > 10000);
});
```

- [ ] **Step 2: Run DOCX tests and verify they fail**

Run:

```powershell
node --test tests/cv/docx.test.mjs
```

Expected: FAIL because `scripts/cv/lib/docx.mjs` does not exist.

- [ ] **Step 3: Implement the editable DOCX renderer**

Use `docx` exports `Document`, `Packer`, `Paragraph`, `TextRun`, `HeadingLevel`, `ExternalHyperlink`, `AlignmentType`, and `PageNumber`. Implement:

- A4 page size with 18mm margins.
- Aptos or Arial body text at 10pt and 1.05 line spacing.
- Name at 20pt; section headings at 11pt with a bottom border.
- A compact contact paragraph with clickable email, website, and ORCID.
- One paragraph per education/grant/award/project/activity entry.
- Numbered selected publications with only the owner's exact author token bolded.
- Bilingual labels selected from the normalized model.
- No text boxes, columns, floating shapes, or photo, so Word editing remains predictable.
- Footer page numbers.

Return `Packer.toBuffer(document)`. `writeDocxFiles` creates the output directory, writes both exact filenames, and returns their absolute paths.

- [ ] **Step 4: Add DOCX output to the artifact command**

Create `scripts/cv/artifacts.mjs` so it reads `.cv-build/models/en.json` and `zh.json`, creates `_site/assets/cv`, and calls `writeDocxFiles`. Support `--docx-only` so DOCX generation can be tested before PDF support exists. If normalized JSON is absent, exit with `Run npm run cv:prepare before cv:artifacts.`.

- [ ] **Step 5: Run DOCX tests and inspect both files**

Run:

```powershell
node --test tests/cv/docx.test.mjs
npm run cv:prepare
npm run cv:artifacts -- --docx-only
```

Expected: tests PASS and both DOCX files exist under `_site/assets/cv`. Open both files in Word or LibreOffice and confirm headings, links, Chinese text, and editable paragraphs render correctly.

- [ ] **Step 6: Commit DOCX generation**

```powershell
git add scripts/cv/lib/docx.mjs scripts/cv/artifacts.mjs tests/cv/docx.test.mjs
git commit -m "Generate editable bilingual CV documents"
```

---

### Task 6: Generate And Verify Two-page PDF Files

**Files:**
- Create: `scripts/cv/lib/pdf.mjs`
- Create: `scripts/cv/build.mjs`
- Create: `tests/cv/pdf.test.mjs`
- Modify: `scripts/cv/artifacts.mjs`
- Modify: `assets/cv/cv.css`

**Interfaces:**
- Consumes: built `_site/cv/en/index.html`, `_site/cv/zh/index.html`, and normalized models.
- Produces: `printCvPdf({ page, url, outputPath, pageLimit }): Promise<number>`.
- Produces: four final files in `_site/assets/cv`.

- [ ] **Step 1: Write a failing PDF page-limit test**

Create `tests/cv/pdf.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { assertPdfPageLimit } from '../../scripts/cv/lib/pdf.mjs';

test('accepts a two-page PDF and rejects a three-page PDF', async () => {
  const twoPages = await PDFDocument.create();
  twoPages.addPage();
  twoPages.addPage();
  const threePages = await PDFDocument.create();
  threePages.addPage();
  threePages.addPage();
  threePages.addPage();
  assert.equal(await assertPdfPageLimit(await twoPages.save(), 2), 2);
  const threePageBytes = await threePages.save();
  await assert.rejects(() => assertPdfPageLimit(threePageBytes, 2), /3 pages.*limit is 2/);
});
```

- [ ] **Step 2: Run the PDF test and verify it fails**

Run:

```powershell
node --test tests/cv/pdf.test.mjs
```

Expected: FAIL because `scripts/cv/lib/pdf.mjs` does not exist.

- [ ] **Step 3: Implement PDF printing and page validation**

Implement `assertPdfPageLimit(bytes, pageLimit)` using `PDFDocument.load(bytes)` and `getPageCount()`.

Implement `printCvPdf` with Playwright Chromium:

```js
await page.goto(url, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print' });
const bytes = await page.pdf({
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: false
});
await assertPdfPageLimit(bytes, pageLimit);
await writeFile(outputPath, bytes);
```

Before printing, assert that `.cv-sheet` count is exactly two for the default configuration and that `document.fonts.ready` resolves. Capture desktop and mobile screenshots into `.cv-build/screenshots` for local inspection, but do not deploy them.

- [ ] **Step 4: Complete artifact generation and local orchestration**

Update `scripts/cv/artifacts.mjs` to:

1. Start a static server rooted at `_site` on an ephemeral loopback port.
2. Launch one Chromium instance.
3. Print `/cv/en/` and `/cv/zh/` to their exact PDF filenames.
4. Generate both DOCX files.
5. Confirm all four output paths exist and are non-empty.
6. Close browser and server in `finally` blocks.

Create `scripts/cv/build.mjs` using `spawn` with inherited stdio to run these commands cross-platform in order:

```text
node scripts/cv/prepare.mjs
bundle exec jekyll build
node scripts/cv/artifacts.mjs
```

Propagate the first non-zero exit code.

- [ ] **Step 5: Tune explicit two-page CSS without reducing readability**

Use two `.cv-sheet` containers from the HTML renderer. Page 1 ends after Research Grants; page 2 starts with Awards & Honors. Keep PDF body text at 9pt or larger, contact text at 8.5pt or larger, and line height at least 1.25. If content overflows, shorten YAML content or change `page_limit`; do not hide overflow or scale the whole page.

- [ ] **Step 6: Run unit and local artifact checks**

Run:

```powershell
node --test tests/cv/pdf.test.mjs
npm run test:cv
npm run cv:build
```

Expected: all tests PASS; both PDFs contain exactly two pages; all four files exist in `_site/assets/cv`; screenshots show no overlap at 1280x900 and 390x844.

- [ ] **Step 7: Commit PDF and build orchestration**

```powershell
git add scripts/cv/lib/pdf.mjs scripts/cv/build.mjs scripts/cv/artifacts.mjs tests/cv/pdf.test.mjs assets/cv/cv.css
git commit -m "Generate two-page bilingual CV PDFs"
```

---

### Task 7: Replace The Default Pages Build With GitHub Actions

**Files:**
- Create: `.ruby-version`
- Track and modify: `Gemfile.lock`
- Modify: `.gitignore`
- Create: `.github/workflows/pages.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: all build commands from Tasks 1-6.
- Produces: one `github-pages` artifact containing Jekyll pages and four CV downloads.
- Deploy job runs only for non-pull-request events.

- [ ] **Step 1: Pin the Ruby environment and make the lockfile portable**

Create `.ruby-version`:

```text
3.2.6
```

Remove `Gemfile.lock` from `.gitignore`. Run Bundler with Ruby available:

```powershell
bundle lock --add-platform x86_64-linux
bundle check
```

Expected: `Gemfile.lock` retains the current Windows platforms and adds `x86_64-linux` so the Action does not resolve a different Jekyll dependency graph.

- [ ] **Step 2: Create the custom Pages workflow**

Create `.github/workflows/pages.yml` with `push` on `main`, `pull_request`, and `workflow_dispatch`. Use one build job and one deploy job. The core action versions and permissions must be:

```yaml
name: Build and deploy Jekyll site

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - uses: ruby/setup-ruby@ec02537da5712d66d4d50a0f33b7eb52773b5ed1
        with:
          ruby-version: '3.2.6'
          bundler-cache: true
      - uses: actions/configure-pages@v5
        id: pages
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: sudo apt-get update
      - run: sudo apt-get install -y fonts-noto-cjk poppler-utils unzip
      - run: npm run test:cv
      - run: npm run cv:prepare
      - run: bundle exec jekyll build --baseurl "${{ steps.pages.outputs.base_path }}"
        env:
          JEKYLL_ENV: production
      - run: npm run cv:artifacts
      - run: unzip -t _site/assets/cv/zhang-baizhou-cv-en.docx
      - run: unzip -t _site/assets/cv/zhang-baizhou-cv-zh.docx
      - run: pdftotext _site/assets/cv/zhang-baizhou-cv-en.pdf - | grep -F "ZHANG Baizhou"
      - run: pdftotext _site/assets/cv/zhang-baizhou-cv-zh.pdf - | grep -F "张柏洲"
      - uses: actions/upload-pages-artifact@v4
        with:
          path: _site

  deploy:
    if: github.event_name != 'pull_request'
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

If workflow YAML parsing treats `${{ ... }}` inside the plan as literal text during implementation, copy it exactly without additional escaping.

- [ ] **Step 3: Add deployment instructions to README**

Document these one-time repository settings:

1. Open repository Settings.
2. Open Pages under Code and automation.
3. Set Source to GitHub Actions.
4. Push the workflow commit.
5. Inspect the Actions run and the `github-pages` environment URL.

Document that pull requests validate without publishing and that a failed build leaves the last successful deployment available.

- [ ] **Step 4: Validate workflow syntax and the local production build**

Run:

```powershell
npm run test:cv
npm run cv:check
npm run cv:build
git diff --check
```

Expected: all commands PASS and `git status --short` lists no generated CV files.

- [ ] **Step 5: Commit deployment automation**

```powershell
git add .ruby-version Gemfile.lock .gitignore .github/workflows/pages.yml README.md
git commit -m "Deploy generated CV files with GitHub Pages"
```

---

### Task 8: Perform End-to-end Accessibility And Layout Verification

**Files:**
- Verify and correct: `assets/cv/cv.css`
- Verify and correct: `scripts/cv/lib/html.mjs`
- Verify and correct: `_data/cv.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: the complete local `_site` output.
- Produces: a verified, documented release candidate ready to push and enable in Pages settings.

- [ ] **Step 1: Run the complete clean verification sequence**

Delete only generated and dependency directories after resolving their absolute paths inside the repository, reinstall, and rebuild:

```powershell
npm ci
npx playwright install chromium
npm run test:cv
npm run cv:check
npm run cv:build
```

Expected: all commands exit 0 and four non-empty downloads exist in `_site/assets/cv`.

- [ ] **Step 2: Verify semantic and content invariants in the built site**

Check the built HTML and extracted document text for:

- `/cv/en/` declares English and `/cv/zh/` declares `zh-CN`.
- Both previews contain exactly five `.cv-publication` entries.
- Every `.cv-award` contains an issuer element.
- Phone and photo are absent.
- Email, full HTTPS website, ORCID, and location are present.
- All four download links resolve to files.
- Section order matches the approved ten-section list.
- Publication author order and spelling match the source front matter.

Implement any repeated checks as additions to the Node test suite rather than manual-only commands.

- [ ] **Step 3: Verify responsive and print layout visually**

Use Playwright screenshots at:

- Desktop: `1280x900`
- Mobile: `390x844`
- Both `/cv/en/` and `/cv/zh/`

Inspect the four screenshots and both PDFs. Confirm there is no text overlap, clipped long title, layout shift from the language switch, hidden download control, split single entry across pages, or blank PDF page. Confirm both PDFs are exactly two pages and Chinese glyphs render.

- [ ] **Step 4: Verify DOCX editability**

Open both DOCX files in Microsoft Word. Edit one publication title, move one project paragraph, and save a temporary copy. Confirm headings, hyperlinks, list numbering, and Chinese text survive. Delete only the temporary edited copies after confirming their resolved paths are inside `_site/assets/cv`.

- [ ] **Step 5: Add final maintenance notes and commit any corrections**

README must explain:

- Routine editing occurs in `_data/cv.yml`.
- Collection IDs are filename stems.
- Publication selection permits at most five items.
- `detail` accepts only `full` or `compact`.
- Awards require issuer fields.
- `npm run cv:preview`, `cv:check`, and `cv:build` roles.
- Phone should be added after DOCX download rather than committed publicly.
- How to inspect a failed Actions run.

Run one final verification:

```powershell
npm run test:cv
npm run cv:check
npm run cv:build
git diff --check
git status --short
```

Expected: all checks PASS; status contains only intended source changes plus the user's pre-existing untracked 2026 publication files.

Commit corrections only when source files changed:

```powershell
git add README.md assets/cv/cv.css scripts/cv _data/cv.yml tests/cv
git diff --cached --name-only
git commit -m "Verify bilingual academic CV workflow"
```
