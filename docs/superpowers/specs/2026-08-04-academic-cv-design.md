# Bilingual Academic CV Design

Date: 2026-08-04

## Purpose

Add a bilingual academic CV to the existing Jekyll site without localizing the
rest of the site. Visitors can preview the Chinese or English CV and then
download a fixed-layout PDF or an editable DOCX generated from the same data.

The CV is intended primarily for research-oriented university faculty
applications. The initial PDF target is two A4 pages per language.

## Scope

### Included

- English preview at `/cv/en/`.
- Chinese preview at `/cv/zh/`.
- Language switching between the two preview pages.
- PDF and DOCX downloads for each language.
- One central YAML file for CV content, selection, ordering, and display detail.
- Reuse of publication, project, and activity metadata already stored in Jekyll
  collections.
- Automated validation, document generation, and GitHub Pages deployment with
  GitHub Actions.

### Excluded

- Full-site i18n or duplicated Chinese and English versions of existing pages.
- Internship and software skill sections in the CV.
- A telephone number in public source files or public downloads.
- A profile photo by default.
- Automatically translating official publication titles, journal names, author
  lists, or other formal bibliographic data.

## Visitor Experience

The site's main navigation gains a `CV` entry. The preview page retains the
visual character of the existing Tale-based site while presenting the CV as a
clean A4-like document.

The preview toolbar contains:

- an English/Chinese language switch;
- a primary PDF download button;
- a secondary DOCX download button;
- a visible last-updated date.

The preview is responsive on mobile. The downloadable PDF uses separate print
styles and fixed page dimensions, so its pagination does not depend on the
visitor's browser.

## Content Order

Both languages use the same sections, selected entries, and ordering:

1. Personal information and research profile
2. Education
3. Selected publications
4. Research grants
5. Awards and honors
6. Patents and intellectual property
7. Selected research projects
8. Teaching experience
9. Academic presentations
10. Academic service

The preferred two-page split is:

- Page 1: personal information, research profile, education, five selected
  publications, and research grants.
- Page 2: awards, intellectual property, selected projects, teaching,
  presentations, and academic service.

The layout must remain readable. It must not silently reduce text below the
approved typography scale to force extra content onto two pages.

## Content Detail Rules

### Personal Information

Show name, academic role, institution or location, email, website, and ORCID.
Display the website as a clearly labeled HTTPS address and keep it clickable.
Do not show a telephone number.

Photo configuration exists per language but defaults to `false` for both
languages. No private photo or phone data is stored merely for a disabled
option.

### Selected Publications

Exactly five entries are selected explicitly in the central configuration.
Each entry uses a full citation with authors, year, title, venue, available
volume/issue/pages, and DOI. The owner's name is emphasized. Equal-contribution
or corresponding-author markers are supported with a short legend when used.
Abstracts are omitted.

### Research Grants

Show title, funder, grant number, role, period, and status. Funding amount is an
optional field and is omitted when empty.

### Awards and Honors

Every displayed award requires a title, awarding organization, and year. Rank
or level is optional. Missing awarding organizations are validation errors.

### Patents and Intellectual Property

Show title, inventor list, patent number, status, and year.

### Selected Research Projects

Each selected project has either `full` or `compact` detail. A `full` entry adds
one concise contribution statement; a `compact` entry shows title, period, and
role only.

### Teaching, Presentations, and Service

- Teaching: course or workshop, role, institution, and period.
- Presentations: title, event or host, presentation type, location, and date.
- Service: compact lists of peer-review and conference service, without a
  paragraph for every appointment.

Entries are ordered reverse chronologically unless the central configuration
provides an explicit order.

## Data Ownership

The implementation uses a hybrid model:

- `_data/cv.yml` is the user-facing control center for bilingual profile text,
  standalone CV sections, section order, collection selections, detail levels,
  photo flags, and contact information.
- Existing files in `_publications`, `_projects`, and `_activities` remain the
  source of truth for titles, dates, authors, sources, links, and other metadata
  already used by the website.
- A selected collection item may add CV-specific bilingual summaries to its
  front matter when a concise contribution statement is needed.
- The central file references collection entries by stable ID and does not copy
  their bibliographic metadata.

A representative control structure is:

```yaml
settings:
  target_pages: 2
  photo:
    en: false
    zh: false

contact:
  email: zhang_baizhou@seu.edu.cn
  website: https://zhangbz764.github.io
  orcid: 0000-0003-3153-2264

selected_publications:
  - 2025-06-10-web-tool-studio
  - 2025-03-26-topological-encoding-street
  - 2025-03-28-reusable-voxelized-formwork
  - 2024-04-23-simforms
  - 2023-01-31-urban-block-generative-cbr

selected_projects:
  - id: 2024-11-13-flexurban
    detail: full
  - id: 2023-10-12-simforms
    detail: compact
```

The five publication IDs above demonstrate the schema and initial selection.
They remain ordinary editable configuration rather than hard-coded template
behavior.

## Normalized CV Model

A build script reads `_data/cv.yml` and the selected collection front matter,
validates references, and produces one normalized CV data model. Both language
pages and the DOCX generator consume this normalized model. The PDF generator
prints the rendered preview page, so it inherits the same content and styles.

This boundary prevents the Jekyll templates, PDF, and DOCX implementations from
developing separate selection logic.

## Document Generation

GitHub Actions is the production build environment. On a push to the publishing
branch, the workflow performs these steps:

1. Check out the repository and install pinned Ruby and Node dependencies.
2. Normalize and validate CV data.
3. Build the Jekyll site, including both preview pages.
4. Generate English and Chinese DOCX files from the normalized model.
5. Render each preview page in a headless browser and export its print layout as
   PDF.
6. Verify document integrity, expected language content, links, and page count.
7. Upload the completed `_site` directory as a GitHub Pages artifact and deploy
   it with the official Pages deployment action.

The resulting public files use stable names under `/assets/cv/`:

- `zhang-baizhou-cv-en.pdf`
- `zhang-baizhou-cv-en.docx`
- `zhang-baizhou-cv-zh.pdf`
- `zhang-baizhou-cv-zh.docx`

The workflow may also be started manually from GitHub's Actions page. Deployment
occurs only from the publishing branch.

## Validation and Failure Handling

The build fails before deployment when it detects:

- malformed YAML;
- a referenced collection ID that does not exist;
- duplicate selected IDs;
- a selected publication count other than five;
- an award without an awarding organization;
- missing required Chinese or English profile content;
- unsupported detail levels;
- a PDF that does not contain exactly two pages.

Optional empty fields, such as grant amount or author-role markers, are omitted
without failure. A failed workflow reports the specific field and entry ID in
its log and does not replace the last successful site deployment.

## Verification

Automated checks cover:

- normalization and validation of representative valid and invalid YAML;
- stable resolution of collection IDs;
- correct inclusion and ordering of selected entries;
- exactly five selected publications;
- presence of required awarding organizations;
- correct language labels and download links in rendered HTML;
- valid, readable DOCX archives containing expected section text;
- valid two-page PDFs containing expected text and working links where the PDF
  renderer supports them;
- desktop and mobile screenshots of both preview languages;
- A4 print screenshots or rendered PDF pages to catch overflow and clipping.

## Repository Hygiene

Generated normalized data, local preview output, browser artifacts, and the
`.superpowers/` visual brainstorming directory are ignored by Git. Source CV
data, templates, scripts, tests, and the workflow remain tracked.

