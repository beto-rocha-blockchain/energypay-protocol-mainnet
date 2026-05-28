import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, Activity } from "lucide-react";
import { useSettlementRail } from "@/hooks/useSettlementRail";
import { useMarketContext } from "@/hooks/useMarketContext";

/* ── Types ── */

type SubMarketPrice = {
  subsistema: string;
  submercado: string;
  nome: string;
  cmo_brl_mwh: number;
  timestamp?: string;
};

type RegionData = {
  id: string;
  name: string;
  abbr: string;
  cx: number;
  cy: number;
  labelDx: number;
  labelDy: number;
};

/* ── Geographic region nodes (5 SIN macro-regions for map accuracy) ── */

/**
 * Geographic center of each macro-region projected onto the SVG coordinate space.
 * Projection: equirectangular, x = (74 + lon) * 10, y = (5.5 - lat) * 10.
 * labelDx/Dy offset the text label relative to the node so it doesn't overlap the outline.
 *
 * NOTE: For CCEE pricing there are 4 sub-markets (N, NE, SE/CO, S).
 * CO and SE are separate geographic SINs but share the SE/CO pricing zone.
 * The map shows all 5 geographic regions; the sidebar uses 4 CCEE sub-markets.
 */
const REGIONS: RegionData[] = [
  { id: "N",  name: "Norte",        abbr: "N",  cx: 95,  cy: 105, labelDx: 12,  labelDy: -4  },
  { id: "NE", name: "Nordeste",     abbr: "NE", cx: 330, cy: 115, labelDx: -75, labelDy: -14 },
  { id: "CO", name: "Centro-Oeste", abbr: "CO", cx: 165, cy: 215, labelDx: 12,  labelDy: -4  },
  { id: "SE", name: "Sudeste",      abbr: "SE", cx: 310, cy: 258, labelDx: -90, labelDy: -14 },
  { id: "S",  name: "Sul",          abbr: "S",  cx: 210, cy: 335, labelDx: 12,  labelDy: -4  },
];

/**
 * Brazil silhouette from Natural Earth 110m simplified GeoJSON.
 * Projected with: x = (74 + longitude) × 10, y = (5.5 − latitude) × 10.
 * ~190 vertices — faithful to the real cartographic outline.
 */
const BRAZIL_PATH =
  "M164,357 L177,344 188,334 195,330 204,324 204,316 199,310 194,312 " +
  "196,307 197,301 197,295 193,293 190,295 186,295 185,291 184,282 " +
  "182,279 175,276 171,278 161,276 161,262 158,257 161,255 161,249 " +
  "163,245 165,237 163,231 157,228 156,224 158,218 138,218 135,206 " +
  "137,206 137,201 135,199 135,193 129,190 123,190 119,187 112,185 " +
  "108,181 97,180 86,171 87,164 86,160 87,153 74,154 68,158 60,162 " +
  "57,165 52,165 45,165 39,166 35,165 35,150 27,156 18,156 14,150 " +
  "8,150 10,145 4,139 0,130 3,128 3,124 9,121 8,116 10,112 11,108 " +
  "23,101 31,99 32,98 41,98 46,71 46,66 44,60 40,57 40,50 45,48 " +
  "47,49 48,45 42,44 42,38 61,38 65,35 67,38 69,44 71,42 77,48 " +
  "85,47 86,44 94,42 98,40 99,36 106,33 106,31 97,30 96,24 96,17 " +
  "92,14 94,14 101,15 109,17 112,15 119,13 130,10 134,6 133,3 " +
  "138,3 140,5 139,9 142,11 145,15 142,19 140,27 143,33 144,37 " +
  "150,42 155,42 156,40 159,40 163,38 167,36 172,36 175,36 180,37 " +
  "181,35 179,33 180,30 184,31 189,30 195,32 199,34 202,31 204,32 " +
  "206,34 211,34 214,30 218,23 223,13 227,13 229,18 235,36 240,38 " +
  "241,45 233,53 236,56 254,57 254,67 262,61 274,64 291,71 296,76 " +
  "294,82 306,79 325,84 340,84 355,92 368,103 375,106 384,106 " +
  "388,110 391,122 393,128 389,145 384,151 370,165 363,177 356,185 " +
  "353,186 350,193 351,212 348,227 347,234 344,238 342,251 332,264 " +
  "331,274 322,279 320,285 309,285 294,289 286,293 275,296 264,304 " +
  "255,314 254,321 255,327 253,337 251,342 244,347 233,365 224,373 " +
  "217,377 213,387 206,393 203,387 208,382 202,375 194,370 184,364 " +
  "180,364 170,356 164,357 Z";

const TRANSMISSION = [
  ["N", "NE"],
  ["N", "CO"],
  ["NE", "SE"],
  ["CO", "SE"],
  ["SE", "S"],
  ["CO", "S"],
] as const;

const findRegion = (id: string) => REGIONS.find((r) => r.id === id)!;

/** Light-blue palette matching the map outline. */
const BLUE = "#38bdf8";
const BLUE_DIM = "rgba(56,189,248,0.55)";
const BLUE_GLOW = "rgba(56,189,248,0.25)";

/* ── Date formatter ── */

function fmtUpdatedAt(ts: string): string {
  const parts = ts.split(" ");
  if (parts.length === 2) {
    const [, m, d] = parts[0].split("-");
    return `${d}/${m} ${parts[1].slice(0, 5)}`;
  }
  return ts;
}

/* ── Props ── */

type Props = {
  /** Optional live PLD prices — when supplied the sidebar shows price per sub-market. */
  prices?: SubMarketPrice[];
  /** Timestamp of the last PLD data point, for display in the sidebar footer. */
  updatedAt?: string | null;
};

/* ── Component ── */

export function BrazilGridMap({ prices, updatedAt }: Props = {}) {
  const [tick, setTick] = useState(0);
  const { health } = useSettlementRail();
  const market = useMarketContext();

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 3_000);
    return () => window.clearInterval(id);
  }, []);

  void tick; // keeps the 3-second heartbeat animating node pulses

  const railOk = health?.status === "ok";

  // 5 geographic region nodes for the SVG map
  const mapNodes = useMemo(
    () =>
      REGIONS.map((r) => ({
        ...r,
        status: railOk ? ("ONLINE" as const) : ("OFFLINE" as const),
      })),
    [railOk],
  );

  // 4 CCEE pricing sub-markets for the sidebar
  const sidebarItems = useMemo(() => {
    return market.subMarkets.map((sm) => {
      const price = prices?.find((p) => p.subsistema === sm.id);
      return {
        ...sm,
        status: railOk ? ("ONLINE" as const) : ("OFFLINE" as const),
        price: price?.cmo_brl_mwh ?? null,
      };
    });
  }, [market.subMarkets, prices, railOk]);

  const showPrices = !!prices && prices.length > 0;

  return (
    <Card className="border-border bg-card p-4">
      {/* Card header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            ONS · National Interconnected System · SCADA Overlay
          </p>
          <h2 className="mt-0.5 font-display text-base font-semibold">
            Regional Generation & Settlement Map
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
          <Badge variant="outline" className="border-border">
            <Activity className="mr-1.5 h-3 w-3 animate-pulse" style={{ color: BLUE }} />
            LIVE
          </Badge>
          <Badge variant="outline" className="border-border">
            <Radio className="mr-1.5 h-3 w-3" style={{ color: BLUE }} />
            {market.subMarkets.length} Sub-Markets
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* SVG map — 5 geographic regions */}
        <div className="relative overflow-hidden rounded-md border border-border bg-background/40 lg:col-span-2">
          <div className="terminal-grid-bg absolute inset-0 opacity-40" />
          <svg viewBox="-15 -15 430 430" className="relative h-[400px] w-full">
            <defs>
              <linearGradient id="brazil-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={BLUE} stopOpacity="0.10" />
                <stop offset="100%" stopColor={BLUE} stopOpacity="0.03" />
              </linearGradient>
              <radialGradient id="node-glow">
                <stop offset="0%" stopColor={BLUE} stopOpacity="0.45" />
                <stop offset="100%" stopColor={BLUE} stopOpacity="0" />
              </radialGradient>
              <filter id="label-shadow" x="-4" y="-4" width="120" height="30">
                <feFlood floodColor="rgba(0,0,0,0.7)" result="bg" />
                <feMerge>
                  <feMergeNode in="bg" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Brazil outline */}
            <path
              d={BRAZIL_PATH}
              fill="url(#brazil-fill)"
              stroke={BLUE}
              strokeWidth="1.8"
              strokeOpacity="0.85"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Transmission lines */}
            {TRANSMISSION.map(([a, b], i) => {
              const ra = findRegion(a);
              const rb = findRegion(b);
              return (
                <g key={`${a}-${b}`}>
                  <line
                    x1={ra.cx} y1={ra.cy} x2={rb.cx} y2={rb.cy}
                    stroke="hsl(var(--border))"
                    strokeWidth="0.8"
                  />
                  <line
                    x1={ra.cx} y1={ra.cy} x2={rb.cx} y2={rb.cy}
                    stroke={BLUE_DIM}
                    strokeWidth="1.2"
                    strokeDasharray="6 8"
                    className="animate-flow-dash"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                </g>
              );
            })}

            {/* Region nodes */}
            {mapNodes.map((r) => {
              const statusColor = r.status === "ONLINE" ? BLUE : "#f87171";
              const lx = r.cx + r.labelDx;
              const ly = r.cy + r.labelDy;
              return (
                <g key={r.id}>
                  {/* Glow */}
                  <circle cx={r.cx} cy={r.cy} r={22} fill="url(#node-glow)" />

                  {/* Outer ring */}
                  <circle
                    cx={r.cx} cy={r.cy} r={7}
                    fill="none"
                    stroke={BLUE}
                    strokeWidth="1.5"
                    strokeOpacity="0.6"
                    className="animate-node-pulse"
                    style={{ animationDelay: `${r.cx * 0.003}s` }}
                  />

                  {/* Inner dot */}
                  <circle cx={r.cx} cy={r.cy} r={3.5} fill={BLUE} />
                  <circle cx={r.cx} cy={r.cy} r={1.5} fill="hsl(var(--background))" />

                  {/* Label background */}
                  <rect
                    x={lx - 3}
                    y={ly - 12}
                    width={r.name.length * 7.2 + 6}
                    height={28}
                    rx={3}
                    fill="rgba(0,0,0,0.65)"
                  />

                  {/* Region name */}
                  <text
                    x={lx} y={ly}
                    fill={BLUE}
                    fontSize="12"
                    fontFamily="var(--font-display)"
                    fontWeight={700}
                  >
                    {r.name}
                  </text>

                  {/* Status */}
                  <text
                    x={lx} y={ly + 12}
                    fill={statusColor}
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                    fontWeight={500}
                  >
                    {r.status}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Unified sidebar — 4 CCEE pricing sub-markets with status + PLD price */}
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {showPrices
              ? `${market.referencePrice.label} · ${market.clearingHouse.name}/${market.gridOperator.name}`
              : `${market.clearingHouse.name} Sub-Markets · Settlement Status`}
          </p>

          {sidebarItems.map((sm) => {
            const isOnline = sm.status === "ONLINE";
            return (
              <div
                key={sm.id}
                className="rounded-md border border-border bg-background/40 px-3 py-2.5"
                style={{ borderLeftColor: sm.color, borderLeftWidth: "2.5px" }}
              >
                {/* Row 1: label + status */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
                      style={{ background: isOnline ? sm.color : "#f87171" }}
                    />
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {sm.label}
                    </span>
                  </span>
                  <span
                    className="font-mono text-[9px] uppercase tracking-widest"
                    style={{ color: isOnline ? BLUE : "#f87171" }}
                  >
                    {sm.status}
                  </span>
                </div>

                {/* Row 2: full name */}
                <p className="mt-0.5 font-mono text-xs font-semibold text-foreground">
                  {sm.name}
                </p>

                {/* Row 3: PLD price (when available) or rail status */}
                {showPrices ? (
                  sm.price !== null ? (
                    <p className="mt-1 font-mono text-sm font-bold" style={{ color: sm.color }}>
                      {market.currencySymbol} {sm.price.toFixed(2)}
                      <span className="ml-1 font-mono text-[9px] font-normal text-muted-foreground">
                        /{market.energyUnit}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">
                      Aguardando dados…
                    </p>
                  )
                ) : (
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    Settlement rail {isOnline ? "connected" : "disconnected"}
                  </p>
                )}
              </div>
            );
          })}

          {updatedAt && (
            <p className="mt-auto pt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
              Atualizado · {fmtUpdatedAt(updatedAt)}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
