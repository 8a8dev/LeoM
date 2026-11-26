// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// In-memory game server registry with heartbeat TTL and token auth.

import { HEARTBEAT_TTL_MS } from '../shared/protocol.js';

const _servers = new Map(); // id → entry

export function register(id, info) {
  const { _token, ...rest } = info;
  _servers.set(id, {
    id,
    name:          rest.name          ?? 'Unnamed Server',
    description:   rest.description   ?? '',
    address:       rest.address,
    port:          rest.port          ?? 30120,
    players:       rest.players       ?? 0,
    maxPlayers:    rest.maxPlayers    ?? 32,
    mode:          rest.mode          ?? 'freeroam',
    tags:          rest.tags          ?? [],
    region:        rest.region        ?? '',
    language:      rest.language      ?? 'en',
    featured:      rest.featured      ?? false,
    password:      rest.password      ?? false,
    version:       rest.version       ?? '',
    registeredAt:  Date.now(),
    lastHeartbeat: Date.now(),
    _token,          // stored separately, never sent to clients
  });
}

export function validateToken(id, token) {
  const entry = _servers.get(id);
  return !!entry && entry._token === token;
}

export function heartbeat(id, players) {
  const entry = _servers.get(id);
  if (!entry) return false;
  entry.lastHeartbeat = Date.now();
  if (players !== undefined) entry.players = players;
  return true;
}

export function unregister(id) {
  return _servers.delete(id);
}

export function get(id) {
  const entry = _servers.get(id);
  if (!entry) return null;
  const { _token, ...pub } = entry;
  return pub;
}

export function list() {
  const now   = Date.now();
  const alive = [];
  for (const [id, entry] of _servers) {
    if (now - entry.lastHeartbeat > HEARTBEAT_TTL_MS) {
      _servers.delete(id);
    } else {
      const { _token, ...pub } = entry;
      alive.push(pub);
    }
  }
  return alive;
}

setInterval(() => list(), 10_000);
