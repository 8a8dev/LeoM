// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LeoM.Models;

namespace LeoM.Services;

public sealed class ServerListService
{
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(10) };
    private readonly SettingsService _settings;
    private static readonly string CacheFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "LeoM", "cache", "servers.json");

    public ServerListService(SettingsService settings) => _settings = settings;

    public async Task<(List<Server> servers, string source, string error)> FetchAsync(CancellationToken ct = default)
    {
        var cfg = _settings.Load();
        try
        {
            var response = await _http.GetStringAsync(cfg.MasterServerUrl, ct);
            var result   = JsonSerializer.Deserialize<ServerListResponse>(response);
            if (result?.Servers is { Count: > 0 })
            {
                WriteCacheAsync(response);
                return (result.Servers, "live", string.Empty);
            }
            return (new List<Server>(), "live-empty", "Master server returned empty list.");
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            var (cached, cacheErr) = ReadCache();
            if (cached is { Count: > 0 })
                return (cached, "cache", $"Live fetch failed ({ex.Message}). Using cached list.");
            return (new List<Server>(), "none", $"Cannot reach master server: {ex.Message}");
        }
    }

    private (List<Server>? servers, string error) ReadCache()
    {
        try
        {
            if (!File.Exists(CacheFile)) return (null, "No cache.");
            var json   = File.ReadAllText(CacheFile);
            var result = JsonSerializer.Deserialize<ServerListResponse>(json);
            return (result?.Servers, string.Empty);
        }
        catch (Exception ex) { return (null, ex.Message); }
    }

    private async void WriteCacheAsync(string json)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(CacheFile)!);
            await File.WriteAllTextAsync(CacheFile, json);
        }
        catch { }
    }
}
