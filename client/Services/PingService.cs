// LeoM — GTA VI multiplayer platform by 8a8.dev (https://8a8.dev) 
// (c) 8a8.dev · Apache-2.0 (see LICENSE/NOTICE) · keep this 8a8.dev attribution intact 
using System;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Threading.Tasks;

namespace LeoM.Services;

public sealed class PingService
{
    // Sends a minimal UDP probe to host:port and returns round-trip time in ms,
    // or -1 on timeout/error. The probe format matches the one the client will
    // use once the full Leonida protocol is defined.
    private static readonly byte[] Probe = { 0xFF, 0xFF, 0x00, 0x01 };

    public async Task<int> PingAsync(string host, int port, int timeoutMs = 2000)
    {
        using var udp = new UdpClient();
        try
        {
            udp.Client.ReceiveTimeout = timeoutMs;
            udp.Client.SendTimeout    = timeoutMs;

            var ep = new IPEndPoint(IPAddress.Any, 0);
            var sw = Stopwatch.StartNew();

            await udp.SendAsync(Probe, Probe.Length, host, port);

            var recvTask = udp.ReceiveAsync();
            var delay    = Task.Delay(timeoutMs);

            if (await Task.WhenAny(recvTask, delay) == recvTask)
            {
                sw.Stop();
                return (int)sw.ElapsedMilliseconds;
            }
            return -1;
        }
        catch
        {
            return -1;
        }
    }
}
