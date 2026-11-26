// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.Windows;
using System.Windows.Controls;
using LeoM.Models;
using LeoM.Services;

namespace LeoM.Views;

public partial class DirectConnectView : UserControl
{
    public DirectConnectView() => InitializeComponent();

    private void ConnectBtn_Click(object s, RoutedEventArgs e)
    {
        ErrorText.Visibility = Visibility.Collapsed;
        var ip = IpBox.Text.Trim();
        if (string.IsNullOrEmpty(ip)) { ShowError("IP address is required."); return; }
        if (!int.TryParse(PortBox.Text.Trim(), out var port) || port < 1 || port > 65535)
        { ShowError("Invalid port number."); return; }

        var server = new Server { Address = ip, Port = port, Name = $"{ip}:{port}", Id = Guid.NewGuid().ToString() };
        var conn = new ConnectionService(App.Game, App.Settings);
        _ = conn.ConnectAsync(server, PassBox.Password,
            new Progress<ConnProgress>(), System.Threading.CancellationToken.None);
    }

    private async void PingBtn_Click(object s, RoutedEventArgs e)
    {
        var ip = IpBox.Text.Trim();
        if (string.IsNullOrEmpty(ip)) { ShowError("IP address is required."); return; }
        if (!int.TryParse(PortBox.Text.Trim(), out var port)) { ShowError("Invalid port."); return; }

        PingBtn.IsEnabled = false;
        PingResult.Text = "pinging...";
        var ms = await App.Ping.PingAsync(ip, port);
        PingResult.Text = ms < 0 ? "timeout" : $"{ms} ms";
        PingBtn.IsEnabled = true;
    }

    private void ShowError(string msg)
    {
        ErrorText.Text = msg;
        ErrorText.Visibility = Visibility.Visible;
    }
}
