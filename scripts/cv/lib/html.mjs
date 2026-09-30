const SECTION_MARKERS = {
  profile: 'Research Profile',
  education: 'Education',
  publications: 'Selected Publications',
  grants: 'Research Grants',
  awards: 'Awards & Honors',
  patents: 'Patents & Intellectual Property',
  projects: 'Selected Research Projects',
  teaching: 'Teaching Experience',
  presentations: 'Academic Presentations',
  service: 'Academic Service'
};

const TEXT = {
  en: {
    documentTitle: 'Curriculum Vitae',
    email: 'Email',
    website: 'Website',
    orcid: 'ORCID',
    location: 'Location',
    grantNumber: 'Grant No.',
    reviewers: 'Reviewer for'
  },
  zh: {
    documentTitle: '个人简历',
    email: '邮箱',
    website: '网站',
    orcid: 'ORCID',
    location: '所在地',
    grantNumber: '项目编号',
    reviewers: '审稿服务'
  }
};

export function renderCvFragment(model, options = {}) {
  const language = model.language === 'zh' ? 'zh' : 'en';
  const pathPrefix = options.pathPrefix ?? '';
  const copy = TEXT[language];
  const sections = Array.isArray(model.sections) ? model.sections : [];
  const awardsIndex = sections.findIndex(({ id }) => id === 'awards');
  const splitIndex = awardsIndex >= 0 ? awardsIndex : sections.length;
  const pageOne = sections.slice(0, splitIndex);
  const pageTwo = sections.slice(splitIndex);

  return [
    `<article class="cv-document" data-cv-language="${language}">`,
    renderToolbar(language, pathPrefix),
    '<div class="cv-paper">',
    '<div class="cv-sheet">',
    renderHeader(model.contact ?? {}, copy),
    pageOne.map((section) => renderSection(section, model)).join('\n'),
    '</div>',
    '<div class="cv-sheet">',
    pageTwo.map((section) => renderSection(section, model)).join('\n'),
    '</div>',
    '</div>',
    '</article>'
  ].join('\n');
}

export function renderStandalonePage(model, options = {}) {
  const language = model.language === 'zh' ? 'zh' : 'en';
  const pathPrefix = normalizePathPrefix(options.basePath ?? '');
  const htmlLanguage = language === 'zh' ? 'zh-CN' : 'en';
  const title = options.title ?? `${model.contact?.name ?? ''} - ${TEXT[language].documentTitle}`;
  const siteTitle = options.siteTitle ?? 'ZHANG BAIZHOU';
  const refreshScript = options.refreshScript ? `\n${options.refreshScript}` : '';

  return [
    '<!DOCTYPE html>',
    `<html lang="${escapeHtml(htmlLanguage)}">`,
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="stylesheet" href="${pathPrefix}/assets/cv/cv.css">`,
    '</head>',
    '<body class="cv-standalone">',
    '<header class="cv-local-site-header">',
    `<a href="${pathPrefix}/">${escapeHtml(siteTitle)}</a>`,
    '</header>',
    `<main class="cv-page" data-language="${language}">`,
    renderCvFragment(model, { pathPrefix }),
    '</main>',
    `${refreshScript}</body>`,
    '</html>'
  ].join('\n');
}

function renderToolbar(language, pathPrefix) {
  const isEnglish = language === 'en';
  const suffix = isEnglish ? 'en' : 'zh';
  return [
    '<div class="cv-toolbar" aria-label="CV controls">',
    '  <div class="cv-language-switch" role="group" aria-label="Language">',
    `    <a href="${pathPrefix}/cv/en/"${isEnglish ? ' aria-current="page"' : ''}>EN</a>`,
    `    <a href="${pathPrefix}/cv/zh/"${isEnglish ? '' : ' aria-current="page"'}>中文</a>`,
    '  </div>',
    '  <div class="cv-downloads">',
    `    <a class="cv-download cv-download-primary" href="${pathPrefix}/assets/cv/zhang-baizhou-cv-${suffix}.pdf" download>PDF</a>`,
    `    <a class="cv-download" href="${pathPrefix}/assets/cv/zhang-baizhou-cv-${suffix}.docx" download>DOCX</a>`,
    '  </div>',
    '</div>'
  ].join('\n');
}

function normalizePathPrefix(input) {
  const candidate = String(input).trim();
  if (!candidate || candidate === '/') return '';
  return `/${candidate.split('/').filter(Boolean).join('/')}`;
}

function renderHeader(contact, copy) {
  const contactItems = [
    contact.email && emailLink(contact.email, `${copy.email}: ${contact.email}`),
    contact.website && externalLink(contact.website, `${copy.website}: ${contact.website}`),
    contact.orcid && externalLink(`https://orcid.org/${contact.orcid}`, `${copy.orcid}: ${contact.orcid}`),
    contact.location && `<span>${copy.location}: ${escapeHtml(contact.location)}</span>`
  ].filter(Boolean);

  return [
    '<header class="cv-header">',
    `  <p class="cv-document-title">${copy.documentTitle}</p>`,
    `  <h1>${escapeHtml(contact.name)}</h1>`,
    contact.role ? `  <p class="cv-role">${escapeHtml(contact.role)}</p>` : '',
    `  <address class="cv-contact">${contactItems.join('<span class="cv-contact-separator" aria-hidden="true">·</span>')}</address>`,
    '</header>'
  ].filter(Boolean).join('\n');
}

function renderSection(section, model) {
  const content = renderSectionContent(section, model);
  return [
    `<!-- cv-section: ${SECTION_MARKERS[section.id] ?? escapeHtml(section.id)} -->`,
    `<section class="cv-section cv-section-${escapeAttribute(section.id)}" data-section="${escapeAttribute(section.id)}">`,
    `  <h2>${escapeHtml(section.label)}</h2>`,
    content,
    '</section>'
  ].join('\n');
}

function renderSectionContent(section, model) {
  switch (section.id) {
    case 'profile':
      return `  <p class="cv-profile">${escapeHtml(section.items)}</p>`;
    case 'education':
      return renderEntryList(section.items, renderEducation);
    case 'publications':
      return renderPublications(section.items, model.author_aliases, model.language);
    case 'grants':
      return renderEntryList(section.items, (item) => renderGrant(item, model.language));
    case 'awards':
      return renderAwards(section.items);
    case 'patents':
      return renderEntryList(section.items, (item) => renderPatent(item, model.language));
    case 'projects':
      return renderEntryList(section.items, (item) => renderProject(item, model.language));
    case 'teaching':
      return renderEntryList(section.items, renderTeaching);
    case 'presentations':
      return renderEntryList(section.items, renderPresentation);
    case 'service':
      return renderService(section.items, model.language);
    default:
      return renderEntryList(section.items, renderGenericEntry);
  }
}

function renderEntryList(items, renderer) {
  const entries = Array.isArray(items) ? items : [];
  return `  <ul class="cv-list">\n${entries.map((item) => renderer(item)).join('\n')}\n  </ul>`;
}

function renderEducation(item) {
  return renderEntry(item.period, [
    item.degree && `<strong class="cv-entry-title">${escapeHtml(item.degree)}</strong>`,
    item.institution && `<span class="cv-entry-meta">${escapeHtml(item.institution)}</span>`
  ]);
}

function renderGrant(item, language) {
  const copy = TEXT[language === 'zh' ? 'zh' : 'en'];
  return renderEntry(item.period, [
    item.title && `<strong class="cv-entry-title">${escapeHtml(item.title)}</strong>`,
    joinText([item.funder, item.grant_number && `${copy.grantNumber} ${item.grant_number}`]),
    joinText([item.role, item.status, item.amount])
  ]);
}

function renderAwards(items) {
  const entries = Array.isArray(items) ? items : [];
  return `  <ul class="cv-list cv-awards">\n${entries.map((item) => [
    '    <li class="cv-award">',
    `      <span class="cv-period">${escapeHtml(item.year)}</span>`,
    '      <div class="cv-entry-body">',
    item.title ? `        <strong class="cv-entry-title">${escapeHtml(item.title)}</strong>` : '',
    item.issuer ? `        <span class="cv-award-issuer">${escapeHtml(item.issuer)}</span>` : '',
    '      </div>',
    '    </li>'
  ].filter(Boolean).join('\n')).join('\n')}\n  </ul>`;
}

function renderPublications(items, aliases = [], language = 'en') {
  const publications = Array.isArray(items) ? items.slice(0, 5) : [];
  const aliasSet = new Set(aliases);
  return `  <ol class="cv-publications">\n${publications.map((item) => renderPublication(item, aliasSet, language)).join('\n')}\n  </ol>`;
}

function renderPublication(item, aliases, language) {
  const authors = Array.isArray(item.authors)
    ? item.authors.map((author) => aliases.has(author)
      ? `<strong class="cv-owner-name">${escapeHtml(author)}</strong>`
      : escapeHtml(author)).join(', ')
    : escapeHtml(item.authors);
  const year = item.cv?.year;
  const title = localizedTitle(item, language);
  const volumeIssue = item.cv?.volume
    ? `${item.cv.volume}${hasValue(item.cv.issue) ? `(${item.cv.issue})` : ''}`
    : hasValue(item.cv?.issue) ? `no. ${item.cv.issue}` : '';
  const citationParts = [
    authors,
    hasValue(year) && `(${escapeHtml(year)})`,
    title && `<span class="cv-publication-title">${escapeHtml(title)}</span>`,
    item.source && `<em>${escapeHtml(item.source)}</em>`,
    joinText([volumeIssue, item.cv?.pages && `pp. ${item.cv.pages}`], ', '),
    item.DOI && (item.DOI_link
      ? externalLink(item.DOI_link, `DOI: ${item.DOI}`)
      : `<span>DOI: ${escapeHtml(item.DOI)}</span>`)
  ].filter(Boolean);

  return [
    '    <li class="cv-publication">',
    item.type ? `      <span class="cv-type">${escapeHtml(item.type)}</span>` : '',
    `      <p>${citationParts.join('. ')}.</p>`,
    '    </li>'
  ].filter(Boolean).join('\n');
}

function renderPatent(item, language) {
  const title = localizedTitle(item, language);
  return renderEntry(item.cv?.year, [
    title && `<strong class="cv-entry-title">${escapeHtml(title)}</strong>`,
    renderAuthors(item.authors),
    joinText([item.cv?.patent_number, item.cv?.status, item.source])
  ]);
}

function renderProject(item, language) {
  return renderEntry(item.cv?.period, [
    localizedProjectTitle(item, language) && `<strong class="cv-entry-title">${escapeHtml(localizedProjectTitle(item, language))}</strong>`,
    joinText([item.cv?.role, item.location]),
    item.detail === 'full' && item.cv?.contribution
      ? `<span class="cv-entry-detail">${escapeHtml(item.cv.contribution)}</span>`
      : ''
  ]);
}

function renderTeaching(item) {
  return renderEntry(item.cv?.period, [
    item.cv?.title && `<strong class="cv-entry-title">${escapeHtml(item.cv.title)}</strong>`,
    joinText([item.cv?.role, item.cv?.location])
  ]);
}

function renderPresentation(item) {
  return renderEntry(item.cv?.period, [
    item.cv?.title && `<strong class="cv-entry-title">${escapeHtml(item.cv.title)}</strong>`,
    joinText([item.cv?.presentation_type, item.cv?.role, item.cv?.location])
  ]);
}

function renderService(items, language) {
  const reviewers = Array.isArray(items?.reviewers) ? items.reviewers : [];
  if (!reviewers.length) return '  <p class="cv-empty"></p>';
  return `  <p class="cv-service"><strong>${TEXT[language === 'zh' ? 'zh' : 'en'].reviewers}:</strong> ${reviewers.map(escapeHtml).join('; ')}</p>`;
}

function renderGenericEntry(item) {
  if (typeof item !== 'object' || item === null) return `    <li>${escapeHtml(item)}</li>`;
  return renderEntry(item.period ?? item.year, Object.values(item).map(escapeHtml));
}

function renderEntry(period, bodyParts) {
  return [
    '    <li class="cv-entry">',
    `      <span class="cv-period">${escapeHtml(period)}</span>`,
    '      <div class="cv-entry-body">',
    ...bodyParts.filter(Boolean).map((part) => `        ${part}`),
    '      </div>',
    '    </li>'
  ].join('\n');
}

function renderAuthors(authors) {
  if (!Array.isArray(authors) || !authors.length) return '';
  return `<span class="cv-entry-meta">${authors.map(escapeHtml).join(', ')}</span>`;
}

function localizedTitle(item, language) {
  if (language === 'en' && hasValue(item.subtitle)) return item.subtitle;
  return item.title;
}

function localizedProjectTitle(item, language) {
  if (language === 'zh' && hasValue(item.subtitle)) return item.subtitle;
  return item.title;
}

function joinText(values, separator = ' · ') {
  const content = values.filter(hasValue).map(escapeHtml).join(separator);
  return content ? `<span class="cv-entry-meta">${content}</span>` : '';
}

function externalLink(url, text) {
  const href = httpsUrl(url);
  if (!href) return `<span>${escapeHtml(text)}</span>`;
  return `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
}

function emailLink(email, text) {
  const value = String(email).trim();
  const match = /^([^\s@<>]+)@([^\s@<>]+\.[^\s@<>]+)$/.exec(value);
  if (!match) return `<span>${escapeHtml(text)}</span>`;
  const href = `mailto:${encodeURIComponent(match[1])}@${encodeURIComponent(match[2])}`;
  return `<a href="${escapeAttribute(href)}">${escapeHtml(text)}</a>`;
}

function httpsUrl(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  try {
    return new URL(candidate).protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function escapeHtml(value) {
  if (!hasValue(value)) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
