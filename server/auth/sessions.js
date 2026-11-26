// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// Session token store. Tokens expire after SESSION_TTL_MS.

import crypto from 'crypto';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const _sessions = new Map(); // token → session

export function create(accountId, username) {
  const token = crypto.randomBytes(32).toString('hex');
  _sessions.set(token, {
    token,
    accountId,
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function validate(token) {
  const ses = _sessions.get(token);
  if (!ses) return null;
  if (Date.now() > ses.expiresAt) { _sessions.delete(token); return null; }
  return { accountId: ses.accountId, username: ses.username };
}

export function invalidate(token) {
  _sessions.delete(token);
}

// Prune expired sessions every hour
setInterval(() => {
  const now = Date.now();
  for (const [tok, ses] of _sessions) {
    if (now > ses.expiresAt) _sessions.delete(tok);
  }
}, 60 * 60 * 1000);
