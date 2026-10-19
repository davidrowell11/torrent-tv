import { networkInterfaces } from 'node:os';

// Interface names VPN clients create (WireGuard, OpenVPN, NordLynx, Mullvad, Proton, IKEv2, PPTP...).
const VPN_NAME = /^(tun|tap|wg|utun|ppp|ipsec|nordlynx|proton|mullvad)|wireguard|openvpn|vpn|tap-windows/i;

/**
 * Best-effort VPN detection: a VPN-style interface with a routable IPv4 address.
 * (macOS always has idle utun interfaces with only IPv6 link-local addresses, so
 * those don't count.) This is awareness, not proof that traffic is tunnelled;
 * the README says so plainly.
 */
export function detectVpn(ifaces = networkInterfaces()): { connected: boolean; interfaceName?: string } {
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!VPN_NAME.test(name) || /tailscale/i.test(name)) continue;
    if (addrs?.some((a) => a.family === 'IPv4' && !a.internal)) return { connected: true, interfaceName: name };
  }
  return { connected: false };
}
