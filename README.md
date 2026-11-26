# LeoM

A third-party multiplayer platform for GTA VI — a launcher client plus a
self-hostable server stack (master list, accounts/auth, and the game server).
Think FiveM, but for your own private servers. Built by [8a8.dev](https://8a8.dev).

LeoM does **not** ship any game code or assets, and it does not connect to
Rockstar services. You bring your own legally obtained game build; LeoM only
launches it and handles the multiplayer side. It is not affiliated with
Rockstar Games or Take-Two.

> There is no public master server yet — run your own endpoint (below). Once a
> stable build is out, `8a8.dev` will host a shared one you can point at instead.

## Layout

```
client/   LeoM launcher (C# / WPF, .NET 9)
server/   backend (Node 20+): master list, auth, game server
```

## Requirements

- Windows 10/11
- [.NET 9 SDK](https://dotnet.microsoft.com/download) (to build the client)
- [Node.js 20+](https://nodejs.org) (to run the server)
- Your own GTA VI build (a folder containing `GTA6.exe`)

## 1. Run your endpoint (the server)

```powershell
cd server
npm install
copy .env.example .env    # edit .env if you want; localhost defaults work as-is
```

Open three terminals:

```powershell
npm run master       # server list   -> http://localhost:3000/api
npm run auth         # accounts/auth -> http://localhost:4000
npm run gameserver   # the game server itself (UDP 30120)
```

Quick check — both should return `{"status":"ok","poweredBy":"8a8.dev",...}`:

```powershell
curl http://localhost:3000/api/health
curl http://localhost:4000/auth/health
```

All ports and the public address live in `.env`. For a server other people can
reach, set `SERVER_ADDRESS` to your public IP and forward the UDP game port and
the TCP resource port (`8080`).

## 2. Build and run the client

```powershell
cd client
dotnet build -c Release
dotnet run -c Release
```

In the launcher:

1. **Settings** → set *Master server URL*, *Auth server URL* and the game folder
   (the directory with `GTA6.exe`). Defaults already point at `localhost`.
2. **Home** → create an account or log in. You must be logged in to join a server.
3. **Create Server** → start a game server straight from the client, or
4. **Browse** → join one from the list.

To ship a single `.exe` to friends:

```powershell
dotnet publish client/LeoM.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

They still need their own game files and either your endpoint or their own.

## How it fits together

- The **master** keeps the live server list. Game servers heartbeat it; the
  client reads it.
- The **auth** server issues session tokens on login and the game server checks
  them, so only logged-in players get in. Per-server player state is saved here.
- The **game server** runs the world (UDP), serves resources over HTTP, and has
  a small admin console (`status`, `kick`, `ban`, `say`, `quit`).

## License

Apache-2.0 — free to use, modify and redistribute, but you must keep the
`8a8.dev` attribution (see [LICENSE](LICENSE) and [NOTICE](NOTICE)). The credit
is in the file headers, the window title and the server health responses; leave
it in place. Made by [8a8.dev](https://8a8.dev).
