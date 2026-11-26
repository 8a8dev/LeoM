// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// Server-side script API — runs in the game server process.
// Server operators drop scripts here; this main.js is the default example.
// Scripts receive events from the game server and can call back via the api object.

export function register(api) {
  // api.on(event, handler)  — subscribe to server events
  // api.broadcast(msg)      — send a text message to all players
  // api.kick(playerId, msg) — kick a player
  // api.players()           — returns current player list
  // api.setMaxPlayers(n)    — update the slot count reported to master

  api.on('playerConnect', (player) => {
    console.log(`[script] player connected: ${player.name} (id=${player.id})`);
    api.broadcast(`${player.name} joined the server.`);
  });

  api.on('playerDisconnect', (player) => {
    console.log(`[script] player left: ${player.name} (id=${player.id})`);
    api.broadcast(`${player.name} left the server.`);
  });

  // Broadcast player count every 60s
  setInterval(() => {
    const count = api.players().length;
    console.log(`[script] players online: ${count}`);
  }, 60_000);
}
