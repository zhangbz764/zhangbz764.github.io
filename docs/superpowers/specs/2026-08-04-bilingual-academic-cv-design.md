# Bilingual Academic CV Design

## Summary

Add bilingual academic CV preview and download functionality to the existing Jekyll site. The site itself remains English-first with Chinese content where it already exists; full-site i18n is out of scope.

Visitors can preview an English or Chinese CV, then download a fixed-layout PDF or an editable DOCX. All four outputs derive from the same source data. The repository owner controls selection, order, and detail level primarily through one YAML file.

## Goals

- Provide English and Chinese CV preview pages.
- Generate downloadable PDF and DOCX files for both languages.
- Keep PDF output suitable for research-oriented university faculty applications.
- Keep DOCX output clean and easy to edit rather than visually identical to the PDF.
- Let the repository owner select and order CV entries in one central YAML file.
- Reuse publication, project, and activity metadata already stored in Jekyll collections.
- Automatically validate, generate, and publish all outputs through GitHub Actions.

## Non-goals

- Full-site i18n or separate Chinese and English versions of every existing page.
- A browser-based CV editor.
- An exhaustive, unlimited-length academic record.
- Internship experience or technical skills sections.
- A public telephone number.
- A photo in either default language version.

## Audience And Format

The primary audience is a research-oriented university faculty hiring committee. The default artifact is a concise two-page academic CV rather than a full academic dossier.

The configured page limit defaults to two. If future content cannot remain readable within that limit, the owner may explicitly increase it rather than reduce type below the design's minimum size.

## Information Order

Both languages use the same section order and selected entries:

1. Personal Information and Research Profile
2. Education
3. Selected Publications
4. Research Grants
5. Awards and Honors
6. Patents and Intellectual Property
7. Selected Research Projects
8. Teaching Experience
9. Academic Presentations
10. Academic Service

The recommended page division is:

- Page 1: personal information, research profile, education, five selected publications, and research grants.
- Page 2: awards, intellectual property, selected projects, teaching, presentations, and academic service.

## Content Detail Rules

### Contact Header

The public header contains:

- Name
- Current academic role
- Email
- `Website: https://zhangbz764.github.io`
- ORCID `0000-0003-3153-2264`
- Location

Phone is excluded because the source repository and generated files are public. It can be added manually to a downloaded DOCX for a specific application.

Photo display remains configurable by language but defaults to false for both English and Chinese.

### Selected Publications

- At most five entries.
- Explicit selection and order in the central configuration.
- Reverse chronological order is the default recommendation, but explicit order wins.
- Each citation includes authors, year, formal title, venue, available volume/issue/pages, and DOI.
- ZHANG Baizhou is emphasized without changing the official author order or spelling.
- Equal-contribution or corresponding-author markers may be shown with a legend when supplied.
- Publication abstracts are excluded.
- Short type labels distinguish journal and conference entries.

### Research Grants

Each entry contains project name, funder, grant number, personal role, period, and status. Funding amount is optional and is hidden when absent.

### Awards And Honors

Each entry contains award name, awarding organization, level or placement when applicable, and year. Awarding organization is required for every displayed award.

### Patents And Intellectual Property

Each entry contains title, inventors, patent or registration number, status, and year.

### Selected Research Projects

Each entry contains title, period, and role. A `full` entry adds one concise personal-contribution statement; a `compact` entry contains metadata only.

### Teaching Experience

Each entry contains course or workshop name, role, institution, and period.

### Academic Presentations

Only representative invited talks, paper presentations, or equivalent academic presentations are included. Each entry contains presentation title, event or host, presentation type, location, and date.

### Academic Service

Reviewer and conference service is presented compactly. Routine attendance is excluded.

## Data Architecture

### Central Control File

`_data/cv.yml` is the main editing surface. It stores:

- Bilingual profile and section-specific content not represented by existing collections.
- Education, grants, awards, patents, teaching, presentations, and service entries.
- Contact fields and per-language photo flags.
- Section visibility and order.
- PDF page limit.
- Selection, order, and detail level for collection-backed entries.

A representative collection configuration is:

```yaml
collections:
  publications:
    limit: 5
    items:
      - id: 2025-06-10-web-tool-studio
        detail: compact

  projects:
    items:
      - id: 2024-11-13-flexurban
        detail: full
      - id: 2023-10-12-simforms
        detail: compact

  activities:
    items:
      - id: 2025-03-28-caadria2025
        section: presentations
        detail: compact
```

Collection IDs are filename stems. The build fails clearly when a configured ID no longer resolves.

### Existing Collection Entries

Existing `_publications`, `_projects`, and `_activities` files remain authoritative for shared metadata such as title, authors, date, source, DOI, featured image, and canonical site URL.

An entry may add a small `cv` front-matter object only for CV-specific information that cannot be derived safely, such as:

- Personal role
- Concise English contribution
- Concise Chinese contribution
- Citation volume, issue, or page information not already present
- Authorship markers

Long page bodies are never copied directly into the CV.

### Normalized Build Data

A build helper loads `_data/cv.yml` and selected collection front matter, validates references and required fields, and produces normalized English and Chinese CV models. Preview HTML and DOCX generation consume those normalized models. PDF generation consumes the final preview HTML, ensuring the PDF matches the approved web layout.

Generated intermediate data is build output and is not committed.

## Local Authoring Loop

The repository provides a lightweight CV-only preview command that does not require publishing to GitHub:

```text
npm run cv:preview
```

The command validates `_data/cv.yml`, resolves selected collection entries, starts a local preview, and refreshes the English and Chinese CV views when relevant YAML or front matter changes. It reuses the same data loader, content renderer, and CV stylesheet as the production build so local selection and pagination feedback remain representative.

Additional commands provide focused checks and local artifact generation:

```text
npm run cv:check
npm run cv:build
```

`cv:check` validates content without starting a server. `cv:build` generates local PDF and DOCX files for final inspection. The regular Jekyll authoring workflow remains available for reviewing the CV inside the complete site navigation.

## Preview Experience

The site navigation gains a `CV` item linking to `/cv/en/`. The two preview routes are:

- `/cv/en/`
- `/cv/zh/`

Each preview provides:

- An EN/中文 segmented language switch.
- PDF and DOCX download buttons.
- A responsive reading layout on desktop and mobile.
- An A4-oriented print layout with explicit page-break rules.

The preview is useful for quick reading and sharing. The PDF is the formal application artifact. The DOCX is intentionally simpler and optimized for editing.

## Generated Files

The default public downloads are:

- `/assets/cv/zhang-baizhou-cv-en.pdf`
- `/assets/cv/zhang-baizhou-cv-en.docx`
- `/assets/cv/zhang-baizhou-cv-zh.pdf`
- `/assets/cv/zhang-baizhou-cv-zh.docx`

Download buttons include human-readable labels and file types. Missing output files are treated as build failures rather than published as broken links.

## Build And Deployment Flow

GitHub Actions replaces the default branch-based GitHub Pages build with an explicit workflow:

1. Check out the repository.
2. Install pinned Ruby/Jekyll and CV-generation dependencies.
3. Load and validate CV source data.
4. Build the Jekyll site.
5. Render the English and Chinese preview pages to PDF with a headless browser.
6. Generate editable English and Chinese DOCX files from the normalized models.
7. Verify generated files and layout constraints.
8. Package the complete `_site` directory.
9. Deploy the artifact through GitHub Pages.

Pushes to the default branch build and deploy. Pull requests build and validate without deploying. A manual workflow trigger is also available for recovery and testing.

Generated PDF and DOCX files are deployment artifacts and do not need to be committed to the source branch.

## Validation And Failure Behavior

The build stops with a direct error message when any of the following occurs:

- YAML cannot be parsed.
- A selected collection ID does not exist.
- The same collection ID is selected twice in one section.
- More than five publications are selected.
- A displayed award lacks an awarding organization.
- An entry uses an unknown detail level or section name.
- A required bilingual field is missing.
- A download file is not generated.
- A PDF exceeds the configured page limit.

Optional metadata, such as grant amount, is omitted cleanly when absent. External DOI or website availability does not block deployment because transient network failures should not prevent the site from publishing.

The last successful GitHub Pages deployment remains the usable public version when a new build fails.

## Testing

Automated verification covers:

- YAML schema and collection-reference validation.
- Publication selection limit and explicit ordering.
- Required award issuer fields.
- Correct language-specific labels and content.
- Correct emphasis of the owner's name without changing author order.
- Preview routes and download links.
- Successful creation and basic structural validity of both DOCX files.
- Successful creation, text presence, font rendering, and configured page count of both PDFs.
- Desktop and mobile screenshots of the preview pages to detect overflow or overlapping controls.
- A production Jekyll build before deployment.

## Privacy And Maintenance

- No phone number is stored in the public repository.
- No photo is displayed by default.
- Contact links use public information already present on the site.
- Dependencies are pinned in the build configuration to reduce unexpected layout changes.
- The central YAML file contains comments and examples so routine selection changes do not require template edits.
