// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.Diagnostics;
using System.IO;
using LeoM.Models;

namespace LeoM.Services;

public sealed class GameService
{
    private readonly SettingsService _settings;

    public GameService(SettingsService settings) => _settings = settings;

    public (bool ok, string? error) Launch(Server server, string? sessionToken = null, string? relayJson = null)
    {
        var cfg     = _settings.Load();
        var exePath = Path.Combine(cfg.GamePath, "GTA6.exe");

        if (string.IsNullOrWhiteSpace(cfg.GamePath))
            return (false, "Game path not configured. Set it in Settings.");

        if (!File.Exists(exePath))
            return (false, $"GTA6.exe not found at: {exePath}");

        var args = $"-leonidaconnect -host {server.Address} -port {server.Port}";
        if (!string.IsNullOrWhiteSpace(sessionToken))
            args += $" -sessiontoken {sessionToken}";
        if (!string.IsNullOrWhiteSpace(relayJson))
            args += $" -relay {relayJson}";
        if (!string.IsNullOrWhiteSpace(cfg.LaunchArgs))
            args += " " + cfg.LaunchArgs;

        try
        {
            var proc = new Process
            {
                StartInfo = new ProcessStartInfo(exePath, args)
                {
                    UseShellExecute  = true,
                    WorkingDirectory = cfg.GamePath
                }
            };
            proc.Start();
            return (true, null);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    public bool IsGameInstalled()
    {
        var cfg = _settings.Load();
        return !string.IsNullOrWhiteSpace(cfg.GamePath)
            && File.Exists(Path.Combine(cfg.GamePath, "GTA6.exe"));
    }

    public string? DetectGamePath()
    {
        string[] candidates =
        {
            @"C:\Program Files\Rockstar Games\Grand Theft Auto VI",
            @"C:\Program Files (x86)\Rockstar Games\Grand Theft Auto VI",
            @"D:\Rockstar Games\Grand Theft Auto VI",
            @"E:\Rockstar Games\Grand Theft Auto VI",
        };
        foreach (var dir in candidates)
        {
            if (File.Exists(Path.Combine(dir, "GTA6.exe")))
                return dir;
        }
        return null;
    }
}
