import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

const repoRoot = path.resolve(import.meta.dirname, '..');
let temporaryRoot;
let vite;
let origin;

before(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'splice-vite-security-'));
  process.chdir(temporaryRoot);
  vite = await createServer({
    configFile: path.join(repoRoot, 'vite.config.ts'),
    root: repoRoot,
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  await vite.listen();
  const address = vite.httpServer.address();
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await vite?.close();
  process.chdir(repoRoot);
  await rm(temporaryRoot, { recursive: true, force: true });
});

async function assertNoWorkspaceWrites() {
  await assert.rejects(readdir(path.join(temporaryRoot, 'local', 'campaigns')));
}

test('foreign-Origin mutation requests cannot write files', async () => {
  const response = await fetch(`${origin}/__local_workspace_save`, {
    method: 'POST',
    headers: {
      Origin: 'http://attacker.example',
      'Content-Type': 'application/json',
      'X-Local-CSRF-Token': 'invalid',
    },
    body: JSON.stringify({ kind: 'campaigns', value: { id: 'foreign-origin-test' } }),
  });
  assert.equal(response.status, 403);
  await assertNoWorkspaceWrites();
});

test('text/plain mutation requests cannot write files', async () => {
  const response = await fetch(`${origin}/__local_workspace_save`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'text/plain',
      'X-Local-CSRF-Token': 'invalid',
    },
    body: JSON.stringify({ kind: 'campaigns', value: { id: 'text-plain-test' } }),
  });
  assert.equal(response.status, 415);
  await assertNoWorkspaceWrites();
});

test('same-origin JSON mutation requests require and accept the process token', async () => {
  const html = await (await fetch(origin)).text();
  const token = html.match(/name="local-workspace-csrf-token" content="([a-f0-9]+)"/)?.[1];
  assert.ok(token);
  const response = await fetch(`${origin}/__local_workspace_save`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'X-Local-CSRF-Token': token,
    },
    body: JSON.stringify({ kind: 'campaigns', value: { id: 'valid-csrf-test' } }),
  });
  assert.equal(response.status, 200);
  const saved = await readFile(path.join(temporaryRoot, 'local', 'campaigns', 'campaign_valid_csrf_test.json'), 'utf8');
  assert.match(saved, /valid-csrf-test/);
});

test('mutation request bodies are rejected above the streaming limit', async () => {
  const html = await (await fetch(origin)).text();
  const token = html.match(/name="local-workspace-csrf-token" content="([a-f0-9]+)"/)?.[1];
  assert.ok(token);
  const response = await fetch(`${origin}/__local_campaign_runs_save`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'X-Local-CSRF-Token': token,
    },
    body: ' '.repeat(5_000_001),
  });
  assert.equal(response.status, 413);
  await assert.rejects(readFile(path.join(temporaryRoot, 'local', 'campaign_runs.json')));
});

test('invalid campaign JSON is rejected before stored data changes', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const { StorageService } = await vite.ssrLoadModule(path.join(repoRoot, 'src/data/storage.ts'));
  const key = 'splinter_custom_campaigns';
  localStorage.setItem(key, '[{"id":"existing"}]');
  const tooManyNodes = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [`node_${index}`, {
    id: `node_${index}`,
    type: 'end',
    title: 'End',
    outcome: 'neutral',
    message: 'Done',
  }]));
  const result = StorageService.importCampaignsJson(JSON.stringify([{
    id: 'oversized',
    name: 'Oversized',
    description: 'Rejected campaign',
    startNodeId: 'node_0',
    nodes: tooManyNodes,
  }]));
  assert.equal(result.success, false);
  assert.equal(localStorage.getItem(key), '[{"id":"existing"}]');
});