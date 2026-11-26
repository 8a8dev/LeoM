// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;
using LeoM.Models;
using LeoM.Services;

namespace LeoM.Views;

public partial class ServerBrowserView : UserControl
{
    private readonly ServerListService _svc;
    private readonly PingService       _ping;
    private readonly ObservableCollection<Server> _servers = new();
    private ICollectionView? _view;
    private CancellationTokenSource? _fetchCts;

    public ServerBrowserView()
    {
        InitializeComponent();
        _svc  = App.ServerList;
        _ping = App.Ping;

        RegionFilter.ItemsSource = new[] { "All Regions", "us-east", "us-west", "eu-west", "eu-central", "sa", "as-pacific" };
        RegionFilter.SelectedIndex = 0;
        ModeFilter.ItemsSource = new[] { "All Modes", "Roleplay", "Deathmatch", "Race", "Freeroam", "Custom" };
        ModeFilter.SelectedIndex = 0;

        _view = CollectionViewSource.GetDefaultView(_servers);
        _view.Filter = ApplyRowFilter;
        ServerGrid.ItemsSource = _view;

        Loaded += (_, _) => _ = RefreshAsync();
    }

    private async Task RefreshAsync()
    {
        _fetchCts?.Cancel();
        _fetchCts = new CancellationTokenSource();
        var ct = _fetchCts.Token;

        SetFetchState("fetching", false);
        StatusText.Text = "Fetching server list...";

        try
        {
            var (servers, source, error) = await _svc.FetchAsync(ct);
            if (ct.IsCancellationRequested) return;

            _servers.Clear();
            foreach (var s in servers) _servers.Add(s);

            var total = servers.Count;
            var players = servers.Sum(s => s.Players);
            StatusText.Text = $"{total} servers  •  {players} players online";

            if (!string.IsNullOrEmpty(error))
                StatusText.Text += $"  [{error}]";

            SetFetchState(source == "cache" ? "cached" : "live", true);

            // Ping all in background
            _ = PingAllAsync(servers, ct);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            SetFetchState("error", false);
            StatusText.Text = "Fetch failed: " + ex.Message;
        }
    }

    private async Task PingAllAsync(List<Server> servers, CancellationToken ct)
    {
        await Parallel.ForEachAsync(servers,
            new ParallelOptions { MaxDegreeOfParallelism = 20, CancellationToken = ct },
            async (s, token) =>
            {
                s.PingMs = await _ping.PingAsync(s.Address, s.Port, 2000);
                Dispatcher.Invoke(() => _view?.Refresh());
            });
    }

    private void SetFetchState(string state, bool ok)
    {
        FetchStatus.Text = state;
        FetchIndicator.Fill = state switch
        {
            "live"   => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FF4EC94E")),
            "cached" => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFFFC83D")),
            "error"  => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFF44747")),
            _        => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FF6D6D6D")),
        };
    }

    private bool ApplyRowFilter(object item)
    {
        if (item is not Server s) return false;

        var query = FilterBox.Text?.Trim().ToLowerInvariant() ?? string.Empty;
        if (!string.IsNullOrEmpty(query))
        {
            if (!s.Name.ToLowerInvariant().Contains(query) &&
                !s.Description.ToLowerInvariant().Contains(query) &&
                !s.Tags.Any(t => t.ToLowerInvariant().Contains(query)))
                return false;
        }

        var region = RegionFilter.SelectedItem as string;
        if (region is not null && region != "All Regions" &&
            !string.Equals(s.Region, region, StringComparison.OrdinalIgnoreCase))
            return false;

        var mode = ModeFilter.SelectedItem as string;
        if (mode is not null && mode != "All Modes" &&
            !string.Equals(s.Mode, mode, StringComparison.OrdinalIgnoreCase))
            return false;

        if (HideFullCheck.IsChecked == true && s.Players >= s.MaxPlayers)
            return false;

        return true;
    }

    private void FilterBox_TextChanged(object s, TextChangedEventArgs e) => _view?.Refresh();
    private void RegionFilter_SelectionChanged(object s, SelectionChangedEventArgs e) => _view?.Refresh();
    private void ModeFilter_SelectionChanged(object s, SelectionChangedEventArgs e) => _view?.Refresh();
    private void ApplyFilter(object s, RoutedEventArgs e) => _view?.Refresh();
    private async void Refresh_Click(object s, RoutedEventArgs e) => await RefreshAsync();

    private void ServerGrid_SelectionChanged(object s, SelectionChangedEventArgs e)
    {
        var server = ServerGrid.SelectedItem as Server;
        ConnectBtn.IsEnabled = server is not null;
        if (server is null) return;

        DetailName.Text    = server.Name;
        DetailAddr.Text    = $"{server.Address}:{server.Port}";
        DetailPlayers.Text = server.PlayerDisplay;
        DetailPing.Text    = server.PingDisplay + " ms";
        DetailRegion.Text  = server.Region;
        DetailVersion.Text = server.GameVersion;
        DetailDesc.Text    = server.Description;

        TagsPanel.Children.Clear();
        foreach (var tag in server.Tags)
        {
            var tb = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FF2D2D30")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FF4A4A4A")),
                BorderThickness = new Thickness(1),
                Margin = new Thickness(0, 0, 4, 2),
                Padding = new Thickness(5, 1, 5, 1),
                Child = new TextBlock { Text = tag, FontSize = 10, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FF9D9D9D")) }
            };
            TagsPanel.Children.Add(tb);
        }
    }

    private void ServerGrid_DoubleClick(object s, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (ServerGrid.SelectedItem is Server) ConnectBtn_Click(s, e);
    }

    private async void ConnectBtn_Click(object s, RoutedEventArgs e)
    {
        if (ServerGrid.SelectedItem is not Server server) return;
        ConnectBtn.IsEnabled = false;
        try
        {
            var conn = new ConnectionService(App.Game, App.Settings);
            await conn.ConnectAsync(server, null,
                new Progress<ConnProgress>(), System.Threading.CancellationToken.None);
        }
        finally
        {
            ConnectBtn.IsEnabled = true;
        }
    }
}
