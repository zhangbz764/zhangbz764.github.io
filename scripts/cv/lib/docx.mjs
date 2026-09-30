import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
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

const FILE_SYSTEM = { mkdir, rename, rm, writeFile };

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

export async function writeDocxFiles({
  models,
  outputDir,
  createBuffer = createDocxBuffer,
  fileSystem = FILE_SYSTEM
}) {
  const absoluteOutputDir = resolve(outputDir);
  const outputs = [
    ['en', 'zhang-baizhou-cv-en.docx'],
    ['zh', 'zhang-baizhou-cv-zh.docx']
  ];
  const buffers = await Promise.all(outputs.map(([language]) => createBuffer(models[language])));
  await fileSystem.mkdir(absoluteOutputDir, { recursive: true });

  const transactionId = randomUUID();
  const files = outputs.map(([, filename], index) => {
    const finalPath = resolve(absoluteOutputDir, filename);
    return {
      buffer: buffers[index],
      finalPath,
      temporaryPath: `${finalPath}.${transactionId}.tmp`,
      backupPath: `${finalPath}.${transactionId}.bak`
    };
  });

  const staged = await Promise.allSettled(
    files.map((file) => fileSystem.writeFile(file.temporaryPath, file.buffer))
  );
  const stagingFailure = staged.find((result) => result.status === 'rejected');
  if (stagingFailure) {
    await cleanupFiles(fileSystem, files.map((file) => file.temporaryPath));
    throw stagingFailure.reason;
  }

  const backedUp = [];
  const installed = [];
  try {
    for (const file of files) {
      try {
        await fileSystem.rename(file.finalPath, file.backupPath);
        backedUp.push(file);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }

    for (const file of files) {
      await fileSystem.rename(file.temporaryPath, file.finalPath);
      installed.push(file);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const file of installed.toReversed()) {
      try {
        await fileSystem.rm(file.finalPath, { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const file of backedUp.toReversed()) {
      try {
        await fileSystem.rm(file.finalPath, { force: true });
        await fileSystem.rename(file.backupPath, file.finalPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    await cleanupFiles(fileSystem, files.map((file) => file.temporaryPath));
    if (rollbackErrors.length) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Failed to replace bilingual DOCX pair and roll back: ${error.message}`
      );
    }
    throw error;
  }

  await cleanupFiles(fileSystem, backedUp.map((file) => file.backupPath));
  return files.map((file) => file.finalPath);
}

async function cleanupFiles(fileSystem, paths) {
  const results = await Promise.allSettled(paths.map((path) => fileSystem.rm(path, { force: true })));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
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
  appendContactItem(contactChildren, copy.email, contact.email, validEmailUrl(contact.email));
  appendContactItem(contactChildren, copy.website, contact.website, validHttpsUrl(contact.website));
  appendContactItem(contactChildren, copy.orcid, contact.orcid, validOrcidUrl(contact.orcid));
  appendContactItem(contactChildren, copy.location, contact.location);

  return [
    new Paragraph({ style: STYLE.name, children: [new TextRun({ text: value(contact.name) })] }),
    new Paragraph({ style: STYLE.role, children: [new TextRun({ text: value(contact.role) })] }),
    new Paragraph({ style: STYLE.contact, children: contactChildren })
  ];
}

function appendContactItem(children, label, input, link = null) {
  if (!hasValue(input)) return;
  appendSeparator(children);
  const displayText = `${label}: ${value(input)}`;
  children.push(link
    ? new ExternalHyperlink({
      link,
      children: [new TextRun({ text: displayText, style: 'Hyperlink' })]
    })
    : new TextRun({ text: displayText }));
}

function appendSeparator(children) {
  if (children.length) children.push(new TextRun({ text: ' | ', color: '9AA0A6' }));
}

function validEmailUrl(input) {
  if (!hasValue(input)) return null;
  const email = value(input);
  const match = /^([^\s@<>]+)@([^\s@<>]+\.[^\s@<>]+)$/.exec(email);
  if (!match) return null;
  return `mailto:${encodeURIComponent(match[1])}@${encodeURIComponent(match[2])}`;
}

function validHttpsUrl(input) {
  if (!hasValue(input)) return null;
  const candidate = value(input);
  try {
    return new URL(candidate).protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
}

function validOrcidUrl(input) {
  if (!hasValue(input)) return null;
  const orcid = value(input);
  if (!/^\d{4}-\d{4}-\d{4}-[\dX]{4}$/i.test(orcid)) return null;
  return `https://orcid.org/${orcid}`;
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
  const children = [];
  appendField(children, item.period, { bold: true, color: '374151' });
  appendField(children, item.degree, { before: ' | ', bold: true });
  appendField(children, item.institution, { before: ', ' });
  return children;
}

function renderGrant(item, language) {
  const copy = COPY[language === 'zh' ? 'zh' : 'en'];
  const fields = [
    item.period,
    item.title,
    item.funder,
    hasValue(item.grant_number) ? `${copy.grantNumber} ${item.grant_number}` : '',
    item.role,
    item.status,
    item.amount
  ];
  const children = [];
  appendField(children, fields[0], { bold: true, color: '374151' });
  appendField(children, fields[1], { before: ' | ', bold: true });
  for (const field of fields.slice(2)) appendField(children, field, { before: '; ' });
  finishSentence(children, lastPresent(fields));
  return children;
}

function renderAward(item) {
  const children = [];
  appendField(children, item.year, { bold: true, color: '374151' });
  appendField(children, item.title, { before: ' | ', bold: true });
  appendField(children, item.issuer, { before: '; ' });
  finishSentence(children, item.issuer);
  return children;
}

function renderPublication(item, model) {
  const aliases = new Set(model.author_aliases ?? []);
  const children = [];
  if (hasValue(item.type)) {
    children.push(new TextRun({ text: `[${value(item.type)}]`, color: '5F6368' }));
    children.push(literal(' '));
  }
  (Array.isArray(item.authors) ? item.authors : []).forEach((author, index, authors) => {
    children.push(new TextRun({ text: value(author), bold: aliases.has(author) }));
    if (index < authors.length - 1) children.push(literal(', '));
  });
  if (hasValue(item.cv?.year)) {
    children.push(literal(' '));
    children.push(new TextRun({ text: `(${value(item.cv.year)})` }));
    children.push(literal('. '));
  }
  children.push(new TextRun({ text: localizedTitle(item, model.language) }));
  if (hasValue(item.source)) {
    children.push(literal('. '));
    children.push(new TextRun({ text: value(item.source), italics: true }));
  }
  const volumeIssue = hasValue(item.cv?.volume)
    ? `${item.cv.volume}${hasValue(item.cv?.issue) ? `(${item.cv.issue})` : ''}`
    : hasValue(item.cv?.issue) ? `no. ${item.cv.issue}` : '';
  appendField(children, volumeIssue, { before: ', ' });
  appendField(children, hasValue(item.cv?.pages) ? `pp. ${item.cv.pages}` : '', { before: ', ' });
  appendField(children, hasValue(item.DOI) ? `DOI: ${item.DOI}` : '', { before: ', ' });
  children.push(literal('.'));

  return new Paragraph({
    style: STYLE.publication,
    numbering: { reference: PUBLICATION_NUMBERING, level: 0 },
    children: children.filter(Boolean)
  });
}

function renderPatent(item, language) {
  const fields = [
    item.cv?.year,
    localizedTitle(item, language),
    Array.isArray(item.authors) ? item.authors.join(', ') : item.authors,
    item.cv?.patent_number,
    item.cv?.status,
    item.source
  ];
  return renderDelimitedEntry(fields);
}

function renderProject(item, language) {
  return renderDelimitedEntry([
    item.cv?.period,
    localizedProjectTitle(item, language),
    item.cv?.role,
    item.location,
    item.detail === 'full' ? item.cv?.contribution : ''
  ]);
}

function renderTeaching(item) {
  return renderDelimitedEntry([
    item.cv?.period,
    item.cv?.title,
    item.cv?.role,
    item.cv?.location
  ]);
}

function renderPresentation(item) {
  return renderDelimitedEntry([
    item.cv?.period,
    item.cv?.title,
    item.cv?.presentation_type,
    item.cv?.role,
    item.cv?.location
  ]);
}

function renderService(items, language) {
  const reviewers = Array.isArray(items?.reviewers) ? items.reviewers : [];
  if (!reviewers.length) return [];
  return [entryParagraph([
    new TextRun({ text: COPY[language === 'zh' ? 'zh' : 'en'].reviewerFor, bold: true }),
    literal(': '),
    new TextRun({ text: reviewers.map(value).join('; ') })
  ])];
}

function renderDelimitedEntry(fields) {
  const children = [];
  appendField(children, fields[0], { bold: true, color: '374151' });
  appendField(children, fields[1], { before: ' | ', bold: true });
  for (const field of fields.slice(2)) appendField(children, field, { before: '; ' });
  finishSentence(children, lastPresent(fields));
  return children;
}

function appendField(children, input, { before = '', ...options } = {}) {
  if (!hasValue(input)) return;
  if (children.length && before) children.push(literal(before));
  children.push(new TextRun({ text: value(input), ...options }));
}

function text(input) {
  if (!hasValue(input)) return null;
  return new TextRun({ text: value(input) });
}

function literal(input) {
  return new TextRun({ text: input });
}

function finishSentence(children, input) {
  if (hasValue(input) && !/[.!?。！？]$/.test(value(input))) children.push(literal('.'));
}

function localizedTitle(item, language) {
  if (language === 'en' && hasValue(item.subtitle)) return value(item.subtitle);
  return value(item.title);
}

function localizedProjectTitle(item, language) {
  if (language === 'zh' && hasValue(item.subtitle)) return value(item.subtitle);
  return value(item.title);
}

function lastPresent(values) {
  return values.filter(hasValue).at(-1);
}

function value(input) {
  return hasValue(input) ? String(input).trim() : '';
}

function hasValue(input) {
  return input !== undefined && input !== null && String(input).trim() !== '';
}
