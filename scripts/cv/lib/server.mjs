import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.js': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf'
};

export async function startStaticServer({ rootDir, renderCv, port = 0, getVersion = () => 0 }) {
  const assetRoot = resolve(rootDir, 'assets', 'cv');
  const connections = new Set();
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, { assetRoot, renderCv, getVersion });
    } catch {
      sendText(response, 500, 'Preview server error.');
    }
  });

  server.on('connection', (socket) => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
  });

  await listen(server, port);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Preview server did not expose a TCP address.');
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    close: async () => {
      for (const socket of connections) socket.destroy();
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    }
  };
}

async function handleRequest(request, response, { assetRoot, renderCv, getVersion }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method not allowed.');
    return;
  }

  const { pathname } = new URL(request.url, 'http://localhost');
  const language = pathname === '/cv/en/' ? 'en' : pathname === '/cv/zh/' ? 'zh' : null;
  if (language) {
    const html = await renderCv(language);
    send(response, 200, { 'content-type': 'text/html; charset=utf-8' }, html, request.method);
    return;
  }

  if (pathname === '/__cv_version') {
    sendText(response, 200, String(getVersion()), request.method);
    return;
  }

  const assetPath = resolveAssetPath(assetRoot, pathname);
  if (assetPath) {
    await serveAsset(response, request.method, assetRoot, assetPath);
    return;
  }

  sendText(response, 404, 'Not found.', request.method);
}

function resolveAssetPath(assetRoot, pathname) {
  if (!pathname.startsWith('/assets/cv/')) return null;

  try {
    const requestedPath = decodeURIComponent(pathname.slice('/assets/cv/'.length));
    if (!requestedPath) return null;
    const filePath = resolve(assetRoot, requestedPath);
    const pathWithinAssets = relative(assetRoot, filePath);
    if (pathWithinAssets.startsWith('..') || isAbsolute(pathWithinAssets)) return null;
    return filePath;
  } catch {
    return null;
  }
}

async function serveAsset(response, method, assetRoot, filePath) {
  const mimeType = MIME_TYPES[extname(filePath).toLowerCase()];
  if (!mimeType) {
    sendText(response, 404, 'Not found.', method);
    return;
  }

  try {
    const [realAssetRoot, realFilePath] = await Promise.all([realpath(assetRoot), realpath(filePath)]);
    if (!isWithin(realAssetRoot, realFilePath) || !(await stat(realFilePath)).isFile()) {
      sendText(response, 404, 'Not found.', method);
      return;
    }
    const body = method === 'HEAD' ? '' : await readFile(realFilePath);
    send(response, 200, { 'content-type': mimeType }, body, method);
  } catch (error) {
    if (['EACCES', 'ENOENT', 'ENOTDIR', 'EPERM'].includes(error.code)) {
      sendText(response, 404, 'Not found.', method);
      return;
    }
    throw error;
  }
}

function isWithin(rootPath, targetPath) {
  const pathWithinRoot = relative(rootPath, targetPath);
  return pathWithinRoot === '' || (!pathWithinRoot.startsWith('..') && !isAbsolute(pathWithinRoot));
}

function sendText(response, status, text, method = 'GET') {
  send(response, status, { 'content-type': 'text/plain; charset=utf-8' }, text, method);
}

function send(response, status, headers, body, method) {
  response.writeHead(status, { 'cache-control': 'no-store', ...headers });
  response.end(method === 'HEAD' ? undefined : body);
}

function listen(server, port) {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
}
