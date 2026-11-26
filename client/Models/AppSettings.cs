// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System.Text.Json.Serialization;

namespace LeoM.Models;

public sealed class AppSettings
{
    [JsonPropertyName("gamePath")]
    public string GamePath { get; set; } = string.Empty;

    [JsonPropertyName("masterServerUrl")]
    public string MasterServerUrl { get; set; } = "http://localhost:3000/api/servers";

    [JsonPropertyName("nickname")]
    public string Nickname { get; set; } = string.Empty;

    [JsonPropertyName("launchArgs")]
    public string LaunchArgs { get; set; } = string.Empty;

    [JsonPropertyName("autoRefreshSeconds")]
    public int AutoRefreshSeconds { get; set; } = 60;

    [JsonPropertyName("showPasswordProtected")]
    public bool ShowPasswordProtected { get; set; } = true;

    [JsonPropertyName("maxPing")]
    public int MaxPing { get; set; } = 300;

    [JsonPropertyName("closedWarning")]
    public bool ClosedBetaWarning { get; set; } = false;

    [JsonPropertyName("authServerUrl")]
    public string AuthServerUrl { get; set; } = "http://localhost:4000";

    [JsonPropertyName("authToken")]
    public string AuthToken { get; set; } = string.Empty;

    [JsonPropertyName("resourceCacheDir")]
    public string ResourceCacheDir { get; set; } = string.Empty;
}
