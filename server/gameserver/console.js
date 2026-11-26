// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// Stdin admin console. Runs in the game server process.
// Commands: status, kick <id> [reason], ban <id> [reason], unban <id>, bans, say <msg>, quit

import readline from 'readline';
import { ban, unban, list as banList, isBanned } from './bans.js';

export function startConsole(players, scripts, sock) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();

  rl.on('line', async (line) => {
    const parts   = line.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();

    switch (command) {
      case 'status': {
        const all = players.all().filter(p => p.authState === 'active');
        console.log(`Players online: ${all.length}`);
        for (const p of all) {
          console.log(`  [${p.id}] ${p.name}  ${p.address}:${p.port}  hp=${p.health}`);
        }
        break;
      }

      case 'kick': {
        const id     = parseInt(parts[1]);
        const reason = parts.slice(2).join(' ') || 'Kicked by admin';
        const p      = players.get(id);
        if (!p) { console.log(`Player ${id} not found`); break; }
        sendDisconnect(sock, p, reason);
        scripts.emit('playerDisconnect', p);
        players.remove(id);
        console.log(`Kicked ${p.name} (${id}): ${reason}`);
        break;
      }

      case 'ban': {
        const id     = parseInt(parts[1]);
        const reason = parts.slice(2).join(' ') || 'Banned by admin';
        const p      = players.get(id);
        if (!p) { console.log(`Player ${id} not found`); break; }
        const identifier = p.accountId ?? `${p.address}:${p.port}`;
        await ban(identifier, reason);
        sendDisconnect(sock, p, reason);
        scripts.emit('playerDisconnect', p);
        players.remove(id);
        console.log(`Banned ${p.name} (${identifier}): ${reason}`);
        break;
      }

      case 'unban': {
        const identifier = parts[1];
        if (!identifier) { console.log('Usage: unban <identifier>'); break; }
        const ok = await unban(identifier);
        console.log(ok ? `Unbanned ${identifier}` : `${identifier} not in ban list`);
        break;
      }

      case 'bans': {
        const bans = banList();
        if (bans.length === 0) { console.log('No bans.'); break; }
        for (const b of bans) console.log(`  ${b.identifier}  — ${b.reason}  (${b.bannedAt})`);
        break;
      }

      case 'say': {
        const msg = parts.slice(1).join(' ');
        if (!msg) { console.log('Usage: say <message>'); break; }
        scripts.emit('_broadcast', `[Admin] ${msg}`);
        console.log(`Broadcast: ${msg}`);
        break;
      }

      case 'quit':
      case 'exit':
        console.log('Shutting down...');
        process.exit(0);
        break;

      case '':
        break;

      default:
        console.log('Commands: status, kick <id> [reason], ban <id> [reason], unban <id>, bans, say <msg>, quit');
    }

    rl.prompt();
  });
}

function sendDisconnect(sock, player, reason) {
  const reasonBuf = Buffer.from(reason, 'utf8');
  const frame     = Buffer.allocUnsafe(1 + 2 + reasonBuf.length);
  frame[0] = 0x08; // OP.DISCONNECT
  frame.writeUInt16LE(reasonBuf.length, 1);
  reasonBuf.copy(frame, 3);
  sock.send(frame, player.port, player.address);
}
