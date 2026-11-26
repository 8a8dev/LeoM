// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// HTTP resource server — serves server-side scripts and assets to connecting clients.
// Clients GET /manifest.json, diff against their local cache, then download deltas
// using GET /resources/:name/:file with Range header support.

import express      from 'express';
import crypto       from 'crypto';
import { readFile, readdir, stat, watch } from 'fs/promises';
import path         from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';

const __dir       = path.dirname(fileURLToPath(import.meta.url));
const RESOURCE_DIR = path.join(__dir, 'resources');

let _manifest = null;

async function sha256File(filePath) {
  const data = await readFile(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function buildManifest() {
  const resources = [];
  let entries;
  try { entries = await readdir(RESOURCE_DIR, { withFileTypes: true }); }
  catch { entries = []; }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const resDir = path.join(RESOURCE_DIR, entry.name);
    let files;
    try { files = await readdir(resDir); } catch { continue; }

    const fileList = [];
    for (const file of files) {
      if (file.startsWith('.')) continue;
      const filePath = path.join(resDir, file);
      try {
        const info = await stat(filePath);
        if (!info.isFile()) continue;
        const hash = await sha256File(filePath);
        fileList.push({ path: file, hash, size: info.size });
      } catch { /* skip */ }
    }
    resources.push({ name: entry.name, files: fileList });
  }

  _manifest = {
    version:   Date.now(),
    resources,
  };
  console.log(`[resources] manifest rebuilt: ${resources.length} resource(s)`);
  return _manifest;
}

export async function createResourceServer(resourcePort) {
  await buildManifest();

  // Watch for changes and rebuild
  try {
    const watcher = watch(RESOURCE_DIR, { recursive: true });
    (async () => {
      for await (const _evt of watcher) {
        await buildManifest().catch(() => {});
      }
    })();
  } catch { /* watch not supported on all platforms */ }

  const app = express();

  app.get('/manifest.json', (_req, res) => {
    res.json(_manifest);
  });

  app.get('/resources/:name/:file', async (req, res) => {
    const name     = path.basename(req.params.name);
    const file     = path.basename(req.params.file);
    const filePath = path.join(RESOURCE_DIR, name, file);

    let info;
    try { info = await stat(filePath); }
    catch { return res.status(404).json({ error: 'not found' }); }

    if (!info.isFile()) return res.status(404).json({ error: 'not found' });

    const total     = info.size;
    const rangeHdr  = req.headers['range'];

    if (rangeHdr) {
      const match = rangeHdr.match(/bytes=(\d+)-(\d*)/);
      if (!match) return res.status(416).send('Range Not Satisfiable');
      const start = parseInt(match[1]);
      const end   = match[2] ? parseInt(match[2]) : total - 1;
      if (start >= total || end >= total) return res.status(416).send('Range Not Satisfiable');
      res.status(206).set({
        'Content-Range':  `bytes ${start}-${end}/${total}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': end - start + 1,
      });
      createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.set({ 'Accept-Ranges': 'bytes', 'Content-Length': total });
      createReadStream(filePath).pipe(res);
    }
  });

  app.listen(resourcePort, () => {
    console.log(`[resources] HTTP server  :${resourcePort}`);
  });
}
