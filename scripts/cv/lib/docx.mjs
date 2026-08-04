import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  LevelFormat,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  TextRun
} from 'docx';

const PAGE = {
  width: 11906,
  height: 16838,
  margin: 1021,
  header: 567,
  footer: 567
};

const FONT = {
  ascii: 'Arial',
  hAnsi: 'Arial',
  eastAsia: 'Noto Sans CJK SC',
  cs: 'Arial'
};

const STYLE = {
  body: 'CvBody',
  name: 'CvName',
  role: 'CvRole',
  contact: 'CvContact',
  section: 'CvSection',
  entry: 'CvEntry',
  publication: 'CvPublication',
  footer: 'CvFooter'
};

const PUBLICATION_NUMBERING = 'cv-publications';

const COPY = {
  en: {
    email: 'Email',
    website: 'Website',
    orcid: 'ORCID',
    location: 'Location',
    grantNumber: 'Grant No.',
    reviewerFor: 'Reviewer for'
  },
  zh: {
    email: '邮箱',
    website: '网站',
    orcid: 'ORCID',
    location: '所在地',
    grantNumber: '项目编号',
    reviewerFor: '审稿服务'
  }
};

export async function createDocxBuffer(model) {
  const language = model.language === 'zh' ? 'zh' : 'en';
  const sections = Array.isArray(model.sections) ? model.sections : [];
  const children = [
    ...renderHeader(model.contact ?? {}, language),
    ...sections.flatMap((section) => renderSection(section, model))
  ];

  const document = new Document({
    creator: model.contact?.name ?? 'ZHANG Baizhou',
    title: `${model.contact?.name ?? ''} CV`,
    description: language === 'zh' ? '中文学术简历' : 'Academic curriculum vitae',
    styles: createStyles(),
    numbering: {
      config: [{
        reference: PUBLICATION_NUMBERING,
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: {
            run: { font: FONT, size: 20 },
            paragraph: {
              indent: { left: 540, hanging: 270 },
              spacing: { after: 30, line: 252, lineRule: LineRuleType.AUTO }
            }
          }
        }]
      }]
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE.width, height: PAGE.height },
          margin: {
            top: PAGE.margin,
            right: PAGE.margin,
            bottom: PAGE.margin,
            left: PAGE.margin,
            header: PAGE.header,
            footer: PAGE.footer
          },
          pageNumbers: { start: 1 }
        }
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            style: STYLE.footer,
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: language === 'zh' ? '第 ' : 'Page ' }),
              new TextRun({ children: [PageNumber.CURRENT] })
            ]
          })]
        })
      },
      children
    }]
  });

  return Packer.toBuffer(document);
}

export async function writeDocxFiles({ models, outputDir }) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const outputs = [
    ['en', 'zhang-baizhou-cv-en.docx'],
    ['zh', 'zhang-baizhou-cv-zh.docx']
  ];

  return Promise.all(outputs.map(async ([language, filename]) => {
    const path = resolve(absoluteOutputDir, filename);
    await writeFile(path, await createDocxBuffer(models[language]));
    return path;
  }));
}

function createStyles() {
  const bodyParagraph = {
    spacing: { before: 0, after: 40, line: 252, lineRule: LineRuleType.AUTO },
    widowControl: true
  };
  const bodyRun = { font: FONT, size: 20, color: '202124' };

  return {
    default: {
      document: {
        paragraph: bodyParagraph,
        run: bodyRun
      }
    },
    paragraphStyles: [
      {
        id: STYLE.body,
        name: 'CV Body',
        basedOn: 'Normal',
        next: STYLE.body,
        quickFormat: true,
        paragraph: bodyParagraph,
        run: bodyRun
      },
      {
        id: STYLE.name,
        name: 'CV Name',
        basedOn: STYLE.body,
        next: STYLE.role,
        quickFormat: true,
        paragraph: {
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 20, line: 480, lineRule: LineRuleType.EXACT }
        },
        run: { font: FONT, size: 40, bold: true, color: '111111' }
      },
      {
        id: STYLE.role,
        name: 'CV Academic Role',
        basedOn: STYLE.body,
        next: STYLE.contact,
        quickFormat: true,
        paragraph: {
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 20, line: 252, lineRule: LineRuleType.AUTO }
        },
        run: { font: FONT, size: 21, color: '3C4043' }
      },
      {
        id: STYLE.contact,
        name: 'CV Contact',
        basedOn: STYLE.body,
        next: STYLE.section,
        quickFormat: true,
        paragraph: {
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 60, line: 220, lineRule: LineRuleType.AUTO }
        },
        run: { font: FONT, size: 17, color: '3C4043' }
      },
      {
        id: STYLE.section,
        name: 'CV Section Heading',
        basedOn: STYLE.body,
        next: STYLE.entry,
        quickFormat: true,
        paragraph: {
          border: {
            bottom: { style: BorderStyle.SINGLE, color: '6B7280', size: 4, space: 2 }
          },
          spacing: { before: 90, after: 35, line: 264, lineRule: LineRuleType.EXACT },
          keepNext: true,
          outlineLevel: 0
        },
        run: { font: FONT, size: 22, bold: true, color: '1F2937' }
      },
      {
        id: STYLE.entry,
        name: 'CV Entry',
        basedOn: STYLE.body,
        next: STYLE.entry,
        quickFormat: true,
        paragraph: {
          spacing: { before: 0, after: 30, line: 252, lineRule: LineRuleType.AUTO },
          keepLines: true
        },
        run: bodyRun
      },
      {
        id: STYLE.publication,
        name: 'CV Publication',
        basedOn: STYLE.body,
        next: STYLE.publication,
        quickFormat: true,
        paragraph: {
          spacing: { before: 0, after: 30, line: 252, lineRule: LineRuleType.AUTO },
          keepLines: true
        },
        run: bodyRun
      },
      {
        id: STYLE.footer,
        name: 'CV Footer',
        basedOn: STYLE.body,
        next: STYLE.footer,
        paragraph: { spacing: { before: 0, after: 0, line: 200, lineRule: LineRuleType.AUTO } },
        run: { font: FONT, size: 16, color: '6B7280' }
      }
    ]
  };
}

function renderHeader(contact, language) {
  const copy = COPY[language];
  const contactChildren = [];
  appendContactLink(contactChildren, `${copy.email}: ${contact.email}`, `mailto:${contact.email}`);
  appendSeparator(contactChildren);
  appendContactLink(contactChildren, `${copy.website}: ${contact.website}`, contact.website);
  appendSeparator(contactChildren);
  appendContactLink(contactChildren, `${copy.orcid}: ${contact.orcid}`, `https://orcid.org/${contact.orcid}`);
  if (hasValue(contact.location)) {
    appendSeparator(contactChildren);
    contactChildren.push(new TextRun({ text: `${copy.location}: ${contact.location}` }));
  }

  return [
    new Paragraph({ style: STYLE.name, children: [new TextRun({ text: value(contact.name) })] }),
    new Paragraph({ style: STYLE.role, children: [new TextRun({ text: value(contact.role) })] }),
    new Paragraph({ style: STYLE.contact, children: contactChildren })
  ];
}

function appendContactLink(children, text, link) {
  children.push(new ExternalHyperlink({
    link,
    children: [new TextRun({ text, style: 'Hyperlink' })]
  }));
}

function appendSeparator(children) {
  if (children.length) children.push(new TextRun({ text: ' | ', color: '9AA0A6' }));
}

function renderSection(section, model) {
  const heading = new Paragraph({
    style: STYLE.section,
    pageBreakBefore: section.id === 'awards',
    children: [new TextRun({ text: value(section.label) })]
  });

  return [heading, ...renderSectionItems(section, model)];
}

function renderSectionItems(section, model) {
  switch (section.id) {
    case 'profile':
      return [entryParagraph([text(section.items)])];
    case 'education':
      return mapEntries(section.items, renderEducation);
    case 'publications':
      return (Array.isArray(section.items) ? section.items.slice(0, 5) : [])
        .map((item) => renderPublication(item, model));
    case 'grants':
      return mapEntries(section.items, (item) => renderGrant(item, model.language));
    case 'awards':
      return mapEntries(section.items, renderAward);
    case 'patents':
      return mapEntries(section.items, (item) => renderPatent(item, model.language));
    case 'projects':
      return mapEntries(section.items, (item) => renderProject(item, model.language));
    case 'teaching':
      return mapEntries(section.items, renderTeaching);
    case 'presentations':
      return mapEntries(section.items, renderPresentation);
    case 'service':
      return renderService(section.items, model.language);
    default:
      return mapEntries(section.items, (item) => [text(item)]);
  }
}

function mapEntries(items, renderer) {
  return (Array.isArray(items) ? items : []).map((item) => entryParagraph(renderer(item)));
}

function entryParagraph(children) {
  return new Paragraph({ style: STYLE.entry, children: children.filter(Boolean) });
}

function renderEducation(item) {
  return [
    metadata(item.period),
    strong(item.degree),
    text(joinPresent([item.institution], ', '))
  ];
}

function renderGrant(item, language) {
  const copy = COPY[language === 'zh' ? 'zh' : 'en'];
  return [
    metadata(item.period),
    strong(item.title),
    text(sentence(joinPresent([
      item.funder,
      hasValue(item.grant_number) ? `${copy.grantNumber} ${item.grant_number}` : '',
      item.role,
      item.status,
      item.amount
    ], '; ')))
  ];
}

function renderAward(item) {
  return [metadata(item.year), strong(item.title), text(sentence(item.issuer))];
}

function renderPublication(item, model) {
  const aliases = new Set(model.author_aliases ?? []);
  const children = [];
  if (hasValue(item.type)) children.push(new TextRun({ text: `[${item.type}] `, color: '5F6368' }));
  (Array.isArray(item.authors) ? item.authors : []).forEach((author, index, authors) => {
    children.push(new TextRun({ text: value(author), bold: aliases.has(author) }));
    if (index < authors.length - 1) children.push(new TextRun({ text: ', ' }));
  });
  if (hasValue(item.cv?.year)) children.push(text(` (${item.cv.year}). `));
  children.push(new TextRun({ text: localizedTitle(item, model.language) }));
  if (hasValue(item.source)) children.push(new TextRun({ text: `. ${item.source}`, italics: true }));
  const volumeIssue = hasValue(item.cv?.volume)
    ? `${item.cv.volume}${hasValue(item.cv?.issue) ? `(${item.cv.issue})` : ''}`
    : hasValue(item.cv?.issue) ? `no. ${item.cv.issue}` : '';
  const citationTail = joinPresent([
    volumeIssue,
    hasValue(item.cv?.pages) ? `pp. ${item.cv.pages}` : '',
    hasValue(item.DOI) ? `DOI: ${item.DOI}` : ''
  ], ', ');
  if (citationTail) children.push(text(`, ${citationTail}.`));

  return new Paragraph({
    style: STYLE.publication,
    numbering: { reference: PUBLICATION_NUMBERING, level: 0 },
    children: children.filter(Boolean)
  });
}

function renderPatent(item, language) {
  return [
    metadata(item.cv?.year),
    strong(localizedTitle(item, language)),
    text(sentence(joinPresent([
      Array.isArray(item.authors) ? item.authors.join(', ') : item.authors,
      item.cv?.patent_number,
      item.cv?.status,
      item.source
    ], '; ')))
  ];
}

function renderProject(item, language) {
  return [
    metadata(item.cv?.period),
    strong(localizedTitle(item, language)),
    text(sentence(joinPresent([
      item.cv?.role,
      item.location,
      item.detail === 'full' ? item.cv?.contribution : ''
    ], '; ')))
  ];
}

function renderTeaching(item) {
  return [
    metadata(item.cv?.period),
    strong(item.title),
    text(sentence(joinPresent([item.cv?.role, item.location], '; ')))
  ];
}

function renderPresentation(item) {
  return [
    metadata(item.cv?.period),
    strong(item.title),
    text(sentence(joinPresent([
      item.cv?.presentation_type,
      item.cv?.role,
      item.location
    ], '; ')))
  ];
}

function renderService(items, language) {
  const reviewers = Array.isArray(items?.reviewers) ? items.reviewers : [];
  if (!reviewers.length) return [];
  return [entryParagraph([
    strong(`${COPY[language === 'zh' ? 'zh' : 'en'].reviewerFor}: `),
    text(reviewers.join('; '))
  ])];
}

function metadata(input) {
  if (!hasValue(input)) return null;
  return new TextRun({ text: `${input} | `, bold: true, color: '374151' });
}

function strong(input) {
  if (!hasValue(input)) return null;
  return new TextRun({ text: value(input), bold: true });
}

function text(input) {
  if (!hasValue(input)) return null;
  return new TextRun({ text: value(input) });
}

function localizedTitle(item, language) {
  if (language === 'en' && hasValue(item.subtitle)) return value(item.subtitle);
  return value(item.title);
}

function joinPresent(values, separator) {
  return values.filter(hasValue).map(value).join(separator);
}

function sentence(input) {
  const output = value(input);
  return output && !/[.!?。！？]$/.test(output) ? `${output}.` : output;
}

function value(input) {
  return hasValue(input) ? String(input).trim() : '';
}

function hasValue(input) {
  return input !== undefined && input !== null && String(input).trim() !== '';
}
