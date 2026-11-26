// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// Ban list — persists to gameserver/bans.json.

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir   = path.dirname(fileURLToPath(import.meta.url));
const BAN_FILE = path.join(__dir, 'bans.json');

let _bans = new Map(); // identifier → { identifier, reason, bannedAt }

async function load() {
  try {
    const raw = await readFile(BAN_FILE, 'utf8');
    _bans = new Map(JSON.parse(raw).map(b => [b.identifier, b]));
  } catch { _bans = new Map(); }
}

async function save() {
  await writeFile(BAN_FILE, JSON.stringify([..._bans.values()], null, 2), 'utf8');
}

export async function init() { await load(); }

export async function ban(identifier, reason) {
  _bans.set(identifier, { identifier, reason: reason ?? '', bannedAt: new Date().toISOString() });
  await save();
}

export function isBanned(identifier) {
  return _bans.has(identifier);
}

export async function unban(identifier) {
  const had = _bans.delete(identifier);
  if (had) await save();
  return had;
}

export function list() {
  return [..._bans.values()];
}
