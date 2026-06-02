/**
 * Network connection status — a single source of truth, polled independently of
 * any page's own data fetching.
 *
 * One poller (started once at the app root via `useNetworkPolling`) refreshes the
 * store on an interval; every status indicator (header chip, status bar, the
 * Operations Dashboard badges, …) simply reads `useNetworkStore`. This keeps all
 * connection statuses consistent and updating in real time regardless of which
 * page is open or whether its data is loading.
 *
 *   · stellar → Stellar Mainnet + Horizon reachability (backend pings Horizon)
 *   · backend → EnergyPay backend API reachability
 */
import { useEffect } from "react";
import { create } from "zustand";
import { API_BASE_URL, apiStellarStatus } from "@/lib/api";

export type ConnStatus = {
  /** null = checking (first probe still in flight). */
  online: boolean | null;
  latencyMs: number | null;
  ledger: number | null;
  reason?: string;
};

interface NetworkState {
  /** Stellar Mainnet + Horizon (via backend /api/health/stellar). */
  stellar: ConnStatus;
  /** EnergyPay backend API (via /api/health). */
  backend: { online: boolean | null };
  lastUpdate: string | null;
  setStellar: (s: ConnStatus) => void;
  setBackend: (online: boolean | null) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  stellar: { online: null, latencyMs: null, ledger: null },
  backend: { online: null },
  lastUpdate: null,
  setStellar: (stellar) => set({ stellar, lastUpdate: new Date().toISOString() }),
  setBackend: (online) => set({ backend: { online } }),
}));

/** Polls both health endpoints once and updates the store. Never throws. */
export async function pollNetworkStatus(): Promise<void> {
  // Stellar Mainnet + Horizon reachability.
  try {
    const s = await apiStellarStatus();
    useNetworkStore.getState().setStellar({
      online: Boolean(s?.online),
      latencyMs: s?.latencyMs ?? null,
      ledger: s?.ledger ?? null,
      reason: s?.reason,
    });
  } catch {
    useNetworkStore.getState().setStellar({ online: false, latencyMs: null, ledger: null });
  }

  // Backend API reachability.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    const res = await fetch(`${API_BASE_URL}/api/health`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    useNetworkStore.getState().setBackend(res.ok);
  } catch {
    useNetworkStore.getState().setBackend(false);
  }
}

/**
 * Starts a single app-wide poller. Call ONCE at the root (e.g. in AppHeader,
 * which is mounted on every authenticated page). Every other component just
 * reads `useNetworkStore` — no per-component polling.
 */
export function useNetworkPolling(intervalMs = 15_000): void {
  useEffect(() => {
    pollNetworkStatus();
    const id = setInterval(pollNetworkStatus, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
