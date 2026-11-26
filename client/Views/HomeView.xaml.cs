// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace LeoM.Views;

public partial class HomeView : UserControl
{
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(8) };

    public HomeView()
    {
        InitializeComponent();
        Loaded += HomeView_Loaded;
    }

    private async void HomeView_Loaded(object s, RoutedEventArgs e)
    {
        var cfg = App.Settings.Load();

        // Restore logged-in state
        if (!string.IsNullOrWhiteSpace(cfg.AuthToken))
            await TryRestoreSession(cfg.AuthToken, cfg.AuthServerUrl);

        // Game installed?
        bool installed = App.Game.IsGameInstalled();
        GameStatus.Text       = installed ? "yes" : "not found";
        GameStatus.Foreground = installed ? OkBrush() : ErrBrush();

        // Master server ping
        MasterStatus.Text       = "checking...";
        MasterStatus.Foreground = GreyBrush();
        try
        {
            var (servers, _, err) = await App.ServerList.FetchAsync();
            MasterStatus.Text       = string.IsNullOrEmpty(err) ? "online" : "offline";
            MasterStatus.Foreground = string.IsNullOrEmpty(err) ? OkBrush() : ErrBrush();
            ServersCount.Text = servers.Count.ToString();
        }
        catch
        {
            MasterStatus.Text       = "offline";
            MasterStatus.Foreground = ErrBrush();
            ServersCount.Text = "—";
        }

        // Auth server ping
        AuthStatus.Text       = "checking...";
        AuthStatus.Foreground = GreyBrush();
        try
        {
            var r = await _http.GetAsync(cfg.AuthServerUrl.TrimEnd('/') + "/auth/health");
            AuthStatus.Text       = r.IsSuccessStatusCode ? "online" : "offline";
            AuthStatus.Foreground = r.IsSuccessStatusCode ? OkBrush() : ErrBrush();
        }
        catch
        {
            AuthStatus.Text       = "offline";
            AuthStatus.Foreground = ErrBrush();
        }
    }

    private async System.Threading.Tasks.Task TryRestoreSession(string token, string authUrl)
    {
        try
        {
            var r = await _http.PostAsJsonAsync(authUrl.TrimEnd('/') + "/auth/validate",
                new { token });
            if (!r.IsSuccessStatusCode) return;
            var json = await r.Content.ReadFromJsonAsync<JsonNode>();
            if (json?["valid"]?.GetValue<bool>() == true)
            {
                var username = json["username"]?.GetValue<string>() ?? "logged in";
                ShowLoggedIn(username);
            }
        }
        catch { /* auth server unreachable — stay logged-out UI */ }
    }

    private async void LoginBtn_Click(object s, RoutedEventArgs e)
    {
        AuthError.Visibility = Visibility.Collapsed;
        var cfg  = App.Settings.Load();
        var user = UsernameBox.Text.Trim();
        var pass = PasswordBox.Password;
        if (string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass))
        { ShowAuthError("Username and password required."); return; }

        try
        {
            var r = await _http.PostAsJsonAsync(cfg.AuthServerUrl.TrimEnd('/') + "/auth/login",
                new { username = user, password = pass });
            var json = await r.Content.ReadFromJsonAsync<JsonNode>();
            if (!r.IsSuccessStatusCode)
            { ShowAuthError(json?["error"]?.GetValue<string>() ?? "Login failed."); return; }

            var token    = json?["token"]?.GetValue<string>() ?? "";
            var username = json?["account"]?["username"]?.GetValue<string>() ?? user;
            cfg.AuthToken = token;
            App.Settings.Save(cfg);
            ShowLoggedIn(username);
            PasswordBox.Clear();
        }
        catch (Exception ex)
        {
            ShowAuthError("Auth server unreachable: " + ex.Message);
        }
    }

    private async void RegisterBtn_Click(object s, RoutedEventArgs e)
    {
        AuthError.Visibility = Visibility.Collapsed;
        var cfg  = App.Settings.Load();
        var user = UsernameBox.Text.Trim();
        var pass = PasswordBox.Password;
        if (string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass))
        { ShowAuthError("Username and password required."); return; }

        try
        {
            var r = await _http.PostAsJsonAsync(cfg.AuthServerUrl.TrimEnd('/') + "/auth/register",
                new { username = user, password = pass });
            var json = await r.Content.ReadFromJsonAsync<JsonNode>();
            if (!r.IsSuccessStatusCode)
            { ShowAuthError(json?["error"]?.GetValue<string>() ?? "Registration failed."); return; }

            var token    = json?["token"]?.GetValue<string>() ?? "";
            var username = json?["account"]?["username"]?.GetValue<string>() ?? user;
            cfg.AuthToken = token;
            App.Settings.Save(cfg);
            ShowLoggedIn(username);
            PasswordBox.Clear();
        }
        catch (Exception ex)
        {
            ShowAuthError("Auth server unreachable: " + ex.Message);
        }
    }

    private void LogoutBtn_Click(object s, RoutedEventArgs e)
    {
        var cfg = App.Settings.Load();
        // Fire-and-forget logout POST
        if (!string.IsNullOrWhiteSpace(cfg.AuthToken))
            _ = _http.PostAsJsonAsync(cfg.AuthServerUrl.TrimEnd('/') + "/auth/logout",
                new { token = cfg.AuthToken });
        cfg.AuthToken = string.Empty;
        App.Settings.Save(cfg);
        ShowLoggedOut();
    }

    private void ShowLoggedIn(string username)
    {
        LoggedInName.Text        = username;
        LoggedInState.Visibility = Visibility.Visible;
        LoginState.Visibility    = Visibility.Collapsed;
    }

    private void ShowLoggedOut()
    {
        LoggedInState.Visibility = Visibility.Collapsed;
        LoginState.Visibility    = Visibility.Visible;
    }

    private void ShowAuthError(string msg)
    {
        AuthError.Text       = msg;
        AuthError.Visibility = Visibility.Visible;
    }

    private void BrowseBtn_Click(object s, RoutedEventArgs e)
    {
        if (Window.GetWindow(this) is MainWindow mw) mw.Navigate("servers");
    }

    private void CreateServerBtn_Click(object s, RoutedEventArgs e)
    {
        if (Window.GetWindow(this) is MainWindow mw) mw.Navigate("createserver");
    }

    private void SettingsBtn_Click(object s, RoutedEventArgs e)
    {
        if (Window.GetWindow(this) is MainWindow mw) mw.Navigate("settings");
    }

    private static SolidColorBrush OkBrush()   => new(Color.FromRgb(0x4E, 0xC9, 0x4E));
    private static SolidColorBrush ErrBrush()  => new(Color.FromRgb(0xF4, 0x47, 0x47));
    private static SolidColorBrush GreyBrush() => new(Color.FromRgb(0x9D, 0x9D, 0x9D));
}
