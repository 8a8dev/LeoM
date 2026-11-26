// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace LeoM.Services;

public sealed class FavoritesService
{
    private static readonly string FavoritesPath =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                     "LeoM", "favorites.json");

    public HashSet<string> Load()
    {
        try
        {
            if (!File.Exists(FavoritesPath)) return new HashSet<string>();
            var json = File.ReadAllText(FavoritesPath);
            var list = JsonSerializer.Deserialize<List<string>>(json);
            return list is null ? new HashSet<string>() : new HashSet<string>(list);
        }
        catch
        {
            return new HashSet<string>();
        }
    }

    private void Save(HashSet<string> favorites)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FavoritesPath)!);
        File.WriteAllText(FavoritesPath, JsonSerializer.Serialize(favorites));
    }

    public bool Contains(string serverId)
    {
        return Load().Contains(serverId);
    }

    public void Add(string serverId)
    {
        var favorites = Load();
        if (favorites.Add(serverId)) Save(favorites);
    }

    public void Remove(string serverId)
    {
        var favorites = Load();
        if (favorites.Remove(serverId)) Save(favorites);
    }
}
