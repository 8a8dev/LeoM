// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// Shared packet codec for the 8a8 multiplayer stack.

export const UDP_PORT_DEFAULT  = 30120;
export const HEARTBEAT_TTL_MS  = 45_000;
export const NAT_TIMEOUT_DEFAULT_MS = 5000;

// 4-byte probe frame clients send to discover the server
export const PROBE_FRAME = Buffer.from([0xFF, 0xFF, 0x00, 0x01]);

export const NAT_TYPE = { OPEN: 0, MODERATE: 1, STRICT: 2, SYMMETRIC: 3 };

// Packet opcodes — single-byte prefix on every UDP frame
export const OP = {
  PROBE_REQ:       0x01,
  PROBE_ACK:       0x02,
  CONNECT_REQ:     0x03,
  CONNECT_ACK:     0x04,
  AUTH_REQ:        0x05,
  AUTH_ACK:        0x06,
  AUTH_DENY:       0x07,
  DISCONNECT:      0x08,
  HEARTBEAT:       0x09,
  POSITION_UPDATE: 0x10,
  STATE_SYNC:      0x11,
  RELAY_INFO:      0x12,
  RESOURCE_LIST:   0x13,
};

// ── Named-field wire codec ────────────────────────────────────────────────────
// Format for a capability packet payload (after the 1-byte opcode):
//   [fieldCount u16le]
//   per field: [keyLen u8][key utf8][typeCode u8][value...]
//
// Type codes:
export const TYPE = {
  INT32:  0x0c,   // 4 bytes LE signed
  UINT32: 0x0d,   // 4 bytes LE unsigned
  FLOAT:  0x0e,   // 4 bytes LE IEEE 754
  STRING: 0x0f,   // [len u16le][utf8 bytes]
  BOOL:   0x10,   // 1 byte  (0 or 1)
  BYTES:  0x11,   // [len u16le][bytes]
};

export function encodeField(key, typeCode, value) {
  const keyBuf = Buffer.from(key, 'utf8');
  let valBuf;
  switch (typeCode) {
    case TYPE.INT32:  valBuf = Buffer.allocUnsafe(4); valBuf.writeInt32LE(value);  break;
    case TYPE.UINT32: valBuf = Buffer.allocUnsafe(4); valBuf.writeUInt32LE(value); break;
    case TYPE.FLOAT:  valBuf = Buffer.allocUnsafe(4); valBuf.writeFloatLE(value);  break;
    case TYPE.BOOL:   valBuf = Buffer.from([value ? 1 : 0]);                       break;
    case TYPE.STRING: {
      const s = Buffer.from(String(value), 'utf8');
      valBuf = Buffer.allocUnsafe(2 + s.length);
      valBuf.writeUInt16LE(s.length, 0);
      s.copy(valBuf, 2);
      break;
    }
    case TYPE.BYTES: {
      const b = value instanceof Buffer ? value : Buffer.from(value);
      valBuf = Buffer.allocUnsafe(2 + b.length);
      valBuf.writeUInt16LE(b.length, 0);
      b.copy(valBuf, 2);
      break;
    }
    default: throw new Error(`Unknown type code 0x${typeCode.toString(16)}`);
  }
  const out = Buffer.allocUnsafe(1 + keyBuf.length + 1 + valBuf.length);
  let off = 0;
  out[off++] = keyBuf.length;
  keyBuf.copy(out, off); off += keyBuf.length;
  out[off++] = typeCode;
  valBuf.copy(out, off);
  return out;
}

export function encodeFields(fields) {
  // fields: [{key, type, value}]
  const parts = fields.map(f => encodeField(f.key, f.type, f.value));
  const body  = Buffer.concat(parts);
  const header = Buffer.allocUnsafe(2);
  header.writeUInt16LE(fields.length, 0);
  return Buffer.concat([header, body]);
}

export function decodeFields(buf) {
  // Returns plain object {key: value}
  if (buf.length < 2) return {};
  const count = buf.readUInt16LE(0);
  const result = {};
  let off = 2;
  for (let i = 0; i < count && off < buf.length; i++) {
    const keyLen = buf[off++];
    if (off + keyLen > buf.length) break;
    const key = buf.slice(off, off + keyLen).toString('utf8'); off += keyLen;
    const typeCode = buf[off++];
    switch (typeCode) {
      case TYPE.INT32:  result[key] = buf.readInt32LE(off);  off += 4; break;
      case TYPE.UINT32: result[key] = buf.readUInt32LE(off); off += 4; break;
      case TYPE.FLOAT:  result[key] = buf.readFloatLE(off);  off += 4; break;
      case TYPE.BOOL:   result[key] = buf[off++] !== 0;                break;
      case TYPE.STRING: { const len = buf.readUInt16LE(off); off += 2; result[key] = buf.slice(off, off + len).toString('utf8'); off += len; break; }
      case TYPE.BYTES:  { const len = buf.readUInt16LE(off); off += 2; result[key] = buf.slice(off, off + len); off += len; break; }
      default: off = buf.length; // unknown type, stop parsing
    }
  }
  return result;
}

// ── Capability handshake ──────────────────────────────────────────────────────

export function buildCapabilityHandshake(natType, udpTimeoutMs, filterMode, mtu) {
  const payload = encodeFields([
    { key: 'LclNatType',   type: TYPE.UINT32, value: natType     },
    { key: 'UdpTimeoutDur',type: TYPE.UINT32, value: udpTimeoutMs},
    { key: 'PortMapType',  type: TYPE.UINT32, value: 0           },
    { key: 'FilterMode',   type: TYPE.UINT32, value: filterMode  },
    { key: 'Mtu',          type: TYPE.UINT32, value: mtu         },
    { key: 'PcpState',     type: TYPE.BOOL,   value: false       },
  ]);
  const out = Buffer.allocUnsafe(1 + payload.length);
  out[0] = OP.PROBE_ACK;
  payload.copy(out, 1);
  return out;
}

export function parseCapabilityHandshake(buf) {
  // buf includes the leading opcode byte
  if (buf.length < 3) return {};
  return decodeFields(buf.slice(1));
}

// ── Relay info ────────────────────────────────────────────────────────────────

export function buildRelayInfo(relays) {
  const payload = JSON.stringify({
    relays: relays.map(r => ({ address: r.address, port: r.port })),
  });
  const json = Buffer.from(payload, 'utf8');
  const buf  = Buffer.allocUnsafe(1 + 2 + json.length);
  buf[0] = OP.RELAY_INFO;
  buf.writeUInt16LE(json.length, 1);
  json.copy(buf, 3);
  return buf;
}

// ── GameMode JSON (XOR-encoded ticket payload) ────────────────────────────────

export function decodeGameModeJson(raw) {
  const decoded = Buffer.from(raw.map(b => b ^ 0xAA));
  return JSON.parse(decoded.toString('utf8'));
}

export function encodeGameModeJson(obj) {
  const str = JSON.stringify(obj);
  return Buffer.from([...Buffer.from(str, 'utf8')].map(b => b ^ 0xAA));
}

// ── Traversal sync ID counter ─────────────────────────────────────────────────

let _traversalCounter = 0;
export function nextTraversalSyncId() {
  _traversalCounter = (_traversalCounter + 1) & 0x7FFFFFFF;
  return _traversalCounter;
}
