import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(root, 'dist');
const localRoot = path.join(root, 'local');
const preferredPort = Number(process.env.PORT || 5173);
const cardCatalogPath = path.join(localRoot, 'all_cards.json');
const cardApiEndpoints = ['https://api2.splinterlands.com/cards/get_details', 'https://api.splinterlands.io/cards/get_details', 'https://api.splinterlands.com/cards/get_details'];
const resolvedDistRoot = path.resolve(distRoot);

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const sendJson = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };

async function readFolder(folderName) {
  const values = [];
  try {
    for (const file of await fs.readdir(path.join(localRoot, folderName))) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = (await fs.readFile(path.join(localRoot, folderName, file), 'utf8')).replace(/^\uFEFF/, '');
        values.push(JSON.parse(content));
      } catch (error) {
        console.warn(`Skipping invalid local JSON file ${folderName}/${file}`, error.message);
      }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return values;
}

function isTrustedRequest(req) {
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    return originUrl.protocol === 'http:' && originUrl.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

async function readJsonBody(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw new Error('Content-Type must be application/json');
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 5_000_000) throw new Error('Request body is too large');
  }
  return JSON.parse(body);
}

async function loadOrCreateCardCatalog() {
  try {
    const cards = JSON.parse((await fs.readFile(cardCatalogPath, 'utf8')).replace(/^\uFEFF/, ''));
    if (Array.isArray(cards) && cards.length > 0) return cards;
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Could not read local/all_cards.json; downloading a fresh copy.', error);
  }

  let lastError;
  for (const endpoint of cardApiEndpoints) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const cards = await response.json();
      if (!Array.isArray(cards) || cards.length === 0) throw new Error('Card API returned no cards');
      const snapshot = cards.map(({ id, name, color, type, rarity, stats }) => ({ id, name, color, type, rarity, stats }));
      await fs.mkdir(localRoot, { recursive: true });
      await fs.writeFile(cardCatalogPath, JSON.stringify(snapshot), 'utf8');
      return snapshot;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Splinterlands card API is unavailable');
}

const server = http.createServer(async (req, res) => {
  try {
    if (!isTrustedRequest(req)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (req.url === '/__splinterlands_card_catalog') {
      if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end('Method Not Allowed'); return; }
      sendJson(res, 200, await loadOrCreateCardCatalog());
      return;
    }
    if (req.url === '/__local_workspace_load') {
      if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end('Method Not Allowed'); return; }
      const cards = await readFolder('cards');
      const campaigns = await readFolder('campaigns');
      const battles = await readFolder('battles');
      sendJson(res, 200, { cards, campaigns, challenges: battles.filter((item) => item?.enemyTeam), battleLogs: battles.filter((item) => item?.events) });
      return;
    }
    if (req.url === '/__local_workspace_save' && req.method === 'POST') {
      const payload = await readJsonBody(req);
      if (!['cards', 'battles', 'campaigns'].includes(payload.kind) || !payload.value?.id) throw new Error('Invalid save payload');
      const folder = path.join(localRoot, payload.kind);
      await fs.mkdir(folder, { recursive: true });
      const safeId = String(payload.value.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      await fs.writeFile(path.join(folder, `${payload.kind.slice(0, -1)}_${safeId}.json`), JSON.stringify(payload.value, null, 2));
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.url === '/__local_workspace_delete' && req.method === 'POST') {
      const payload = await readJsonBody(req);
      if (!['cards', 'battles', 'campaigns'].includes(payload.kind) || !payload.id) throw new Error('Invalid delete payload');
      const safeId = String(payload.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(localRoot, payload.kind, `${payload.kind.slice(0, -1)}_${safeId}.json`);
      try { await fs.unlink(filePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.url?.startsWith('/__local_workspace_')) {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }
    let requestPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (requestPath === '/') requestPath = '/index.html';
    const filePath = path.resolve(resolvedDistRoot, `.${requestPath}`);
    if (filePath !== resolvedDistRoot && !filePath.startsWith(`${resolvedDistRoot}${path.sep}`)) { res.writeHead(403); res.end('Forbidden'); return; }
    let content;
    let servedPath = filePath;
    try {
      content = await fs.readFile(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
      if (path.extname(requestPath)) { res.writeHead(404); res.end('Not Found'); return; }
      servedPath = path.join(resolvedDistRoot, 'index.html');
      content = await fs.readFile(servedPath);
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(servedPath).toLowerCase()] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) { console.error(error); sendJson(res, 500, { error: error.message }); }
});

function openServer(port) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && port !== 0) {
      console.warn(`Port ${port} is already in use; selecting an available port.`);
      openServer(0);
      return;
    }
    throw error;
  });

  server.listen(port, '127.0.0.1', () => {
    const actualPort = server.address().port;
    const url = `http://localhost:${actualPort}/`;
    console.log(`Splinterlands PvE Studio: ${url}`);
    const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  });
}

openServer(preferredPort);
