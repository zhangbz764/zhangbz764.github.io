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

export async function startPreviewServer({
  rootDir = defaultRootDir,
  port = 3000,
  open = false,
  watcherFactory = watchDirectory,
  openBrowser = openPreviewBrowser
} = {}) {
  let version = 0;
  let server;
  let closePromise;
  let closed = false;
  let previewError;
  const watchers = [];

  const close = (error) => {
    if (error && !previewError) previewError = error;
    if (!closePromise) {
      closePromise = closeResources(watchers, () => server).finally(() => {
        closed = true;
      });
    }
    return closePromise;
  };

  try {
    for (const directory of sourceDirectories) {
      const watcher = watcherFactory(resolve(rootDir, directory), {
        onChange: () => { version += 1; },
        onError: (error) => { void close(error).catch(() => {}); }
      });
      watchers.push(watcher);
    }

    server = await startStaticServer({
      rootDir,
      port,
      getVersion: () => version,
      renderCv: async (language) => {
        const models = await buildCvModels(rootDir);
        return renderStandalonePage(models[language], { refreshScript: refreshScript(version) });
      }
    });
    if (closePromise) {
      await server.close();
      throw previewError ?? new Error('Preview server closed during startup.');
    }

    const preview = {
      url: server.url,
      close: () => close(),
      get closed() { return closed; },
      get error() { return previewError; }
    };
    if (open) await openBrowser(`${preview.url}/cv/en/`);
    return preview;
  } catch (error) {
    await close(error);
    throw error;
  }
}

function refreshScript(version) {
  return `<script>
let cvVersion = ${version};
setInterval(async () => {
  const next = await fetch('/__cv_version', { cache: 'no-store' }).then((response) => response.text());
  if (cvVersion && next !== cvVersion) location.reload();
  cvVersion = next;
}, 1000);
</script>`;
}

function watchDirectory(directory, { onChange, onError }) {
  const watcher = watch(directory, { recursive: true }, onChange);
  watcher.on('error', onError);
  return watcher;
}

async function closeResources(watchers, getServer) {
  let closeError;
  for (const watcher of watchers) {
    try {
      watcher.close();
    } catch (error) {
      closeError ??= error;
    }
  }
  const server = getServer();
  if (server) {
    try {
      await server.close();
    } catch (error) {
      closeError ??= error;
    }
  }
  if (closeError) throw closeError;
}

async function openPreviewBrowser(url) {
  if (process.platform !== 'win32') return;
  const browser = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Start-Process -FilePath $args[0]',
    url
  ], { detached: true, stdio: 'ignore', windowsHide: true });
  browser.on('error', () => {});
  browser.unref();
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const preview = await startPreviewServer({
    rootDir: process.cwd(),
    open: !process.argv.includes('--no-open')
  });
  const url = `${preview.url}/cv/en/`;
  console.log(`CV preview: ${url}`);

  let closing = false;
  process.once('SIGINT', async () => {
    if (closing) return;
    closing = true;
    await preview.close();
  });
}
