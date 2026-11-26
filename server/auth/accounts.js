// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// Account store with bcrypt-style password hashing (crypto.scrypt).
// Persists to auth/data/accounts.json.

import crypto from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir     = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dir, 'data');
const ACCT_FILE = path.join(DATA_DIR, 'accounts.json');

let _accounts = new Map(); // username (lower) → account

async function load() {
  try {
    const raw = await readFile(ACCT_FILE, 'utf8');
    const arr = JSON.parse(raw);
    _accounts = new Map(arr.map(a => [a.username.toLowerCase(), a]));
  } catch {
    _accounts = new Map();
  }
}

async function save() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ACCT_FILE, JSON.stringify([..._accounts.values()], null, 2), 'utf8');
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await new Promise((res, rej) =>
    crypto.scrypt(password, salt, 64, (err, key) => err ? rej(err) : res(key.toString('hex')))
  );
  return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const derived = await new Promise((res, rej) =>
    crypto.scrypt(password, salt, 64, (err, key) => err ? rej(err) : res(key.toString('hex')))
  );
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
}

export async function init() { await load(); }

export async function createAccount(username, password, email) {
  const key = username.toLowerCase();
  if (_accounts.has(key)) throw new Error('Username already taken');
  if (username.length < 3 || username.length > 24)
    throw new Error('Username must be 3–24 characters');
  if (!/^[a-zA-Z0-9_-]+$/.test(username))
    throw new Error('Username may only contain letters, numbers, _ and -');
  if (password.length < 8)
    throw new Error('Password must be at least 8 characters');

  const account = {
    id:           crypto.randomBytes(8).toString('hex'),
    username,
    email:        email ?? '',
    passwordHash: await hashPassword(password),
    createdAt:    new Date().toISOString(),
    banned:       false,
    banReason:    '',
  };
  _accounts.set(key, account);
  await save();
  return { id: account.id, username: account.username, createdAt: account.createdAt };
}

export async function authenticate(username, password) {
  const account = _accounts.get(username.toLowerCase());
  if (!account) return null;
  if (account.banned) throw new Error(`Account banned: ${account.banReason}`);
  const ok = await verifyPassword(password, account.passwordHash);
  if (!ok) return null;
  return { id: account.id, username: account.username };
}

export function getById(id) {
  for (const a of _accounts.values()) {
    if (a.id === id) return { id: a.id, username: a.username, createdAt: a.createdAt };
  }
  return null;
}

export async function banAccount(id, reason) {
  for (const a of _accounts.values()) {
    if (a.id === id) { a.banned = true; a.banReason = reason ?? ''; await save(); return true; }
  }
  return false;
}
