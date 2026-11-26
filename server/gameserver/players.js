// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// Player session state.

export class PlayerSession {
  constructor(id, rinfo) {
    this.id           = id;
    this.address      = rinfo.address;
    this.port         = rinfo.port;
    this.connectedAt  = Date.now();
    this.lastSeen     = Date.now();
    this.authState    = 'probing';  // probing → connecting → authenticating → active
    this.syncId       = 0;
    this.accountId    = null;
    this.name         = '';
    this.position     = { x: 0, y: 0, z: 0 };
    this.velocity     = { x: 0, y: 0, z: 0 };
    this.heading      = 0;
    this.health       = 100;
    this.vehicleNetId = 0;
    this.netId        = 0;
    this.seq          = 0;
    this.gridCell     = { cx: 0, cy: 0 };
  }

  touch() { this.lastSeen = Date.now(); }

  updateGridCell(cellSize = 150) {
    this.gridCell.cx = Math.floor(this.position.x / cellSize);
    this.gridCell.cy = Math.floor(this.position.y / cellSize);
  }

  nextSeq() {
    this.seq = (this.seq + 1) & 0xFFFF;
    return this.seq;
  }
}

export class PlayerStore {
  #sessions = new Map();   // id → PlayerSession
  #byAddr   = new Map();   // "addr:port" → id
  #nextId   = 1;

  add(rinfo) {
    const key = `${rinfo.address}:${rinfo.port}`;
    if (this.#byAddr.has(key)) return this.get(this.#byAddr.get(key));
    const id  = this.#nextId++;
    const ses = new PlayerSession(id, rinfo);
    ses.netId = id;
    this.#sessions.set(id, ses);
    this.#byAddr.set(key, id);
    return ses;
  }

  get(id)            { return this.#sessions.get(id); }
  byAddr(addr, port) { return this.#sessions.get(this.#byAddr.get(`${addr}:${port}`)); }
  all()              { return [...this.#sessions.values()]; }
  count()            { return this.#sessions.size; }

  remove(id) {
    const ses = this.#sessions.get(id);
    if (!ses) return;
    this.#byAddr.delete(`${ses.address}:${ses.port}`);
    this.#sessions.delete(id);
  }

  prune(timeoutMs = 30_000) {
    const cutoff = Date.now() - timeoutMs;
    for (const [id, ses] of this.#sessions) {
      if (ses.lastSeen < cutoff) {
        console.log(`[-] timeout  player ${id}  ${ses.address}:${ses.port}`);
        this.remove(id);
      }
    }
  }

  // Returns all players in the 3×3 grid neighborhood around cx, cy
  inNeighborhood(cx, cy) {
    const result = [];
    for (const p of this.#sessions.values()) {
      if (Math.abs(p.gridCell.cx - cx) <= 1 &&
          Math.abs(p.gridCell.cy - cy) <= 1) {
        result.push(p);
      }
    }
    return result;
  }
}
