// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;

namespace LeoM.Views;

public partial class SettingsView : UserControl
{
    public SettingsView()
    {
        InitializeComponent();
        Loaded += SettingsView_Loaded;
    }

    private void SettingsView_Loaded(object s, RoutedEventArgs e)
    {
        var cfg = App.Settings.Load();
        GamePathBox.Text  = cfg.GamePath;
        LaunchArgsBox.Text = cfg.LaunchArgs;
        MasterUrlBox.Text  = cfg.MasterServerUrl;
        AuthUrlBox.Text    = cfg.AuthServerUrl;
        MaxPingBox.Text    = cfg.MaxPing.ToString();
        RefreshBox.Text    = cfg.AutoRefreshSeconds.ToString();
        NicknameBox.Text   = cfg.Nickname;
    }

    private void BrowseGamePath_Click(object s, RoutedEventArgs e)
    {
        var dlg = new OpenFileDialog
        {
            Title  = "Select GTA6.exe",
            Filter = "GTA6.exe|GTA6.exe|Executables|*.exe"
        };
        if (dlg.ShowDialog() == true)
        {
            var dir = System.IO.Path.GetDirectoryName(dlg.FileName) ?? string.Empty;
            GamePathBox.Text = dir;
        }
    }

    private async void Save_Click(object s, RoutedEventArgs e)
    {
        var cfg = App.Settings.Load();
        cfg.GamePath          = GamePathBox.Text.Trim();
        cfg.LaunchArgs        = LaunchArgsBox.Text.Trim();
        cfg.MasterServerUrl   = MasterUrlBox.Text.Trim();
        cfg.AuthServerUrl     = AuthUrlBox.Text.Trim();
        cfg.Nickname          = NicknameBox.Text.Trim();

        if (int.TryParse(MaxPingBox.Text,  out var mp)) cfg.MaxPing            = mp;
        if (int.TryParse(RefreshBox.Text,  out var rf)) cfg.AutoRefreshSeconds = rf;

        App.Settings.Save(cfg);

        SaveStatus.Text       = "Saved.";
        SaveStatus.Visibility = Visibility.Visible;
        await Task.Delay(2000);
        SaveStatus.Visibility = Visibility.Collapsed;
    }
}
