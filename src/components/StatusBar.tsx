/**
 * StatusBar — sticky bottom ticker with live market data.
 *
 * Real-time data sources (no mocks):
 *   · CoinGecko public API  → BTC/BRL · BTC/USD · ETH/BRL · USDC/BRL
 *   · /api/oracle/pld       → PLD SE/CO · S · NE · N  (ONS CMO semi-horário)
 *
 * Behaviour:
 *   - Items scroll continuously (CSS marquee, duplicated for seamless loop).
 *   - Scrolling pauses on hover so values can be read.
 *   - Crypto refreshes every 30 s; PLD every 5 min (backend caches 10 min).
 *   - All values degrade to "—" when the upstream is unreachable.
 *   - The bar is always visible: the root layout uses h-screen + overflow-hidden.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { API_BASE_URL } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type CryptoData = {
  btc_brl:  number | null;
  btc_usd:  number | null;
  eth_brl:  number | null;
  usdc_brl: number | null;
};

type PldEntry = {
  submercado:  string;
  cmo_brl_mwh: number;
};

type MarketSnap = {
  crypto:    CryptoData;
  pld:       PldEntry[];
  updatedAt: string | null;
  loading:   boolean;
};

type TickerItem = {
  label:   string;
  value:   string;
  accent?: boolean;   // PLD values rendered in success colour
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", maximumFractionDigits: 0,
});
const BRL2 = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const USD = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});
const MWH = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const fmtBRL  = (v: number) => BRL.format(v);
const fmtBRL2 = (v: number) => BRL2.format(v);
const fmtUSD  = (v: number) => USD.format(v);
const fmtMWh  = (v: number) => `R$ ${MWH.format(v)}/MWh`;

// ─── Fetch helpers ────────────────────────────────────────────────────────────

const COINGECKO =
  "https://api.coingecko.com/api/v3/simple/price" +
  "?ids=bitcoin,usd-coin,ethereum&vs_currencies=brl,usd&precision=2";

async function fetchCrypto(): Promise<CryptoData> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(COINGECKO, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const d = await res.json();
    return {
      btc_brl:  d.bitcoin?.brl       ?? null,
      btc_usd:  d.bitcoin?.usd       ?? null,
      eth_brl:  d.ethereum?.brl      ?? null,
      usdc_brl: d["usd-coin"]?.brl   ?? null,
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

// ─── Item builder ─────────────────────────────────────────────────────────────

const PLD_ORDER = ["SE/CO", "S", "NE", "N"] as const;

function buildItems(snap: MarketSnap): TickerItem[] {
  const { crypto, pld } = snap;

  return [
    // ── Crypto ──
    {
      label: "BTC",
      value: crypto.btc_brl != null ? fmtBRL(crypto.btc_brl) : "—",
    },
    {
      label: "BTC · USD",
      value: crypto.btc_usd != null ? fmtUSD(crypto.btc_usd) : "—",
    },
    {
      label: "ETH",
      value: crypto.eth_brl != null ? fmtBRL(crypto.eth_brl) : "—",
    },
    {
      label: "USDC / BRL",
      value: crypto.usdc_brl != null ? fmtBRL2(crypto.usdc_brl) : "—",
    },
    // ── PLD ──
    ...PLD_ORDER.map((sub) => {
      const entry = pld.find((p) => p.submercado === sub);
      return {
        label: `PLD ${sub}`,
        value: entry != null ? fmtMWh(entry.cmo_brl_mwh) : "—",
        accent: true,
      };
    }),
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

const CRYPTO_INTERVAL_MS = 30_000;   // 30 s
const PLD_INTERVAL_MS    = 5 * 60_000; // 5 min

export function StatusBar() {
  const [snap, setSnap] = useState<MarketSnap>({
    crypto:    { btc_brl: null, btc_usd: null, eth_brl: null, usdc_brl: null },
    pld:       [],
    updatedAt: null,
    loading:   true,
  });

  // Crypto — refresh every 30 s
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
    } catch {
      /* keep previous values, don't set loading */
    }
  }, []);

  // PLD — refresh every 5 min
  const refreshPld = useCallback(async () => {
    try {
      const pld = await fetchPld();
      setSnap((prev) => ({ ...prev, pld }));
    } catch {
      /* keep previous values */
    }
  }, []);

  // Initial load: fetch both in parallel
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    Promise.allSettled([fetchCrypto(), fetchPld()]).then(([c, p]) => {
      setSnap({
        crypto:
          c.status === "fulfilled"
            ? c.value
            : { btc_brl: null, btc_usd: null, eth_brl: null, usdc_brl: null },
        pld: p.status === "fulfilled" ? p.value : [],
        updatedAt: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        }),
        loading: false,
      });
    });
  }, []);

  // Crypto interval
  useEffect(() => {
    const id = setInterval(refreshCrypto, CRYPTO_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshCrypto]);

  // PLD interval
  useEffect(() => {
    const id = setInterval(refreshPld, PLD_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshPld]);

  const items = buildItems(snap);

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
            Carregando dados de mercado…
          </span>
        ) : (
          /* Inner div is twice as wide (content duplicated).
             translateX(-50%) moves exactly one copy off-screen, loops seamlessly. */
          <div className="animate-ep-ticker flex items-center">
            <TickerContent items={items} />
            {/* Seamless duplicate */}
            <TickerContent items={items} />
          </div>
        )}
      </div>

      {/* ── Fixed right: last update timestamp ────────────── */}
      {snap.updatedAt && (
        <div className="shrink-0 border-l border-border px-3 font-mono text-[8.5px] uppercase tracking-[0.15em] text-muted-foreground/50 h-full flex items-center">
          {snap.updatedAt}
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
          {/* Separator before each item except the first */}
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
              item.accent ? "text-success" : "text-foreground/85"
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
