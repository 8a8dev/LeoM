// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
// Example server resource. Drop resources into gameserver/resources/<name>/.
export function register(api) {
  api.on('playerConnect',    p => api.broadcast(`${p.name} connected.`));
  api.on('playerDisconnect', p => api.broadcast(`${p.name} disconnected.`));
}
