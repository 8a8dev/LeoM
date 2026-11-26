// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace LeoM.Models;

public sealed class Server
{
    [JsonPropertyName("id")]          public string Id              { get; set; } = string.Empty;
    [JsonPropertyName("name")]        public string Name            { get; set; } = string.Empty;
    [JsonPropertyName("description")] public string Description     { get; set; } = string.Empty;
    [JsonPropertyName("address")]     public string Address         { get; set; } = string.Empty;
    [JsonPropertyName("port")]        public int    Port            { get; set; } = 30120;
    [JsonPropertyName("players")]     public int    Players         { get; set; }
    [JsonPropertyName("maxPlayers")]  public int    MaxPlayers      { get; set; }
    [JsonPropertyName("mode")]        public string Mode            { get; set; } = string.Empty;
    [JsonPropertyName("tags")]        public List<string> Tags      { get; set; } = new();
    [JsonPropertyName("region")]      public string Region          { get; set; } = string.Empty;
    [JsonPropertyName("language")]    public string Language        { get; set; } = string.Empty;
    [JsonPropertyName("featured")]    public bool   Featured        { get; set; }
    [JsonPropertyName("password")]    public bool   PasswordProtected { get; set; }
    [JsonPropertyName("version")]     public string GameVersion     { get; set; } = string.Empty;

    // Runtime-only, not from JSON
    [JsonIgnore] public int  PingMs    { get; set; } = -1;
    [JsonIgnore] public bool Favorite  { get; set; }
    [JsonIgnore] public string PingDisplay => PingMs < 0 ? "—" : $"{PingMs}";
    [JsonIgnore] public string PlayerDisplay => $"{Players}/{MaxPlayers}";
}

public sealed class ServerListResponse
{
    [JsonPropertyName("version")]   public string         Version   { get; set; } = string.Empty;
    [JsonPropertyName("timestamp")] public string         Timestamp { get; set; } = string.Empty;
    [JsonPropertyName("servers")]   public List<Server>   Servers   { get; set; } = new();
}
