// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using LeoM.Models;

namespace LeoM.Services;

public sealed class SettingsService
{
    private static readonly string AppDir     = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "LeoM");
    private static readonly string SettingsFile = Path.Combine(AppDir, "settings.json");
    private static readonly string HistoryFile  = Path.Combine(AppDir, "history.json");

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public AppSettings Load()
    {
        try
        {
            if (File.Exists(SettingsFile))
            {
                var json = File.ReadAllText(SettingsFile);
                return JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
            }
        }
        catch { /* corrupt file — return defaults */ }
        return new AppSettings();
    }

    public void Save(AppSettings settings)
    {
        Directory.CreateDirectory(AppDir);
        File.WriteAllText(SettingsFile, JsonSerializer.Serialize(settings, JsonOpts));
    }

    public List<ConnectionHistory> LoadHistory()
    {
        try
        {
            if (File.Exists(HistoryFile))
            {
                var json = File.ReadAllText(HistoryFile);
                return JsonSerializer.Deserialize<List<ConnectionHistory>>(json) ?? new();
            }
        }
        catch { }
        return new();
    }

    public void AppendHistory(ConnectionHistory entry)
    {
        var history = LoadHistory();
        history.Insert(0, entry);
        if (history.Count > 100) history.RemoveRange(100, history.Count - 100);
        Directory.CreateDirectory(AppDir);
        File.WriteAllText(HistoryFile, JsonSerializer.Serialize(history, JsonOpts));
    }

    public string AppDir2 => AppDir;
}
