// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// 8a8 account server — register, login, session validation, per-server state.
// This is entirely 8a8's own auth system, completely independent of any third party.
//
// Endpoints:
//   POST /auth/register        — create account
//   POST /auth/login           — get session token
//   POST /auth/logout          — invalidate session token
//   GET  /auth/me              — get account info for a token
//   POST /auth/validate        — game server calls this to check a player's token
//   GET  /auth/state/:serverId — load per-server player state (requires token)
//   PUT  /auth/state/:serverId — save per-server player state (requires token)
//
// Game servers call POST /auth/validate with the token the player sends during AUTH_REQ.
// If valid, they get back { valid: true, accountId, username }.

import express from 'express';
import { init as initAccounts, createAccount, authenticate, getById } from './accounts.js';
import { create as createSession, validate as validateSession, invalidate } from './sessions.js';
import { loadState, saveState } from './state.js';

const app  = express();
const PORT = parseInt(process.env.AUTH_PORT ?? '4000');

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function bearerToken(req) {
  const auth = req.headers['authorization'] ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

// ── Accounts ──────────────────────────────────────────────────────────────────

// POST /auth/register
// Body: { username, password, email? }
app.post('/auth/register', async (req, res) => {
  const { username, password, email } = req.body ?? {};
  if (!username || !password)
    return res.status(400).json({ error: 'username and password required' });
  try {
    const account = await createAccount(username, password, email);
    const token   = createSession(account.id, account.username);
    console.log(`[auth] registered  ${account.id}  "${account.username}"`);
    res.status(201).json({ account, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /auth/login
// Body: { username, password }
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password)
    return res.status(400).json({ error: 'username and password required' });
  try {
    const account = await authenticate(username, password);
    if (!account) return res.status(401).json({ error: 'invalid credentials' });
    const token = createSession(account.id, account.username);
    console.log(`[auth] login  ${account.id}  "${account.username}"`);
    res.json({ account, token });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// POST /auth/logout
// Header: Authorization: Bearer <token>
app.post('/auth/logout', (req, res) => {
  const token = bearerToken(req);
  if (token) invalidate(token);
  res.json({ ok: true });
});

// GET /auth/me
// Header: Authorization: Bearer <token>
app.get('/auth/me', (req, res) => {
  const token = bearerToken(req);
  const ses   = token ? validateSession(token) : null;
  if (!ses) return res.status(401).json({ error: 'not authenticated' });
  const account = getById(ses.accountId);
  res.json({ account, username: ses.username });
});

// ── Token validation (called by game servers) ─────────────────────────────────

// POST /auth/validate
// Body: { token }
// Returns: { valid: true, accountId, username } or { valid: false }
app.post('/auth/validate', (req, res) => {
  const { token } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'token required' });
  const ses = validateSession(token);
  if (!ses) return res.json({ valid: false });
  res.json({ valid: true, accountId: ses.accountId, username: ses.username });
});

// ── Per-server player state ───────────────────────────────────────────────────

// GET /auth/state/:serverId
// Header: Authorization: Bearer <token>
app.get('/auth/state/:serverId', async (req, res) => {
  const token = bearerToken(req);
  const ses   = token ? validateSession(token) : null;
  if (!ses) return res.status(401).json({ error: 'not authenticated' });
  const state = await loadState(req.params.serverId, ses.accountId);
  res.json({ state: state ?? {} });
});

// PUT /auth/state/:serverId
// Header: Authorization: Bearer <token>
// Body: { state: { ... } }
app.put('/auth/state/:serverId', async (req, res) => {
  const token = bearerToken(req);
  const ses   = token ? validateSession(token) : null;
  if (!ses) return res.status(401).json({ error: 'not authenticated' });
  const { state } = req.body ?? {};
  if (!state || typeof state !== 'object')
    return res.status(400).json({ error: 'state must be an object' });
  await saveState(req.params.serverId, ses.accountId, state);
  res.json({ ok: true });
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/auth/health', (_req, res) => res.json({ status: 'ok', poweredBy: '8a8.dev', ts: Date.now() }));

// ── Start ─────────────────────────────────────────────────────────────────────

await initAccounts();
app.listen(PORT, () => {
  console.log(`8a8 auth server  :${PORT}`);
  console.log(`  register:  POST /auth/register`);
  console.log(`  login:     POST /auth/login`);
  console.log(`  validate:  POST /auth/validate  (called by game servers)`);
  console.log(`  state:     GET/PUT /auth/state/:serverId`);
});
