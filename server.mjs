import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(root, 'dist');
const localRoot = path.join(root, 'local');
const preferredPort = Number(process.env.PORT || 5173);

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const sendJson = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };

async function readFolder(folderName) {
  const values = [];
  try {
    for (const file of await fs.readdir(path.join(localRoot, folderName))) {
      if (file.endsWith('.json')) values.push(JSON.parse(await fs.readFile(path.join(localRoot, folderName, file), 'utf8')));
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return values;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/__local_workspace_load') {
      const cards = await readFolder('cards');
      const campaigns = await readFolder('campaigns');
      const battles = await readFolder('battles');
      sendJson(res, 200, { cards, campaigns, challenges: battles.filter((item) => item?.enemyTeam), battleLogs: battles.filter((item) => item?.events) });
      return;
    }
    if (req.url === '/__local_workspace_save' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      if (!['cards', 'battles', 'campaigns'].includes(payload.kind) || !payload.value?.id) throw new Error('Invalid save payload');
      const folder = path.join(localRoot, payload.kind);
      await fs.mkdir(folder, { recursive: true });
      const safeId = String(payload.value.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      await fs.writeFile(path.join(folder, `${payload.kind.slice(0, -1)}_${safeId}.json`), JSON.stringify(payload.value, null, 2));
      sendJson(res, 200, { ok: true });
      return;
    }
    let requestPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (requestPath === '/') requestPath = '/index.html';
    const filePath = path.resolve(distRoot, `.${requestPath}`);
    if (!filePath.startsWith(path.resolve(distRoot))) { res.writeHead(403); res.end('Forbidden'); return; }
    let content;
    try { content = await fs.readFile(filePath); } catch { content = await fs.readFile(path.join(distRoot, 'index.html')); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(content);
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
    spawn('start', [url], { shell: true, detached: true, stdio: 'ignore' }).unref();
  });
}

openServer(preferredPort);
