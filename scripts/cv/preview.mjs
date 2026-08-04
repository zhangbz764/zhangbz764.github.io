import { watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { buildCvModels } from './lib/model.mjs';
import { renderStandalonePage } from './lib/html.mjs';
import { startStaticServer } from './lib/server.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRootDir = resolve(dirname(scriptPath), '..', '..');
const sourceDirectories = ['_data', '_publications', '_projects', '_activities'];
const refreshScript = `<script>
let cvVersion;
setInterval(async () => {
  const next = await fetch('/__cv_version', { cache: 'no-store' }).then((response) => response.text());
  if (cvVersion && next !== cvVersion) location.reload();
  cvVersion = next;
}, 1000);
</script>`;

export async function startPreviewServer({ rootDir = defaultRootDir, port = 3000 } = {}) {
  let version = 0;
  const watchers = sourceDirectories.map((directory) => {
    const watcher = watch(resolve(rootDir, directory), { recursive: true }, () => {
      version += 1;
    });
    watcher.on('error', () => {});
    return watcher;
  });

  try {
    const server = await startStaticServer({
      rootDir,
      port,
      getVersion: () => version,
      renderCv: async (language) => {
        const models = await buildCvModels(rootDir);
        return renderStandalonePage(models[language], { refreshScript });
      }
    });
    return {
      ...server,
      close: async () => {
        for (const watcher of watchers) watcher.close();
        await server.close();
      }
    };
  } catch (error) {
    for (const watcher of watchers) watcher.close();
    throw error;
  }
}

async function openBrowser(url) {
  if (process.platform !== 'win32') return;
  const browser = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Start-Process -FilePath $args[0]',
    url
  ], { detached: true, stdio: 'ignore', windowsHide: true });
  browser.unref();
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const preview = await startPreviewServer({ rootDir: process.cwd() });
  const url = `${preview.url}/cv/en/`;
  console.log(`CV preview: ${url}`);
  if (!process.argv.includes('--no-open')) await openBrowser(url);

  let closing = false;
  process.once('SIGINT', async () => {
    if (closing) return;
    closing = true;
    await preview.close();
  });
}
