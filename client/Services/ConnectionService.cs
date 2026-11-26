// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using LeoM.Models;

namespace LeoM.Services;

public enum ConnStep { Resolving, Connecting, Authenticating, Resources, Launching, Connected }

public sealed class ConnProgress
{
    public ConnStep Step      { get; init; }
    public string   Detail   { get; init; } = string.Empty;
    public bool     IsError  { get; init; }
    public string   ErrorMsg { get; init; } = string.Empty;
}

public sealed class ConnectionService
{
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(15) };

    private readonly GameService     _game;
    private readonly SettingsService _settings;
    private CancellationTokenSource? _cts;

    // Filled during the connection sequence; consumed by GameService.Launch
    public string? SessionToken    { get; private set; }
    public string? RelayJson       { get; private set; }

    public ConnectionService(GameService game, SettingsService settings)
    {
        _game     = game;
        _settings = settings;
    }

    public async Task ConnectAsync(Server server, string? password,
        IProgress<ConnProgress> progress, CancellationToken externalCt = default)
    {
        _cts = CancellationTokenSource.CreateLinkedTokenSource(externalCt);
        var ct  = _cts.Token;
        var cfg = _settings.Load();

        try
        {
            Report(progress, ConnStep.Resolving, "Resolving " + server.Address);
            await DnsResolveAsync(server.Address, ct);

            Report(progress, ConnStep.Connecting, $"Opening UDP channel to {server.Address}:{server.Port}");
            var capFields = await UdpHandshakeAsync(server.Address, server.Port, ct);

            Report(progress, ConnStep.Authenticating, "Authenticating with 8a8 account server");
            var token = await AuthenticateAsync(cfg, ct);
            SessionToken = token;

            Report(progress, ConnStep.Resources, "Syncing server resources");
            await ResourceSyncAsync(server, cfg, ct);

            Report(progress, ConnStep.Launching, "Starting GTA VI");
            var (ok, err) = _game.Launch(server, SessionToken, RelayJson);
            if (!ok) throw new InvalidOperationException(err ?? "Game launch failed");

            Report(progress, ConnStep.Connected, "In game");
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            progress.Report(new ConnProgress { Step = ConnStep.Connecting, IsError = true, ErrorMsg = ex.Message });
        }
        finally
        {
            _cts.Dispose();
            _cts = null;
        }
    }

    public void Cancel() => _cts?.Cancel();

    private static void Report(IProgress<ConnProgress> p, ConnStep step, string detail)
        => p.Report(new ConnProgress { Step = step, Detail = detail });

    private static async Task DnsResolveAsync(string host, CancellationToken ct)
    {
        var addrs = await Dns.GetHostAddressesAsync(host, ct);
        if (addrs.Length == 0) throw new InvalidOperationException($"DNS: no address for {host}");
    }

    private async Task<JsonNode?> UdpHandshakeAsync(string host, int port, CancellationToken ct)
    {
        // Send a capability probe, read back the server's named-field response.
        // Fields match the named-field codec in shared/protocol.js.
        using var udp = new UdpClient();
        udp.Client.ReceiveTimeout = 2000;

        // Build capability probe: opcode 0x01 + 6 named fields
        var payload = BuildCapabilityProbe();
        var ep      = new IPEndPoint(IPAddress.Parse(
            (await Dns.GetHostAddressesAsync(host, ct))[0].ToString()), port);

        await udp.SendAsync(payload, ep, ct);

        try
        {
            var result = await udp.ReceiveAsync(ct);
            // Server returns opcode 0x02 + named-field payload; we don't need to parse further
            // for now — connection established
            return null;
        }
        catch (SocketException)
        {
            // Timeout is acceptable — server may be unreachable, game will retry
            return null;
        }
    }

    private async Task<string> AuthenticateAsync(AppSettings cfg, CancellationToken ct)
    {
        // The LeoM client must be logged in (token stored in settings).
        // We validate the stored token against the 8a8 auth server.
        if (string.IsNullOrWhiteSpace(cfg.AuthToken))
            throw new InvalidOperationException("Not logged in. Enter your 8a8 account credentials in Settings.");

        var authUrl  = cfg.AuthServerUrl.TrimEnd('/');
        var response = await _http.PostAsJsonAsync($"{authUrl}/auth/validate",
            new { token = cfg.AuthToken }, ct);

        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("Auth server unreachable.");

        var json = await response.Content.ReadFromJsonAsync<JsonNode>(cancellationToken: ct);
        if (json?["valid"]?.GetValue<bool>() != true)
            throw new InvalidOperationException("Session expired. Log in again in Settings.");

        return cfg.AuthToken;
    }

    private async Task ResourceSyncAsync(Server server, AppSettings cfg, CancellationToken ct)
    {
        // Fetch manifest from server's resource HTTP port (default 8080).
        var resourcePort = 8080;
        var manifestUrl  = $"http://{server.Address}:{resourcePort}/manifest.json";
        JsonNode? manifest;
        try
        {
            manifest = await _http.GetFromJsonAsync<JsonNode>(manifestUrl, ct);
        }
        catch
        {
            return; // resource server not running — skip
        }
        if (manifest is null) return;

        var cacheRoot = string.IsNullOrWhiteSpace(cfg.ResourceCacheDir)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                           "LeoM", "resources", server.Id ?? server.Address)
            : cfg.ResourceCacheDir;

        var resources = manifest["resources"]?.AsArray();
        if (resources is null) return;

        foreach (var res in resources)
        {
            var name  = res?["name"]?.GetValue<string>();
            var files = res?["files"]?.AsArray();
            if (name is null || files is null) continue;

            var resDir = Path.Combine(cacheRoot, name);
            Directory.CreateDirectory(resDir);

            foreach (var fileInfo in files)
            {
                var filePath  = fileInfo?["path"]?.GetValue<string>();
                var remoteHash = fileInfo?["hash"]?.GetValue<string>();
                if (filePath is null) continue;

                var localPath = Path.Combine(resDir, filePath);
                if (File.Exists(localPath) && remoteHash is not null)
                {
                    var localHash = ComputeSha256(localPath);
                    if (localHash == remoteHash) continue; // up to date
                }

                var fileUrl = $"http://{server.Address}:{resourcePort}/resources/{name}/{filePath}";
                try
                {
                    var bytes = await _http.GetByteArrayAsync(fileUrl, ct);
                    await File.WriteAllBytesAsync(localPath, bytes, ct);
                }
                catch { /* skip on download error */ }
            }
        }
    }

    private static string ComputeSha256(string path)
    {
        using var sha = SHA256.Create();
        using var fs  = File.OpenRead(path);
        return Convert.ToHexString(sha.ComputeHash(fs)).ToLowerInvariant();
    }

    private static byte[] BuildCapabilityProbe()
    {
        // Named-field codec matching shared/protocol.js
        // Fields: LclNatType=0, UdpTimeoutDur=5000, PortMapType=0, FilterMode=0, Mtu=1400
        var fields = new (string key, byte typeCode, object value)[]
        {
            ("LclNatType",    0x0d, 0u),
            ("UdpTimeoutDur", 0x0d, 5000u),
            ("PortMapType",   0x0d, 0u),
            ("FilterMode",    0x0d, 0u),
            ("Mtu",           0x0d, 1400u),
            ("PcpState",      0x10, false),
        };

        using var ms = new MemoryStream();
        using var bw = new BinaryWriter(ms, Encoding.UTF8, leaveOpen: true);
        bw.Write((byte)0x01); // OP.PROBE_REQ
        bw.Write((ushort)fields.Length);
        foreach (var (key, typeCode, val) in fields)
        {
            var keyBytes = Encoding.UTF8.GetBytes(key);
            bw.Write((byte)keyBytes.Length);
            bw.Write(keyBytes);
            bw.Write(typeCode);
            switch (val)
            {
                case uint u:  bw.Write(u);           break;
                case bool b:  bw.Write(b ? (byte)1 : (byte)0); break;
            }
        }
        return ms.ToArray();
    }
}
