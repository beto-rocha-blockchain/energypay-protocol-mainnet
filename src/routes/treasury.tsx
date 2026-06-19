import { createFileRoute } from "@tanstack/react-router";
import {
  Radio,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard } from "@/hooks/useDashboard";
import { useSettlementRail } from "@/hooks/useSettlementRail";
import { StellarRailMonitor } from "@/components/generator/StellarRailMonitor";
import { STELLAR_NETWORK_LABEL } from "@/lib/stellar";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/treasury")({
  head: () => ({
    meta: [
      { title: "Treasury & Settlement Rails — EnergyPay" },
      {
        name: "description",
        content:
          "Platform treasury accounts, settlement rail monitoring and platform-wide settlement activity.",
      },
    ],
  }),
  component: TreasuryPage,
});

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtNum = (n: number | string | undefined | null) => {
  const num = Number(n);
  return Number.isFinite(num)
    ? num.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 4 })
    : "—";
};

// Compact notation for very large headline figures (e.g. EPWR supply ≈ 100B)
// so the value never overflows its KPI card. Exact value is kept in a tooltip.
const fmtCompact = (n: number | string | undefined | null) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return Math.abs(num) >= 1_000_000
    ? num.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 4 })
    : num.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

function TreasuryPage() {
  const { stats, horizon, loading, refresh } = useDashboard();
  const { health } = useSettlementRail();
  const t = useT();

  // Platform treasury accounts — sourced from Horizon via the dashboard endpoint.
  // These are the PLATFORM's operator and distributor Stellar accounts,
  // NOT the personal wallet of the logged-in user.
  const operatorXlm  = horizon?.operator_balance?.xlm  ?? null;
  const distributorXlm  = horizon?.distribution_balance?.xlm  ?? null;
  const epwrSupply   = horizon?.distribution_balance?.epwr ?? null;

  const settled    = stats?.settled_count  ?? 0;
  const failed     = stats?.failed_count   ?? 0;
  const totalBrl   = stats?.total_value_brl ?? 0;
  const horizonLatency = horizon?.latency_ms ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Treasury · Settlement Rail Operations")}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("Treasury & Rails")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-widest">
            <Radio className="mr-1.5 h-3 w-3 text-success" />
            {STELLAR_NETWORK_LABEL}
          </Badge>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("Refresh")}
          </Button>
        </div>
      </div>

      {/* KPI Strip — platform accounts only */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label={t("Operator XLM")}
          value={operatorXlm ? Number(operatorXlm).toFixed(4) : "—"}
          sub={t("platform operator account")}
          loading={loading && !horizon}
        />
        <KpiCard
          label={t("EPWR Supply")}
          value={epwrSupply ? fmtCompact(epwrSupply) : "—"}
          title={epwrSupply ? `${fmtNum(epwrSupply)} EPWR` : undefined}
          sub={t("distributor account")}
          loading={loading && !horizon}
        />
        <KpiCard
          label={t("Distributor XLM")}
          value={distributorXlm ? Number(distributorXlm).toFixed(4) : "—"}
          sub={t("distribution reserve")}
          loading={loading && !horizon}
        />
        <KpiCard
          label={t("Settled Volume")}
          value={fmtBRL(totalBrl)}
          sub={`${settled} ${t("confirmed")}`}
          loading={loading && !stats}
          tone="ok"
        />
        <KpiCard
          label={t("Users")}
          value={String(stats?.total_users ?? 0)}
          sub={t("counterparties")}
          loading={loading && !stats}
        />
        <KpiCard
          label={t("Rail Status")}
          value={health?.status === "ok" ? t("CONNECTED") : t("OFFLINE")}
          sub={`Horizon ${horizonLatency} ms`}
          loading={loading && !health}
          tone={health?.status === "ok" ? "ok" : "warn"}
          led
        />
      </div>

      {/* Blockchain Monitor + Telemetry */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <StellarRailMonitor />
        </div>

        {/* Treasury Telemetry — platform accounts */}
        <Card className="border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Treasury Telemetry")}
          </p>
          <div className="mt-3 space-y-2">
            <TelRow label={t("Horizon latency")}  value={`${horizonLatency} ms`}                  tone={horizonLatency < 1000 ? "ok" : "warn"} />
            <TelRow label={t("Backend latency")}  value={`${health?.backend?.latency_ms ?? 0} ms`} tone="ok" />
            <TelRow label={t("Failed count")}     value={String(failed)}     tone={failed > 0 ? "warn" : "ok"} />
          </div>
        </Card>
      </div>

    </div>
  );
}

/* ── Sub-components ── */

function KpiCard({
  label,
  value,
  sub,
  loading,
  tone = "ok",
  led = false,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  tone?: "ok" | "warn" | "muted";
  led?: boolean;
  title?: string;
}) {
  const valueColor = led
    ? tone === "ok" ? "text-success" : tone === "warn" ? "text-destructive" : ""
    : "";
  const ledColor = tone === "ok" ? "bg-success" : tone === "warn" ? "bg-destructive" : "bg-muted-foreground";
  const fontSize = value.length > 16 ? "text-sm" : value.length > 12 ? "text-base" : "text-xl";

  return (
    <Card className="border-border bg-card p-3">
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-20" />
      ) : (
        <p
          title={title}
          className={`mt-1 font-mono font-semibold tracking-tight ${fontSize} ${valueColor} flex items-center gap-2`}
        >
          {led && (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${ledColor}`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${ledColor}`} />
            </span>
          )}
          <span className="truncate">{value}</span>
        </p>
      )}
      {sub && (
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {sub}
        </p>
      )}
    </Card>
  );
}

function TelRow({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "muted";
  title?: string;
}) {
  const color = tone === "ok" ? "text-success" : tone === "warn" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1.5">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span title={title} className={`truncate text-right font-mono text-[11px] ${color}`}>{value}</span>
    </div>
  );
}
