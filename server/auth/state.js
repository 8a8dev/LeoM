// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// Per-server player state persistence.
// State is keyed by serverId + accountId and stored as JSON files.
// Servers define what goes in the state; we just store/retrieve it.

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir    = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dir, 'data', 'state');

function statePath(serverId, accountId) {
  return path.join(DATA_DIR, serverId, `${accountId}.json`);
}

export async function loadState(serverId, accountId) {
  try {
    const raw = await readFile(statePath(serverId, accountId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null; // no saved state yet
  }
}

export async function saveState(serverId, accountId, state) {
  const file = statePath(serverId, accountId);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 2), 'utf8');
}

export async function deleteState(serverId, accountId) {
  const { unlink } = await import('fs/promises');
  try { await unlink(statePath(serverId, accountId)); } catch { /* already gone */ }
}
