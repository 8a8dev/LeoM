// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System.Windows;
using System.Windows.Controls;

namespace LeoM.Views;

public partial class HistoryView : UserControl
{
    public HistoryView()
    {
        InitializeComponent();
        Loaded += (_, _) => Reload();
    }

    private void Reload() => HistoryGrid.ItemsSource = App.Settings.LoadHistory();

    private void Clear_Click(object s, RoutedEventArgs e)
    {
        var appDir = App.Settings.AppDir2;
        var file   = System.IO.Path.Combine(appDir, "history.json");
        if (System.IO.File.Exists(file)) System.IO.File.Delete(file);
        Reload();
    }
}
