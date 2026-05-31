/**
 * StatusBar — sticky bottom ticker with live market & platform data.
 *
 * Data sources (no mocks):
 *   · CoinGecko public API  → XLM/BRL · XLM/USD · USDC/BRL
 *   · /api/oracle/pld       → PLD SE/CO · S · NE · N  (ONS CMO semi-horário)
 *   · /api/health           → Stellar Mainnet · Horizon latency
 *
 * Personalisation:
 *   · User's submercado (derived from operator.state) appears first, highlighted.
 *   · Role label appended at the end of each cycle.
 *   · When not logged in, defaults to SE/CO as primary submercado.
 *
 * Behaviour:
 *   - Items scroll continuously (CSS marquee, duplicated for seamless loop).
 *   - Scrolling pauses on hover so values can be read.
 *   - Crypto refreshes every 30 s; PLD every 5 min; health every 30 s.
 *   - All values degrade to "—" when the upstream is unreachable.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { API_BASE_URL } from "@/lib/api";
import { useOperator, type ParticipantRole } from "@/store/operator";

// ─── Types ────────────────────────────────────────────────────────────────────

type CryptoData = {
  xlm_brl:  number | null;
  xlm_usd:  number | null;
  usdc_brl: number | null;
};

type PldEntry = {
  submercado:  string;
  cmo_brl_mwh: number;
  pld_brl_mwh?: number;
};

type HealthData = {
  horizon_latency_ms: number | null;
  online: boolean;
};

type MarketSnap = {
  crypto:    CryptoData;
  pld:       PldEntry[];
  health:    HealthData;
  updatedAt: string | null;
  loading:   boolean;
};

type TickerItem = {
  label:    string;
  value:    string;
  accent?:  boolean;   // PLD values in success colour
  primary?: boolean;   // User's own submercado — stronger highlight
  dim?:     boolean;   // Secondary/role label items
};

// ─── Brazil submercado mapping (ANEEL) ────────────────────────────────────────

const STATE_TO_SUB: Record<string, string> = {
  // Sudeste / Centro-Oeste
  SP: "SE/CO", RJ: "SE/CO", MG: "SE/CO", ES: "SE/CO",
  GO: "SE/CO", DF: "SE/CO", MT: "SE/CO", MS: "SE/CO",
  // Sul
  PR: "S", SC: "S", RS: "S",
  // Nordeste (note: SE = Sergipe → NE)
  MA: "NE", PI: "NE", CE: "NE", RN: "NE", PB: "NE",
  PE: "NE", AL: "NE", SE: "NE", BA: "NE",
  // Norte
  AM: "N", AC: "N", RR: "N", RO: "N", PA: "N", AP: "N", TO: "N",
};

// ─── Role labels ──────────────────────────────────────────────────────────────

const ROLE_LABEL: Partial<Record<ParticipantRole, string>> = {
  GENERATOR:            "GEN · SELL-SIDE",
  SELLER:               "TRADER · ACTIVE",
  INVESTOR:             "INVESTOR",
  USER:                 "CONSUMER · ACL",
  UTILITY:              "UTILITY · GRID",
  REGULATORY_AUTHORITY: "REGULATORY · READ-ONLY",
};

const primaryRole = (roles: ParticipantRole[]): ParticipantRole | null =>
  (["GENERATOR", "UTILITY", "SELLER", "INVESTOR", "USER", "REGULATORY_AUTHORITY"] as ParticipantRole[])
    .find((r) => roles.includes(r)) ?? null;

// ─── Formatters ───────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const USD = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4,
});
const MWH = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const fmtBRL  = (v: number) => BRL.format(v);
const fmtUSD  = (v: number) => USD.format(v);
const fmtMWh  = (v: number) => `R$ ${MWH.format(v)}/MWh`;

// ─── Fetch helpers ────────────────────────────────────────────────────────────

const COINGECKO =
  "https://api.coingecko.com/api/v3/simple/price" +
  "?ids=stellar,usd-coin&vs_currencies=brl,usd&precision=4";

async function fetchCrypto(): Promise<CryptoData> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(COINGECKO, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const d = await res.json();
    return {
      xlm_brl:  d.stellar?.brl     ?? null,
      xlm_usd:  d.stellar?.usd     ?? null,
      usdc_brl: d["usd-coin"]?.brl ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPld(): Promise<PldEntry[]> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${API_BASE_URL}/api/oracle/pld`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Oracle ${res.status}`);
    const d = await res.json();
    return (d.prices ?? []) as PldEntry[];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHealth(): Promise<HealthData> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { horizon_latency_ms: null, online: false };
    const d = await res.json();
    const latency =
      typeof d?.horizon?.latency_ms === "number"
        ? d.horizon.latency_ms
        : typeof d?.latency_ms === "number"
          ? d.latency_ms
          : null;
    return { horizon_latency_ms: latency, online: true };
  } catch {
    return { horizon_latency_ms: null, online: false };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Item builder ─────────────────────────────────────────────────────────────

const PLD_ORDER = ["SE/CO", "S", "NE", "N"] as const;

function buildItems(
  snap:        MarketSnap,
  userSub:     string | null,
  roles:       ParticipantRole[],
): TickerItem[] {
  const { crypto, pld, health } = snap;
  const items: TickerItem[] = [];

  // ── PLD: user's submercado first (highlighted), others follow ──
  const orderedSubs = userSub
    ? [userSub, ...PLD_ORDER.filter((s) => s !== userSub)]
    : [...PLD_ORDER];

  for (const sub of orderedSubs) {
    const entry = pld.find((p) => p.submercado === sub);
    items.push({
      label:   `PLD ${sub}`,
      value:   entry != null ? fmtMWh(entry.pld_brl_mwh ?? entry.cmo_brl_mwh) : "—",
      accent:  true,
      primary: sub === userSub,
    });
  }

  // ── XLM/BRL — settlement token ──
  items.push({
    label: "XLM · BRL",
    value: crypto.xlm_brl != null ? fmtBRL(crypto.xlm_brl) : "—",
  });

  // ── XLM/USD — for investors / international reference ──
  if (roles.includes("INVESTOR") || roles.includes("SELLER") || roles.length === 0) {
    items.push({
      label: "XLM · USD",
      value: crypto.xlm_usd != null ? fmtUSD(crypto.xlm_usd) : "—",
    });
  }

  // ── USDC/BRL — BRL stability reference ──
  items.push({
    label: "USDC · BRL",
    value: crypto.usdc_brl != null ? fmtBRL(crypto.usdc_brl) : "—",
  });

  // ── Horizon rail latency ──
  items.push({
    label: "STELLAR · MAINNET",
    value: health.online
      ? health.horizon_latency_ms != null
        ? `${health.horizon_latency_ms} ms`
        : "ONLINE"
      : "CHECKING…",
    dim: !health.online,
  });

  // ── Role context label ──
  const role = primaryRole(roles);
  if (role) {
    const label = ROLE_LABEL[role];
    if (label) {
      items.push({ label: "ROLE", value: label, dim: true });
    }
  }

  return items;
}

// ─── Component ────────────────────────────────────────────────────────────────

const CRYPTO_INTERVAL_MS  = 30_000;
const PLD_INTERVAL_MS     = 5 * 60_000;
const HEALTH_INTERVAL_MS  = 30_000;

export function StatusBar() {
  const operator    = useOperator((s) => s.operator);
  const userSub     = operator?.state ? (STATE_TO_SUB[operator.state.toUpperCase()] ?? "SE/CO") : null;
  const roles       = operator?.roles ?? [];

  const [snap, setSnap] = useState<MarketSnap>({
    crypto:    { xlm_brl: null, xlm_usd: null, usdc_brl: null },
    pld:       [],
    health:    { horizon_latency_ms: null, online: false },
    updatedAt: null,
    loading:   true,
  });

  const refreshCrypto = useCallback(async () => {
    try {
      const crypto = await fetchCrypto();
      setSnap((prev) => ({
        ...prev,
        crypto,
        loading: false,
        updatedAt: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        }),
      }));
    } catch { /* keep previous */ }
  }, []);

  const refreshPld = useCallback(async () => {
    try {
      const pld = await fetchPld();
      setSnap((prev) => ({ ...prev, pld }));
    } catch { /* keep previous */ }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const health = await fetchHealth();
      setSnap((prev) => ({ ...prev, health }));
    } catch { /* keep previous */ }
  }, []);

  // Initial load: fetch all three in parallel
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    Promise.allSettled([fetchCrypto(), fetchPld(), fetchHealth()]).then(([c, p, h]) => {
      setSnap({
        crypto:    c.status === "fulfilled" ? c.value : { xlm_brl: null, xlm_usd: null, usdc_brl: null },
        pld:       p.status === "fulfilled" ? p.value : [],
        health:    h.status === "fulfilled" ? h.value : { horizon_latency_ms: null, online: false },
        updatedAt: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        }),
        loading: false,
      });
    });
  }, []);

  useEffect(() => {
    const id = setInterval(refreshCrypto, CRYPTO_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshCrypto]);

  useEffect(() => {
    const id = setInterval(refreshPld, PLD_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshPld]);

  useEffect(() => {
    const id = setInterval(refreshHealth, HEALTH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshHealth]);

  const items = buildItems(snap, userSub, roles);

  return (
    <div className="flex h-8 shrink-0 items-center border-t border-border bg-sidebar/90 backdrop-blur">

      {/* ── Fixed left: live indicator ─────────────────────── */}
      <div className="flex shrink-0 items-center gap-1.5 border-r border-border px-3 h-full">
        <span
          className={`h-1.5 w-1.5 rounded-full transition-colors ${
            snap.loading
              ? "bg-muted-foreground"
              : "animate-pulse bg-success"
          }`}
        />
        <span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-muted-foreground">
          Live
        </span>
      </div>

      {/* ── Scrolling ticker ───────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden h-full flex items-center">
        {snap.loading ? (
          <span className="px-4 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50 animate-pulse">
            Loading market data…
          </span>
        ) : (
          <div className="animate-ep-ticker flex items-center">
            <TickerContent items={items} />
            {/* Seamless duplicate */}
            <TickerContent items={items} />
          </div>
        )}
      </div>

      {/* ── Fixed right: submercado label (clock removed) ───── */}
      {userSub && operator && (
        <div className="shrink-0 border-l border-border px-3 h-full flex items-center">
          <span className="font-mono text-[8.5px] uppercase tracking-[0.15em] text-success/70">
            {userSub}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Ticker content ───────────────────────────────────────────────────────────

function TickerContent({ items }: { items: TickerItem[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={i} className="flex items-baseline shrink-0">
          {i > 0 && (
            <span className="mx-3 font-mono text-[8px] text-muted-foreground/30 select-none">
              ·
            </span>
          )}
          <span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-muted-foreground/70 mr-1.5">
            {item.label}
          </span>
          <span
            className={`font-mono text-[10px] tabular-nums font-medium ${
              item.primary
                ? "text-success font-semibold"
                : item.accent
                  ? "text-success/80"
                  : item.dim
                    ? "text-muted-foreground/60"
                    : "text-foreground/85"
            }`}
          >
            {item.value}
          </span>
        </span>
      ))}
      {/* Visual gap between the two copies */}
      <span className="mx-8 font-mono text-[8px] text-muted-foreground/20 select-none shrink-0">
        ◆
      </span>
    </>
  );
}
