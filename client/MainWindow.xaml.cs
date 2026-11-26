// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System.Windows;
using System.Windows.Controls;

namespace LeoM;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        NavList.SelectedIndex = 0;
    }

    public void Navigate(string page)
    {
        // Deselect both nav lists and select the right item
        foreach (ListBoxItem item in NavList.Items)
        {
            if ((item.Tag as string) == page) { NavList.SelectedItem = item; return; }
        }
        foreach (ListBoxItem item in NavBottom.Items)
        {
            if ((item.Tag as string) == page) { NavBottom.SelectedItem = item; return; }
        }
    }

    private void NavList_SelectionChanged(object s, SelectionChangedEventArgs e)
    {
        if (NavList.SelectedItem is ListBoxItem { Tag: string tag })
        {
            NavBottom.SelectedItem = null;
            ShowPage(tag);
        }
    }

    private void NavBottom_SelectionChanged(object s, SelectionChangedEventArgs e)
    {
        if (NavBottom.SelectedItem is ListBoxItem { Tag: string tag })
        {
            NavList.SelectedItem = null;
            ShowPage(tag);
        }
    }

    private void ShowPage(string page)
    {
        HomeView.Visibility      = page == "home"         ? Visibility.Visible : Visibility.Collapsed;
        ServersView.Visibility   = page == "servers"      ? Visibility.Visible : Visibility.Collapsed;
        DirectView.Visibility    = page == "direct"       ? Visibility.Visible : Visibility.Collapsed;
        SettingsView.Visibility  = page == "settings"     ? Visibility.Visible : Visibility.Collapsed;
        HistoryView.Visibility   = page == "history"      ? Visibility.Visible : Visibility.Collapsed;
        CreateSrvView.Visibility = page == "createserver" ? Visibility.Visible : Visibility.Collapsed;
    }

    private void MinBtn_Click(object s, RoutedEventArgs e)   => WindowState = WindowState.Minimized;
    private void MaxBtn_Click(object s, RoutedEventArgs e)
        => WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    private void CloseBtn_Click(object s, RoutedEventArgs e) => Close();
}
