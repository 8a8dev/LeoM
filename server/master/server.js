// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// 8a8.dev master server — exposes /api/servers for the LeoM client.

import express from 'express';
import crypto  from 'crypto';
import { register, heartbeat, unregister, list, get, validateToken } from './registry.js';

const app  = express();
const PORT = process.env.MASTER_PORT ?? 3000;

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Server-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Rate limiting (register) ──────────────────────────────────────────────────

const _registerHits = new Map(); // ip → {count, resetAt}

function registerRateLimit(req, res, next) {
  const ip  = req.ip;
  const now = Date.now();
  let   rec = _registerHits.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + 60_000 };
    _registerHits.set(ip, rec);
  }
  if (++rec.count > 10) {
    const retryAfter = Math.ceil((rec.resetAt - now) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ error: 'Too many registration attempts', retryAfter });
  }
  next();
}

// ── Client-facing ─────────────────────────────────────────────────────────────

app.get('/api/servers', (_req, res) => {
  res.json({ version: '1.0', timestamp: new Date().toISOString(), servers: list() });
});

app.get('/api/servers/:id', (req, res) => {
  const server = get(req.params.id);
  if (!server) return res.status(404).json({ error: 'not found' });
  res.json(server);
});

// ── Game server registration ──────────────────────────────────────────────────

app.post('/api/servers/register', registerRateLimit, (req, res) => {
  const body = req.body;
  if (!body.address || !body.port)
    return res.status(400).json({ error: 'address and port are required' });

  const id    = crypto.randomBytes(8).toString('hex');
  const token = crypto.randomBytes(32).toString('hex');

  register(id, { ...body, _token: token });
  console.log(`[+] registered  ${id}  ${body.address}:${body.port}  "${body.name ?? ''}"`);
  res.json({ id, token });
});

app.post('/api/servers/heartbeat', (req, res) => {
  const { id, players } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });

  const token = req.headers['x-server-token'];
  if (!validateToken(id, token))
    return res.status(403).json({ error: 'invalid token' });

  const ok = heartbeat(id, players);
  res.json({ ok });
});

app.delete('/api/servers/:id', (req, res) => {
  const token = req.headers['x-server-token'];
  if (!validateToken(req.params.id, token))
    return res.status(403).json({ error: 'invalid token' });

  unregister(req.params.id);
  res.json({ ok: true });
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', poweredBy: '8a8.dev', servers: list().length, ts: Date.now() });
});

app.listen(PORT, () => {
  console.log(`8a8 master server  :${PORT}`);
  console.log(`  clients:   GET  /api/servers`);
  console.log(`  register:  POST /api/servers/register`);
});
