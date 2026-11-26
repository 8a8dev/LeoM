// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.Text.Json.Serialization;

namespace LeoM.Models;

public sealed class ConnectionHistory
{
    [JsonPropertyName("serverId")]    public string ServerId   { get; set; } = string.Empty;
    [JsonPropertyName("serverName")]  public string ServerName { get; set; } = string.Empty;
    [JsonPropertyName("address")]     public string Address    { get; set; } = string.Empty;
    [JsonPropertyName("port")]        public int    Port       { get; set; }
    [JsonPropertyName("connectedAt")] public DateTime ConnectedAt { get; set; }
    [JsonPropertyName("durationSec")] public int    DurationSec { get; set; }
}
