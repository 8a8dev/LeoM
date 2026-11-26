// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// 8a8 game server.

import http     from 'http';
import https    from 'https';
import path     from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import EventEmitter from 'events';
import { createUdpServer } from './udp.js';
import { createResourceServer } from './resources.js';
import { startConsole } from './console.js';
import { init as initBans, isBanned } from './bans.js';
import { OP } from '../shared/protocol.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const config = {
  name:         process.env.SERVER_NAME        ?? '8a8 Dev Server',
  description:  process.env.SERVER_DESC        ?? 'Development server',
  address:      process.env.SERVER_ADDRESS     ?? '',
  port:         parseInt(process.env.SERVER_PORT     ?? '30120'),
  resourcePort: parseInt(process.env.RESOURCE_PORT   ?? '8080'),
  maxPlayers:   parseInt(process.env.MAX_PLAYERS     ?? '32'),
  mode:         process.env.SERVER_MODE        ?? 'freeroam',
  tags:         (process.env.SERVER_TAGS ?? '').split(',').filter(Boolean),
  region:       process.env.SERVER_REGION      ?? 'us-east',
  language:     process.env.SERVER_LANG        ?? 'en',
  password:     !!process.env.SERVER_PASSWORD,
  version:      '1.0.2.1',
  masterUrl:    process.env.MASTER_URL         ?? 'http://localhost:3000/api',
  authUrl:      process.env.AUTH_URL           ?? 'http://localhost:4000',
  udpTimeoutMs: 5000,
  relays:       [],
};

if (!config.address) {
  console.error('SERVER_ADDRESS env var is required (your public IP)');
  process.exit(1);
}

// ── Script engine ─────────────────────────────────────────────────────────────

class ScriptEngine extends EventEmitter {
  #players;
  setPlayerStore(p) { this.#players = p; }

  buildApi() {
    const engine = this;
    return {
      on:            (ev, fn)      => engine.on(ev, fn),
      broadcast:     (msg)         => engine.emit('_broadcast', msg),
      kick:          (id, msg)     => engine.emit('_kick', { id, msg }),
      players:       ()            => this.#players?.all() ?? [],
      setMaxPlayers: (n)           => { config.maxPlayers = n; },
    };
  }
}

const scripts = new ScriptEngine();

async function loadScripts() {
  const { readdir } = await import('fs/promises');
  const files = (await readdir(path.join(__dir, 'scripts')).catch(() => []))
    .filter(f => f.endsWith('.js')).sort();
  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(path.join(__dir, 'scripts', file)).href);
      if (typeof mod.register === 'function') {
        mod.register(scripts.buildApi());
        console.log(`[scripts] loaded ${file}`);
      }
    } catch (err) {
      console.error(`[scripts] failed to load ${file}:`, err.message);
    }
  }
}

// ── UDP server ────────────────────────────────────────────────────────────────

const { sock, players } = createUdpServer(config.port, config, scripts);
scripts.setPlayerStore(players);

// Broadcast handler
scripts.on('_broadcast', (msg) => {
  const frame = Buffer.allocUnsafe(1 + 2 + Buffer.byteLength(msg));
  frame[0] = 0x20;
  frame.writeUInt16LE(Buffer.byteLength(msg), 1);
  Buffer.from(msg, 'utf8').copy(frame, 3);
  for (const p of players.all()) {
    if (p.authState === 'active') sock.send(frame, p.port, p.address);
  }
});

// Kick handler — wired
scripts.on('_kick', ({ id, msg }) => {
  const p = players.get(id);
  if (!p) return;
  const reasonBuf = Buffer.from(msg ?? 'Kicked', 'utf8');
  const frame     = Buffer.allocUnsafe(1 + 2 + reasonBuf.length);
  frame[0] = OP.DISCONNECT;
  frame.writeUInt16LE(reasonBuf.length, 1);
  reasonBuf.copy(frame, 3);
  sock.send(frame, p.port, p.address);
  scripts.emit('playerDisconnect', p);
  players.remove(id);
  console.log(`[kick] player ${id} "${p.name}": ${msg}`);
});

// ── Spatial grid world sync (20 Hz) ──────────────────────────────────────────
// Each player only receives updates from their 3×3 grid neighborhood (150-unit cells).

const CELL_SIZE = 150;

setInterval(() => {
  const active = players.all().filter(p => p.authState === 'active');
  if (active.length < 2) return;

  for (const recipient of active) {
    const neighbors = players.inNeighborhood(recipient.gridCell.cx, recipient.gridCell.cy)
      .filter(p => p.id !== recipient.id && p.authState === 'active');
    if (neighbors.length === 0) continue;

    // STATE_SYNC: [OP (1)] [seq u16 (2)] [count u16 (2)] per player: [netId u32][x f32][y f32][z f32][h f32][health u8][vx f32][vy f32][vz f32][vehicleNetId u32]
    const perPlayer = 4 + 4 + 4 + 4 + 4 + 1 + 4 + 4 + 4 + 4; // 37 bytes
    const buf       = Buffer.allocUnsafe(5 + neighbors.length * perPlayer);
    buf[0] = OP.STATE_SYNC;
    buf.writeUInt16LE(recipient.nextSeq(),    1);
    buf.writeUInt16LE(neighbors.length,       3);
    let off = 5;
    for (const p of neighbors) {
      buf.writeUInt32LE(p.netId,        off); off += 4;
      buf.writeFloatLE(p.position.x,    off); off += 4;
      buf.writeFloatLE(p.position.y,    off); off += 4;
      buf.writeFloatLE(p.position.z,    off); off += 4;
      buf.writeFloatLE(p.heading,       off); off += 4;
      buf[off++] = p.health & 0xFF;
      buf.writeFloatLE(p.velocity.x,    off); off += 4;
      buf.writeFloatLE(p.velocity.y,    off); off += 4;
      buf.writeFloatLE(p.velocity.z,    off); off += 4;
      buf.writeUInt32LE(p.vehicleNetId, off); off += 4;
    }
    sock.send(buf, recipient.port, recipient.address);
  }
}, 50);

// ── Master server registration ────────────────────────────────────────────────

let _serverId    = null;
let _serverToken = null;

async function masterPost(urlPath, body) {
  const payload = JSON.stringify(body);
  const url     = new URL(config.masterUrl + urlPath);
  const lib     = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Server-Token': _serverToken ?? '',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function registerWithMaster() {
  try {
    const result = await masterPost('/servers/register', {
      name: config.name, description: config.description, address: config.address,
      port: config.port, maxPlayers: config.maxPlayers, mode: config.mode,
      tags: config.tags, region: config.region, language: config.language,
      password: config.password, version: config.version,
    });
    _serverId    = result.id;
    _serverToken = result.token;
    console.log(`[master] registered  id=${_serverId}`);
  } catch (err) {
    console.warn('[master] registration failed:', err.message);
  }
}

async function sendHeartbeat() {
  if (!_serverId) { await registerWithMaster(); return; }
  try {
    await masterPost('/servers/heartbeat', { id: _serverId, players: players.count() });
  } catch (err) {
    console.warn('[master] heartbeat failed:', err.message);
    _serverId = null;
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────

await initBans();
await loadScripts();
await createResourceServer(config.resourcePort);
await registerWithMaster();
setInterval(sendHeartbeat, parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? '15000'));
startConsole(players, scripts, sock);

console.log(`[8a8.dev] LeoM game server — https://8a8.dev`);
console.log(`[server] "${config.name}"  ${config.address}:${config.port}`);
console.log(`[server] resources: http://${config.address}:${config.resourcePort}`);
console.log(`[server] auth:      ${config.authUrl}`);
console.log(`[server] master:    ${config.masterUrl}`);
