import { Capacitor, registerPlugin } from "@capacitor/core";
import { getApiBase, setApiBase } from "./api";

interface Beacon {
  ip: string;
  port: number;
  name?: string;
}

interface LanDiscoveryPlugin {
  scan(options: { timeoutMs: number; port?: number }): Promise<{ beacons: Beacon[] }>;
  localIp(): Promise<{ ip: string | null }>;
}

const LanDiscovery = registerPlugin<LanDiscoveryPlugin>("LanDiscovery");

const BEACON_PORT = 47855;
const API_PORT = 8000;
const SCAN_TIMEOUT_PER_HOST = 400;
const SCAN_CONCURRENCY = 32;

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function probeBackend(base: string, timeoutMs = 2500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}/api/health`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) return false;
    const body = (await response.json().catch(() => null)) as { status?: string } | null;
    return body?.status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function scanByBeacon(timeoutMs = 4000): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { beacons } = await LanDiscovery.scan({ timeoutMs, port: BEACON_PORT });
    for (const beacon of beacons ?? []) {
      if (!beacon?.ip) continue;
      const base = `http://${beacon.ip}:${beacon.port || API_PORT}`;
      if (await probeBackend(base)) return base;
    }
  } catch {
    return null;
  }
  return null;
}

async function localIpv4(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    return (await LanDiscovery.localIp()).ip;
  } catch {
    return null;
  }
}

/** Bounded-concurrency sweep of the /24 around the device's own address. */
export async function scanSubnet(localIp: string | null): Promise<string | null> {
  if (!localIp) return null;
  const prefix = localIp.split(".").slice(0, 3).join(".");
  if (prefix.split(".").length !== 3) return null;

  const candidates: string[] = [];
  for (let host = 1; host <= 254; host++) {
    const ip = `${prefix}.${host}`;
    if (ip !== localIp) candidates.push(`http://${ip}:${API_PORT}`);
  }

  let index = 0;
  let found: string | null = null;
  const worker = async () => {
    while (!found && index < candidates.length) {
      const base = candidates[index++];
      if (await probeBackend(base, SCAN_TIMEOUT_PER_HOST)) {
        found = base;
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));
  return found;
}

export async function discoverBackend(): Promise<string | null> {
  return (await scanByBeacon()) ?? (await scanSubnet(await localIpv4()));
}

/** Returns true when requests can reach a backend (existing base or discovered). */
export async function ensureBackend(): Promise<boolean> {
  const current = getApiBase();
  if (await probeBackend(current)) return true;
  if (!isNative()) return false;
  const found = await discoverBackend();
  if (!found) return false;
  setApiBase(found);
  return true;
}
