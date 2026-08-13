import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

const workflowPath = new URL('../../.github/workflows/pages.yml', import.meta.url);

async function loadWorkflow() {
  let source = '';
  try {
    source = await readFile(workflowPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  assert.notEqual(source, '', 'Pages workflow must exist');
  return { source, workflow: YAML.parse(source) };
}

function buildSteps(workflow) {
  return workflow.jobs.build.steps;
}

function runSteps(workflow) {
  return buildSteps(workflow).filter((step) => step.run);
}

test('workflow parses on as an event key with the required triggers', async () => {
  const { workflow } = await loadWorkflow();

  assert.deepEqual(Object.keys(workflow.on).sort(), [
    'pull_request', 'push', 'workflow_dispatch'
  ]);
  assert.deepEqual(workflow.on.push.branches, ['main']);
});

test('workflow pins the approved actions and CI toolchain', async () => {
  const { source, workflow } = await loadWorkflow();
  const actions = buildSteps(workflow)
    .filter((step) => step.uses)
    .map((step) => step.uses);

  assert.deepEqual(actions, [
    'actions/checkout@v6',
    'actions/setup-node@v4',
    'ruby/setup-ruby@ec02537da5712d66d4d50a0f33b7eb52773b5ed1',
    'actions/configure-pages@v5',
    'actions/upload-pages-artifact@v4'
  ]);
  assert.equal(buildSteps(workflow).find((step) => step.uses === 'actions/setup-node@v4').with['node-version'], '22');
  assert.equal(buildSteps(workflow).find((step) => step.uses === 'actions/setup-node@v4').with.cache, 'npm');
  assert.match(source, /npx playwright install --with-deps chromium/);
  assert.match(source, /fonts-noto-cjk poppler-utils unzip/);
});

test('workflow runs validation and build commands in order with one Pages base path', async () => {
  const { workflow } = await loadWorkflow();
  const runs = runSteps(workflow);
  const commands = runs.map((step) => step.run);

  const expectedOrder = [
    'npm ci',
    'npm run test:cv',
    'npm run cv:check',
    'npm run cv:prepare',
    'bundle exec jekyll build',
    'npm run cv:artifacts'
  ];
  let previousIndex = -1;
  for (const command of expectedOrder) {
    const index = commands.findIndex((candidate) => candidate.includes(command));
    assert.ok(index > previousIndex, `${command} must follow the preceding build command`);
    previousIndex = index;
  }

  const jekyll = runs.find((step) => step.run.includes('bundle exec jekyll build'));
  const artifacts = runs.find((step) => step.run.includes('npm run cv:artifacts'));
  assert.match(jekyll.run, /--baseurl "\$\{\{ steps\.pages\.outputs\.base_path \}\}"/);
  assert.equal(jekyll.env.JEKYLL_ENV, 'production');
  assert.equal(artifacts.env.PAGES_BASE_PATH, '${{ steps.pages.outputs.base_path }}');
});

test('workflow validates all four non-empty artifacts and their document contents', async () => {
  const { source } = await loadWorkflow();
  const files = [
    'zhang-baizhou-cv-en.docx',
    'zhang-baizhou-cv-zh.docx',
    'zhang-baizhou-cv-en.pdf',
    'zhang-baizhou-cv-zh.pdf'
  ];

  for (const file of files) {
    assert.match(source, new RegExp(`test -s _site/assets/cv/${file.replace('.', '\\.')}`));
  }
  assert.match(source, /unzip -t _site\/assets\/cv\/zhang-baizhou-cv-en\.docx/);
  assert.match(source, /unzip -t _site\/assets\/cv\/zhang-baizhou-cv-zh\.docx/);
  assert.match(source, /pdftotext _site\/assets\/cv\/zhang-baizhou-cv-en\.pdf - \| grep -F "ZHANG Baizhou"/);
  assert.match(source, /pdftotext _site\/assets\/cv\/zhang-baizhou-cv-zh\.pdf - \| grep -F "张柏洲"/);
});

test('workflow uploads only the site and deploys non-PR builds with least privilege', async () => {
  const { workflow } = await loadWorkflow();
  const upload = buildSteps(workflow).find((step) => step.uses === 'actions/upload-pages-artifact@v4');
  const deploy = workflow.jobs.deploy;

  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(upload.with.path, '_site');
  assert.equal(deploy.if, "github.event_name != 'pull_request'");
  assert.deepEqual(deploy.permissions, { pages: 'write', 'id-token': 'write' });
  assert.equal(deploy.environment.name, 'github-pages');
  assert.deepEqual(deploy.steps.map((step) => step.uses), ['actions/deploy-pages@v4']);
});
