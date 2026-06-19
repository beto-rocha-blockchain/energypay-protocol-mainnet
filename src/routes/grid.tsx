import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { stellarExpertAccount, STELLAR_NETWORK_LABEL } from "@/lib/stellar";
import {
  Activity,
  Radio,
  Sun,
  Droplets,
  Wind,
  Flame,
  Network,
  Building2,
  Coins,
  LineChart,
  Plug,
  Factory,
  Zap,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Lock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useGrid,
  haversineKm,
  ENERGY_LABEL,
  STATUS_TONE,
  type GridNode,
  type EnergyType,
} from "@/store/grid";
import { useOperator, maskAddress, ROLE_COLORS, ROLE_META, sortRoles } from "@/store/operator";
import type { ParticipantRole } from "@/store/operator";
import { useT } from "@/lib/i18n";

// Leaflet map — client-only, loaded lazily to avoid SSR issues
const GridMapLeaflet = lazy(() => import("@/components/GridMapLeaflet"));

export const Route = createFileRoute("/grid")({
  component: GridPage,
});

const ROLE_ICON: Record<ParticipantRole, React.ComponentType<{ className?: string }>> = {
  GENERATOR: Factory,
  SELLER: Coins,
  INVESTOR: LineChart,
  USER: Plug,
  UTILITY: Building2,
  REGULATORY_AUTHORITY: ShieldCheck,
  ADMIN: ShieldCheck,
};

const ENERGY_ICON: Record<EnergyType, React.ComponentType<{ className?: string }>> = {
  SOLAR: Sun,
  HYDRO: Droplets,
  WIND: Wind,
  THERMAL: Flame,
  GRID: Network,
};

const TONE_CLASS = {
  success: {
    dot: "bg-success",
    text: "text-success",
    border: "border-success/40",
    glow: "shadow-[0_0_18px_oklch(0.78_0.18_145/0.55)]",
  },
  warning: {
    dot: "bg-warning",
    text: "text-warning",
    border: "border-warning/40",
    glow: "shadow-[0_0_18px_oklch(0.82_0.16_75/0.45)]",
  },
  destructive: {
    dot: "bg-destructive",
    text: "text-destructive",
    border: "border-destructive/50",
    glow: "shadow-[0_0_14px_oklch(0.65_0.22_25/0.4)]",
  },
} as const;

function GridPage() {
  const t = useT();
  const nodes = useGrid((s) => s.nodes);
  const gridLoading = useGrid((s) => s.loading);
  const gridError = useGrid((s) => s.error);
  const fetchGrid = useGrid((s) => s.fetch);
  const operator = useOperator((s) => s.operator);

  useEffect(() => {
    if (operator) fetchGrid();
  }, [fetchGrid, operator]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<"ALL" | ParticipantRole>("ALL");
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  // Ensure Leaflet only renders client-side
  useEffect(() => { setMounted(true); }, []);

  const filtered = useMemo(
    () =>
      nodes.filter((n) => {
        if (filterRole !== "ALL" && !n.roles.includes(filterRole)) return false;
        if (
          query &&
          !`${n.organization} ${n.region} ${n.id}`.toLowerCase().includes(query.toLowerCase())
        )
          return false;
        return true;
      }),
    [nodes, filterRole, query],
  );

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? filtered[0] ?? nodes[0],
    [nodes, selectedId, filtered],
  );

  const stats = useMemo(() => {
    const total = nodes.length;
    const active = nodes.filter((n) => n.status === "ACTIVE").length;
    const generators = nodes.filter((n) => n.role === "GENERATOR").length;
    return { total, active, generators };
  }, [nodes]);

  const operatorCoords = operator?.coords
    ? { lat: operator.coords.lat, lng: operator.coords.lng }
    : null;

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Operational Grid · Network Map")}
          </div>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {t("Operational Grid")}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
          <Stat label={t("Nodes")} value={stats.total.toString()} />
          <Stat label={t("Active")} value={stats.active.toString()} tone="success" />
          <Stat label={t("Generators")} value={stats.generators.toString()} />
          <Button size="sm" variant="outline" onClick={fetchGrid} disabled={gridLoading} className="h-7 px-2">
            <RefreshCw className={`mr-1.5 h-3 w-3 ${gridLoading ? "animate-spin" : ""}`} />
            <span className="font-mono text-[10px] uppercase tracking-widest">{t("Refresh")}</span>
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="border-border bg-card/60 p-3">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
          <span className="text-muted-foreground">{t("Filter")}</span>
          <Pill active={filterRole === "ALL"} onClick={() => setFilterRole("ALL")}>
            {t("All Roles")}
          </Pill>
          {(["GENERATOR", "SELLER", "INVESTOR", "USER", "UTILITY"] as ParticipantRole[]).map((r) => (
            <Pill key={r} active={filterRole === r} onClick={() => setFilterRole(r)} color={ROLE_COLORS[r].hex}>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ROLE_COLORS[r].hex }} />
                {ROLE_META[r].label}
              </span>
            </Pill>
          ))}
          <div className="ml-auto w-full md:w-56">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search organization or region…")}
              className="h-8 font-mono text-xs"
            />
          </div>
        </div>
      </Card>

      {/* ── Not authenticated ─────────────────────────────────────────── */}
      {!operator ? (
        <Card className="border-border bg-card/60 p-10 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-display text-base font-semibold">{t("Authentication required")}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {t("Sign in to view the settlement network map and participant nodes.")}
          </p>
        </Card>
      ) : gridLoading && nodes.length === 0 ? (
        <Card className="border-border bg-card/60 p-10 text-center">
          <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground/40" />
          <p className="font-mono text-sm text-muted-foreground">{t("Loading grid participants…")}</p>
        </Card>
      ) : nodes.length === 0 ? (
        <Card className="border-border bg-card/60 p-10 text-center">
          {/* Distinguish expired session from "empty grid" */}
          {gridError && /bearer|token|unauthorized|401/i.test(gridError) ? (
            <>
              <Lock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-display text-base font-semibold">{t("Session expired")}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {t("Your session has expired. Please sign in again.")}
              </p>
            </>
          ) : (
            <>
              <Network className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-display text-base font-semibold">{t("No verified participants")}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {t("Grid nodes appear here once participants verify their email during registration.")}
              </p>
            </>
          )}
          {gridError && !/bearer|token|unauthorized|401/i.test(gridError) && (
            <p className="mt-2 font-mono text-[11px] text-destructive">{gridError}</p>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={fetchGrid}
            className="mt-3 font-mono text-[10px] uppercase tracking-widest"
          >
            <RefreshCw className="mr-1.5 h-3 w-3" /> {t("Retry")}
          </Button>
        </Card>
      ) : (
      <>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Map — Leaflet with CartoDB dark tiles */}
        <Card className="overflow-hidden border-border bg-card/60">
          <div className="flex items-center justify-between border-b border-border bg-background/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Radio className="h-3 w-3 text-success" />
              <span>{t("Stellar Settlement Network · Live Map")}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#06b6d4]" /> {t("You")}
              </span>
            </div>
          </div>
          {/* Map container — fixed height, Leaflet fills it */}
          <div className="relative h-[420px] w-full overflow-hidden">
            {mounted ? (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center bg-[#0d1117]">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground/40" />
                  </div>
                }
              >
                <GridMapLeaflet
                  nodes={filtered}
                  operatorCoords={operatorCoords}
                  operatorName={operator?.organization ?? ""}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </Suspense>
            ) : (
              <div className="flex h-full items-center justify-center bg-[#0d1117]">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground/40" />
              </div>
            )}
            {/* Overlay footer ticker — z-index above Leaflet tiles but below controls */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-border bg-background/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur"
              style={{ zIndex: 450 }}
            >
              <span className="flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-success" /> {t("Live")} · {STELLAR_NETWORK_LABEL}
              </span>
              <span className="hidden md:block">{t("Click a node to inspect · Scroll to zoom")}</span>
            </div>
          </div>
        </Card>

        {/* Detail panel */}
        <Card className="flex flex-col border-border bg-card/60">
          {selected && (
            <>
              <div className="border-b border-border bg-background/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("Participant Telemetry")} · {selected.id}
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  {(() => {
                    const Icon = ENERGY_ICON[selected.energyType];
                    const roleColor = ROLE_COLORS[selected.role]?.hex ?? "#94a3b8";
                    return (
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background"
                        style={{
                          borderColor: `${roleColor}55`,
                          boxShadow: `0 0 12px ${roleColor}28`,
                        }}
                      >
                        <span style={{ color: roleColor }}>
                          <Icon className="h-5 w-5" />
                        </span>
                      </div>
                    );
                  })()}
                  <div className="flex-1">
                    <div className="font-display text-base font-semibold leading-tight">
                      {selected.organization}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-widest">
                      {sortRoles(selected.roles).map((r) => {
                        const role = r as ParticipantRole;
                        const RIcon = ROLE_ICON[role] ?? ShieldCheck;
                        const roleColor = ROLE_COLORS[role]?.hex;
                        return (
                          <span key={r} className="flex items-center gap-1" style={{ color: roleColor }}>
                            <span style={{ color: roleColor }}>
                              <RIcon className="h-3 w-3" />
                            </span>
                            {ROLE_META[role]?.label ?? r}
                          </span>
                        );
                      })}
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{selected.jurisdiction}</span>
                    </div>
                  </div>
                  <span
                    className={`flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${TONE_CLASS[STATUS_TONE[selected.status]].border} ${TONE_CLASS[STATUS_TONE[selected.status]].text}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${TONE_CLASS[STATUS_TONE[selected.status]].dot} ${selected.status === "ACTIVE" ? "animate-pulse" : ""}`}
                    />
                    {selected.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-widest">
                  <Mini label={t("Energy Type")} value={ENERGY_LABEL[selected.energyType]} />
                  <Mini label={t("Region")} value={selected.region} />
                  <Mini label={t("Nearby participants (≤800 km)")} value={`${selected.connections.length} ${t("peers")}`} />
                  <Mini
                    label={t("Location")}
                    value={selected.approximateLocation ? t("≈ City-level") : t("GPS · Exact")}
                    tone={selected.approximateLocation ? "warning" : "success"}
                  />
                  {operatorCoords && (
                    <Mini
                      label={t("Distance")}
                      value={`${Math.round(haversineKm(operatorCoords.lat, operatorCoords.lng, selected.coords.lat, selected.coords.lng)).toLocaleString()} km`}
                      tone="success"
                    />
                  )}
                  <Mini
                    label={t("Coordinates")}
                    value={`${selected.coords.lat.toFixed(2)}, ${selected.coords.lng.toFixed(2)}`}
                  />
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {t("Settlement Address")}
                  </div>
                  <div className="mt-1 flex items-center justify-between rounded-md border border-border bg-background/60 px-2 py-1.5">
                    <code className="truncate font-mono text-[11px] text-foreground">
                      {selected.settlementAddress}
                    </code>
                    <a
                      href={stellarExpertAccount(selected.settlementAddress)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="h-3 w-3" /> {t("Audit")}
                    </a>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {maskAddress(selected.settlementAddress)} · {STELLAR_NETWORK_LABEL}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {t("Nearby participants (≤800 km)")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selected.connections.map((cid) => {
                      const peer = nodes.find((x) => x.id === cid);
                      if (!peer) return null;
                      return (
                        <button
                          key={cid}
                          onClick={() => setSelectedId(cid)}
                          className="rounded-sm border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                        >
                          {peer.organization}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selected.approximateLocation && (
                  <div className="rounded-md border border-border bg-background/40 p-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <div className="text-[9px] text-warning/80">
                      {t("⚠ Location is city-level approximate — participant has not provided GPS coordinates.")}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Registry table */}
      <Card className="border-border bg-card/60">
        <div className="flex items-center justify-between border-b border-border bg-background/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-2">
            <Building2 className="h-3 w-3" /> {t("Participant Registry")}
          </span>
          <span>{filtered.length} {t("entities")}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-background/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{t("Organization")}</th>
                <th className="px-3 py-2 text-left">{t("Role")}</th>
                <th className="px-3 py-2 text-left">{t("Energy")}</th>
                <th className="px-3 py-2 text-left">{t("Region")}</th>
                <th className="px-3 py-2 text-left">{t("Settlement Address")}</th>
                <th className="px-3 py-2 text-left">{t("Status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((n) => {
                const tone = TONE_CLASS[STATUS_TONE[n.status]];
                const isSel = selected?.id === n.id;
                return (
                  <tr
                    key={n.id}
                    onClick={() => setSelectedId(n.id)}
                    className={`cursor-pointer border-b border-border/60 transition hover:bg-background/40 ${isSel ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-3 py-2 font-mono text-foreground">{n.organization}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {sortRoles(n.roles).map((r) => {
                          const role = r as ParticipantRole;
                          return (
                            <span
                              key={r}
                              className="font-mono text-[10px] uppercase tracking-widest"
                              style={{ color: ROLE_COLORS[role]?.hex }}
                            >
                              {ROLE_META[role]?.label ?? r}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono uppercase tracking-widest text-muted-foreground">
                      {n.energyType}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{n.region}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {maskAddress(n.settlementAddress)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${tone.border} ${tone.text}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${n.status === "ACTIVE" ? "animate-pulse" : ""}`}
                        />
                        {n.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3 text-success" /> {t("Registry Read-only · Settlement Identity Bound")}
        </span>
        <span className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-primary" /> {STELLAR_NETWORK_LABEL}
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "destructive";
}) {
  const t = tone ? TONE_CLASS[tone] : null;
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${t?.text ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: string;
}) {
  const activeStyle =
    active && color
      ? { borderColor: `${color}60`, background: `${color}18`, color }
      : undefined;
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border px-2 py-0.5 transition ${
        active && !color
          ? "border-primary/60 bg-primary/10 text-primary"
          : !active
          ? "border-border bg-background/40 text-muted-foreground hover:text-foreground"
          : "border-transparent"
      }`}
      style={activeStyle}
    >
      {children}
    </button>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "destructive";
}) {
  const t = tone ? TONE_CLASS[tone] : null;
  return (
    <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-[11px] ${t?.text ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}
