import { describe, expect, it } from 'vitest';
import { detectVpn } from './vpn';

const v4 = (address: string) => ({ address, family: 'IPv4', internal: false, netmask: '', mac: '', cidr: null }) as const;
const v6ll = { address: 'fe80::1', family: 'IPv6', internal: false, netmask: '', mac: '', cidr: null, scopeid: 0 } as const;

describe('detectVpn', () => {
  it('finds WireGuard / OpenVPN style interfaces', () => {
    expect(detectVpn({ en0: [v4('192.168.1.4')], wg0: [v4('10.2.0.2')] })).toEqual({ connected: true, interfaceName: 'wg0' });
    expect(detectVpn({ 'NordLynx': [v4('10.5.0.2')] }).connected).toBe(true);
  });
  it('ignores idle macOS utun interfaces and Tailscale', () => {
    expect(detectVpn({ en0: [v4('192.168.1.4')], utun0: [v6ll], tailscale0: [v4('100.64.0.1')] }).connected).toBe(false);
  });
});
