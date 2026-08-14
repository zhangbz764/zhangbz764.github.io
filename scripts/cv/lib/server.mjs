import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

export async function startStaticServer({
  rootDir,
  renderCv,
  port = 0,
  getVersion = () => 0,
  basePath = '',
  assetScope = 'cv'
}) {
  const assetRoot = assetScope === 'site' ? resolve(rootDir) : resolve(rootDir, 'assets', 'cv');
  const assetPrefix = assetScope === 'site' ? '/' : '/assets/cv/';
  const connections = new Set();
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, {
        assetRoot, assetPrefix, allowUnknownAssets: assetScope === 'site',
        renderCv, getVersion, basePath
      });
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

async function handleRequest(request, response, {
  assetRoot, assetPrefix, allowUnknownAssets, renderCv, getVersion, basePath
}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method not allowed.');
    return;
  }

  const requestedPath = new URL(request.url, 'http://localhost').pathname;
  const pathname = removeBasePath(requestedPath, basePath);
  if (pathname === null) {
    sendText(response, 404, 'Not found.', request.method);
    return;
  }
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

  const assetPath = resolveAssetPath(assetRoot, assetPrefix, pathname);
  if (assetPath) {
    await serveAsset(response, request.method, assetRoot, assetPath, allowUnknownAssets);
    return;
  }

  sendText(response, 404, 'Not found.', request.method);
}

function removeBasePath(pathname, basePath) {
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  if (!pathname.startsWith(`${basePath}/`)) return null;
  return pathname.slice(basePath.length);
}

function resolveAssetPath(assetRoot, assetPrefix, pathname) {
  if (!pathname.startsWith(assetPrefix)) return null;

  try {
    const requestedPath = decodeURIComponent(pathname.slice(assetPrefix.length));
    if (!requestedPath) return null;
    const filePath = resolve(assetRoot, requestedPath);
    const pathWithinAssets = relative(assetRoot, filePath);
    if (pathWithinAssets.startsWith('..') || isAbsolute(pathWithinAssets)) return null;
    return filePath;
  } catch {
    return null;
  }
}

async function serveAsset(response, method, assetRoot, filePath, allowUnknownAssets) {
  const mimeType = MIME_TYPES[extname(filePath).toLowerCase()]
    ?? (allowUnknownAssets ? 'application/octet-stream' : null);
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
