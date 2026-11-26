// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;

namespace LeoM.Views;

public partial class CreateServerView : UserControl
{
    private Process? _serverProcess;

    public CreateServerView() => InitializeComponent();

    private void LaunchBtn_Click(object s, RoutedEventArgs e)
    {
        SrvError.Visibility  = Visibility.Collapsed;
        SrvStatus.Visibility = Visibility.Collapsed;

        if (string.IsNullOrWhiteSpace(SrvAddress.Text))
        { ShowError("Public IP is required."); return; }
        if (!int.TryParse(SrvPort.Text.Trim(), out var port) || port < 1 || port > 65535)
        { ShowError("Invalid port."); return; }

        // Build env vars for the server process
        var env = new System.Collections.Generic.Dictionary<string, string>
        {
            ["SERVER_NAME"]    = SrvName.Text.Trim(),
            ["SERVER_DESC"]    = SrvDesc.Text.Trim(),
            ["SERVER_ADDRESS"] = SrvAddress.Text.Trim(),
            ["SERVER_PORT"]    = port.ToString(),
            ["MAX_PLAYERS"]    = SrvMaxPlayers.Text.Trim(),
            ["SERVER_MODE"]    = SrvMode.Text.Trim(),
            ["SERVER_TAGS"]    = SrvTags.Text.Trim(),
            ["MASTER_URL"]     = App.Settings.Load().MasterServerUrl
                                    .Replace("/servers", "").Replace("/api/servers", "") + "",
            ["AUTH_URL"]       = App.Settings.Load().AuthServerUrl,
        };
        if (!string.IsNullOrWhiteSpace(SrvPassword.Password))
            env["SERVER_PASSWORD"] = SrvPassword.Password;

        // Find node.exe
        var nodePath = FindNode();
        if (nodePath is null) { ShowError("node.exe not found. Install Node.js 20+."); return; }

        // Find gameserver/server.js relative to LeoM.exe
        var serverJs = FindServerJs();
        if (serverJs is null) { ShowError("gameserver/server.js not found next to LeoM.exe."); return; }

        try
        {
            var psi = new ProcessStartInfo(nodePath, $"\"{serverJs}\"")
            {
                WorkingDirectory       = Path.GetDirectoryName(serverJs)!,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false,
                CreateNoWindow         = true,
            };
            foreach (var kv in env)
                psi.EnvironmentVariables[kv.Key] = kv.Value;

            _serverProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
            _serverProcess.OutputDataReceived += (_, args) => AppendConsole(args.Data);
            _serverProcess.ErrorDataReceived  += (_, args) => AppendConsole(args.Data);
            _serverProcess.Exited += (_, _) => Dispatcher.Invoke(() =>
            {
                AppendConsole("[server stopped]");
                LaunchBtn.IsEnabled = true;
                StopBtn.IsEnabled   = false;
                _serverProcess      = null;
            });

            _serverProcess.Start();
            _serverProcess.BeginOutputReadLine();
            _serverProcess.BeginErrorReadLine();

            LaunchBtn.IsEnabled = false;
            StopBtn.IsEnabled   = true;
            ShowStatus($"Server running on {SrvAddress.Text.Trim()}:{port}");
        }
        catch (Exception ex)
        {
            ShowError("Failed to start server: " + ex.Message);
        }
    }

    private void StopBtn_Click(object s, RoutedEventArgs e)
    {
        try { _serverProcess?.Kill(entireProcessTree: true); } catch { }
        _serverProcess    = null;
        LaunchBtn.IsEnabled = true;
        StopBtn.IsEnabled   = false;
        AppendConsole("[server stopped by user]");
    }

    private void AppendConsole(string? line)
    {
        if (line is null) return;
        Dispatcher.Invoke(() =>
        {
            ConsoleOut.Text += line + "\n";
            ConsoleScroll.ScrollToBottom();
        });
    }

    private void ShowError(string msg)
    {
        SrvError.Text       = msg;
        SrvError.Visibility = Visibility.Visible;
    }

    private void ShowStatus(string msg)
    {
        SrvStatus.Text       = msg;
        SrvStatus.Visibility = Visibility.Visible;
    }

    private static string? FindNode()
    {
        foreach (var candidate in new[] { "node.exe", @"C:\Program Files\nodejs\node.exe",
            @"C:\Program Files (x86)\nodejs\node.exe" })
        {
            if (File.Exists(candidate)) return candidate;
        }
        // Try PATH
        var pathVar = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in pathVar.Split(';'))
        {
            var full = Path.Combine(dir.Trim(), "node.exe");
            if (File.Exists(full)) return full;
        }
        return null;
    }

    private static string? FindServerJs()
    {
        // Look next to LeoM.exe, then relative to cwd
        var exeDir = AppContext.BaseDirectory;
        var candidates = new[]
        {
            Path.Combine(exeDir, "server", "gameserver", "server.js"),
            Path.Combine(exeDir, "..", "server", "gameserver", "server.js"),
            Path.Combine(exeDir, "..", "..", "server", "gameserver", "server.js"),
            Path.Combine(exeDir, "8a8-server", "gameserver", "server.js"),
            Path.Combine(exeDir, "..", "8a8-server", "gameserver", "server.js"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
                         "8a8-server", "gameserver", "server.js"),
        };
        foreach (var c in candidates)
            if (File.Exists(c)) return Path.GetFullPath(c);
        return null;
    }
}
