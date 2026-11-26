// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using LeoM.Services;

namespace LeoM;

public partial class App : System.Windows.Application
{
    public static readonly SettingsService  Settings   = new();
    public static readonly ServerListService ServerList = new(Settings);
    public static readonly PingService       Ping       = new();
    public static readonly GameService       Game       = new(Settings);
}
