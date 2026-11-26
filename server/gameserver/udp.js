// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// UDP listener — handles player connections, auth, and position updates.

import dgram from 'dgram';
import https from 'https';
import http  from 'http';
import {
  OP, NAT_TYPE,
  buildCapabilityHandshake, parseCapabilityHandshake,
  buildRelayInfo,
  nextTraversalSyncId,
  decodeGameModeJson,
} from '../shared/protocol.js';
import { PlayerStore } from './players.js';

export function createUdpServer(port, config, scripts) {
  const sock    = dgram.createSocket('udp4');
  const players = new PlayerStore();

  setInterval(() => players.prune(30_000), 10_000);

  sock.on('message', (msg, rinfo) => {
    if (msg.length < 1) return;

    const op  = msg[0];
    const ses = players.byAddr(rinfo.address, rinfo.port);

    // Raw 4-byte probe frame
    if (msg.length === 4 &&
        msg[0] === 0xFF && msg[1] === 0xFF &&
        msg[2] === 0x00 && msg[3] === 0x01) {
      handleProbe(msg, rinfo, sock, config);
      return;
    }

    switch (op) {
      case OP.PROBE_REQ:   handleProbe(msg, rinfo, sock, config);                 break;
      case OP.CONNECT_REQ: handleConnect(msg, rinfo, sock, players, config);      break;
      case OP.AUTH_REQ:    handleAuth(msg, rinfo, sock, players, scripts, config); break;
      case OP.POSITION_UPDATE: handlePosition(msg, rinfo, players);               break;
      case OP.DISCONNECT:
        if (ses) {
          console.log(`[-] disconnect  player ${ses.id}  ${rinfo.address}:${rinfo.port}`);
          scripts.emit('playerDisconnect', ses);
          players.remove(ses.id);
        }
        break;
    }
  });

  sock.on('error', err => console.error('[udp error]', err.message));
  sock.bind(port, () => console.log(`[udp] listening on :${port}`));

  return { sock, players };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

function handleProbe(_msg, rinfo, sock, config) {
  const ack = buildCapabilityHandshake(
    NAT_TYPE.OPEN,
    config.udpTimeoutMs ?? 5000,
    0,    // FilterMode: none
    1400, // Mtu
  );
  sock.send(ack, rinfo.port, rinfo.address);
}

function handleConnect(msg, rinfo, sock, players, config) {
  // Parse client capability offer (after opcode byte)
  const clientCaps = msg.length > 1 ? parseCapabilityHandshake(msg) : {};
  const timeoutMs  = Math.min(clientCaps.UdpTimeoutDur ?? 5000, config.udpTimeoutMs ?? 5000);

  const ses     = players.add(rinfo);
  ses.authState = 'connecting';
  ses.syncId    = nextTraversalSyncId();

  // CONNECT_ACK: opcode + playerId + syncId
  const ack = Buffer.allocUnsafe(1 + 4 + 4);
  ack[0] = OP.CONNECT_ACK;
  ack.writeUInt32LE(ses.id,     1);
  ack.writeUInt32LE(ses.syncId, 5);
  sock.send(ack, rinfo.port, rinfo.address);

  // Send our capability response
  const caps = buildCapabilityHandshake(NAT_TYPE.OPEN, timeoutMs, 0, 1400);
  sock.send(caps, rinfo.port, rinfo.address);

  // Send relay list if configured
  if (config.relays?.length) {
    sock.send(buildRelayInfo(config.relays), rinfo.port, rinfo.address);
  }

  console.log(`[+] connect  player ${ses.id}  ${rinfo.address}:${rinfo.port}`);
}

async function handleAuth(msg, rinfo, sock, players, scripts, config) {
  const ses = players.byAddr(rinfo.address, rinfo.port);
  if (!ses) return;

  // msg: [OP.AUTH_REQ (1)] [syncId u32le (4)] [tokenLen u16le (2)] [token utf8]
  if (msg.length < 7) { sendAuthDeny(sock, rinfo, 'packet too short'); return; }

  const syncId   = msg.readUInt32LE(1);
  const tokenLen = msg.readUInt16LE(5);

  if (syncId !== ses.syncId) { sendAuthDeny(sock, rinfo, 'syncId mismatch'); return; }

  // Try XOR-decoded JSON first, then plain JSON, then raw string token
  let token = null;
  try {
    const decoded = decodeGameModeJson(msg.slice(7, 7 + tokenLen));
    token = decoded.token ?? null;
  } catch {
    try {
      const plain = JSON.parse(msg.slice(7, 7 + tokenLen).toString('utf8'));
      token = plain.token ?? null;
    } catch {
      token = msg.slice(7, 7 + tokenLen).toString('utf8').trim();
    }
  }

  if (!token) { sendAuthDeny(sock, rinfo, 'no token'); return; }

  // Validate token against 8a8 auth server
  let accountInfo = null;
  try {
    accountInfo = await validateWithAuthServer(token, config.authUrl);
  } catch (err) {
    console.warn('[auth] auth server unreachable:', err.message);
    // If auth server is down, reject — no anonymous connections
    sendAuthDeny(sock, rinfo, 'auth server unavailable');
    return;
  }

  if (!accountInfo?.valid) {
    sendAuthDeny(sock, rinfo, 'invalid token');
    return;
  }

  ses.authState  = 'active';
  ses.name       = accountInfo.username ?? `Player_${ses.id}`;
  ses.accountId  = accountInfo.accountId;

  const ack = Buffer.allocUnsafe(5);
  ack[0] = OP.AUTH_ACK;
  ack.writeUInt32LE(ses.id, 1);
  sock.send(ack, rinfo.port, rinfo.address);

  console.log(`[✓] authed   player ${ses.id}  "${ses.name}"  ${rinfo.address}:${rinfo.port}`);
  scripts.emit('playerConnect', ses);
}

function handlePosition(msg, rinfo, players) {
  const ses = players.byAddr(rinfo.address, rinfo.port);
  if (!ses || ses.authState !== 'active') return;
  // [OP (1)] [x f32 (4)] [y f32 (4)] [z f32 (4)] [heading f32 (4)] [health u8 (1)] [vx f32] [vy f32] [vz f32] [vehicleNetId u32]
  if (msg.length < 17) return;
  ses.position.x  = msg.readFloatLE(1);
  ses.position.y  = msg.readFloatLE(5);
  ses.position.z  = msg.readFloatLE(9);
  ses.heading      = msg.readFloatLE(13);
  if (msg.length >= 18) ses.health = msg[17];
  if (msg.length >= 30) {
    ses.velocity.x  = msg.readFloatLE(18);
    ses.velocity.y  = msg.readFloatLE(22);
    ses.velocity.z  = msg.readFloatLE(26);
  }
  if (msg.length >= 34) ses.vehicleNetId = msg.readUInt32LE(30);
  ses.touch();
  ses.updateGridCell(150);
}

function sendAuthDeny(sock, rinfo, reason) {
  const reasonBuf = Buffer.from(reason, 'utf8');
  const frame     = Buffer.allocUnsafe(1 + 2 + reasonBuf.length);
  frame[0] = OP.AUTH_DENY;
  frame.writeUInt16LE(reasonBuf.length, 1);
  reasonBuf.copy(frame, 3);
  sock.send(frame, rinfo.port, rinfo.address);
}

function validateWithAuthServer(token, authUrl) {
  const url     = new URL((authUrl ?? 'http://localhost:4000') + '/auth/validate');
  const payload = JSON.stringify({ token });
  const lib     = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ valid: false }); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
