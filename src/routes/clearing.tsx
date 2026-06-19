import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ROLE_COLORS, type ParticipantRole } from "@/store/operator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard } from "@/hooks/useDashboard";
import { useSettlementRail } from "@/hooks/useSettlementRail";
import { useMarketContext } from "@/hooks/useMarketContext";
import { useOperator } from "@/store/operator";
import { stellarExpertTx, STELLAR_NETWORK_LABEL } from "@/lib/stellar";
import { API_BASE_URL } from "@/lib/api";
import { getSession } from "@/lib/session";
import { useT } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";

export const Route = createFileRoute("/clearing")({
  head: () => ({
    meta: [
      { title: "Netting & Clearing · Risk & Collateral — EnergyPay" },
      {
        name: "description",
        content:
          "Bilateral contract lifecycle, settlement state machine, finality metrics and ledger anchoring.",
      },
    ],
  }),
  component: ClearingPage,
});

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const shortHash = (h: string) =>
  h && h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-6)}` : h || "—";

const timeAgo = (iso: string) => relativeTime(iso);

/* ── Risk Snapshot types & hook ── */

type RiskSnapshot = {
  total_registered: number;
  verified_participants: number;
  partially_verified: number;
  unverified: number;
  total_settlements: number;
  settled_count: number;
  failed_count: number;
  settlement_reliability_pct: number | null;
  active_contracts: number;
  netting_eligible_participants: number | null;
  collateral_coverage: null;
  risk_tiers: null;
  watchlist_count: null;
  blocked_count: null;
  avg_settlement_score: null;
};

function useRiskSnapshot() {
  const [snapshot, setSnapshot] = useState<RiskSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const session = getSession();
      if (!session?.token) { setLoading(false); return; }
      const token = session.token;
      const res = await fetch(`${API_BASE_URL}/api/dashboard/risk-snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setSnapshot(json.snapshot);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { snapshot, loading, refresh: fetch_ };
}

/* ── Counterparty Risk types & hook ── */

type CounterpartyProfile = {
  id: string;
  full_name: string;
  organization: string;
  roles: string[];
  country: string;
  city: string;
  stellar_public_key: string | null;
  verified: boolean;
  member_since: string;
  settlements_total: number;
  settlements_settled: number;
  settlements_failed: number;
  settlement_reliability_pct: number | null;
  cleared_volume_brl: number;
  active_contracts: number;
  total_contracts: number;
  wallet_funded: boolean;
  has_trustline: boolean;
  clearing_eligible: boolean;
  collateral_coverage: null;
  risk_tier: null;
  credit_score: null;
};

function useCounterpartyRisk() {
  const [profiles, setProfiles] = useState<CounterpartyProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = getSession();
      if (!session?.token) { setLoading(false); return; }
      const res = await fetch(`${API_BASE_URL}/api/dashboard/counterparty-risk`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.status === 403) {
        setError("Full verification required.");
      } else if (res.ok) {
        const json = await res.json();
        if (json.success) setProfiles(json.participants);
      }
      setFetched(true);
    } catch { setError("Failed to load counterparty data."); }
    finally { setLoading(false); }
  }, []);

  return { profiles, loading, error, fetched, fetch: fetch_ };
}

function ClearingPage() {
  const t = useT();
  const market = useMarketContext();
  const { stats, settlements, horizon, loading, refresh } = useDashboard();
  const { health, telemetry } = useSettlementRail();
  const operator = useOperator((s) => s.operator);
  // Phone verification is optional (event policy): email-verified operators transact.
  const isVerified = !!operator?.emailVerified;
  const { snapshot: risk, loading: riskLoading, refresh: refreshRisk } = useRiskSnapshot();
  const cpRisk = useCounterpartyRisk();

  const finalityMs = stats?.avg_finality_ms ?? 0;
  const horizonLatency = horizon?.latency_ms ?? 0;
  const settledCount = stats?.settled_count ?? 0;
  const failedCount = stats?.failed_count ?? 0;
  const totalSettlements = stats?.total_settlements ?? 0;
  const successRate = totalSettlements > 0 ? (settledCount / totalSettlements) * 100 : 0;
  const failureRate = totalSettlements > 0 ? (failedCount / totalSettlements) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {market.clearingHouse.name} {t("Model · Risk & Collateral · Settlement Lifecycle")}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("Clearing House")}
          </h1>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
            {market.clearingHouse.fullName} · {market.settlementCycle} {market.settlementWindow}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-widest">
            <Radio className="mr-1.5 h-3 w-3 text-success" />
            {STELLAR_NETWORK_LABEL}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => { refresh(); refreshRisk(); }} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("Refresh")}
          </Button>
        </div>
      </div>

      {/* Counterparty Risk Assessment — surfaced at the top of the page */}
      {isVerified && (
        <CounterpartyRiskPanel
          profiles={cpRisk.profiles}
          loading={cpRisk.loading}
          error={cpRisk.error}
          fetched={cpRisk.fetched}
          onLoad={cpRisk.fetch}
        />
      )}

      {/* KPI Strip — row 1: settlement counts */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label={t("Total Processed")}
          value={String(totalSettlements)}
          sub={t("lifecycle entries")}
          loading={loading && !stats}
        />
        <KpiCard
          label={t("Settled")}
          value={String(settledCount)}
          sub={t("confirmed on-chain")}
          loading={loading && !stats}
          tone="ok"
        />
        <KpiCard
          label={t("Failed / Rejected")}
          value={String(failedCount)}
          sub={t("reverted or rejected")}
          loading={loading && !stats}
          tone={failedCount > 0 ? "warn" : "ok"}
        />
        <KpiCard
          label={t("Cleared Volume")}
          value={fmtBRL(stats?.total_value_brl ?? 0)}
          sub={t("total BRL netted")}
          loading={loading && !stats}
        />
      </div>

      {/* KPI Strip — row 2: risk & rail health */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label={t("Success Rate")}
          value={totalSettlements > 0 ? `${successRate.toFixed(1)}%` : "—"}
          sub={`${settledCount} ${t("confirmed")}`}
          loading={loading && !stats}
          tone={successRate >= 95 ? "ok" : "warn"}
          led={successRate >= 95}
        />
        <KpiCard
          label={t("Failure Rate")}
          value={totalSettlements > 0 ? `${failureRate.toFixed(1)}%` : "—"}
          sub={`${failedCount} ${t("failed")}`}
          loading={loading && !stats}
          tone={failedCount > 0 ? "warn" : "ok"}
          led={failedCount > 0}
        />
        <KpiCard
          label={t("Avg. Finality")}
          value={finalityMs ? `${(finalityMs / 1000).toFixed(2)}s` : "—"}
          sub={finalityMs && finalityMs < 6000 ? t("within SLA") : t("above SLA")}
          loading={loading && !stats}
          tone={finalityMs && finalityMs < 6000 ? "ok" : "warn"}
        />
        <KpiCard
          label={t("Rail Status")}
          value={health?.status === "ok" ? t("CONNECTED") : t("DEGRADED")}
          sub={`Horizon ${horizonLatency} ms · ${t("backend")} ${health?.backend?.latency_ms ?? 0} ms`}
          loading={loading && !health}
          tone={health?.status === "ok" ? "ok" : "warn"}
          led
        />
      </div>

      {/* Settlement Lifecycle + Telemetry */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="border-border bg-card p-4 lg:col-span-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Settlement State Machine · Throughput")}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <StateMini label={t("Pending")} value={String(totalSettlements - settledCount - failedCount)} tone="muted" />
            <StateMini label={t("Settled")} value={String(settledCount)} tone="ok" />
            <StateMini label={t("Failed")} value={String(failedCount)} tone={failedCount > 0 ? "warn" : "ok"} />
          </div>
        </Card>

        <Card className="border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Clearing Telemetry")}
          </p>
          <div className="mt-3 space-y-2">
            <TelRow label={t("Horizon latency")} value={`${horizonLatency} ms`} tone={horizonLatency < 1000 ? "ok" : "warn"} />
            <TelRow label={t("Backend status")} value={health?.status === "ok" ? t("ONLINE") : t("OFFLINE")} tone={health?.status === "ok" ? "ok" : "warn"} />
            <TelRow label={t("Avg finality")} value={finalityMs ? `${(finalityMs / 1000).toFixed(2)}s` : "—"} tone={finalityMs && finalityMs < 6000 ? "ok" : "warn"} />
            <TelRow label={t("Pending confirms")} value={String(telemetry?.pending_confirmations ?? 0)} tone="ok" />
          </div>
        </Card>
      </div>

      {/* Settlement Health Indicators + Risk Telemetry */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="border-border bg-card p-4 lg:col-span-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Settlement Health Indicators")}
          </p>
          <div className="mt-3 space-y-3">
            <HealthBar label={t("Settlement Success")} value={successRate} />
            <HealthBar label={t("Horizon Availability")} value={horizon?.horizon_online ? 100 : 0} />
            <HealthBar label={t("Backend Availability")} value={health?.status === "ok" ? 100 : health?.status === "degraded" ? 50 : 0} />
            <HealthBar label={t("Finality SLA (< 6s)")} value={finalityMs > 0 ? Math.min(100, (6000 / finalityMs) * 100) : 0} noData={finalityMs <= 0} />
          </div>
        </Card>

        <Card className="border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Risk Telemetry")}
          </p>
          <div className="mt-3 space-y-2">
            <TelRowIcon icon={<ShieldCheck className="h-3.5 w-3.5" />} label={t("Success rate")} value={totalSettlements > 0 ? `${successRate.toFixed(1)}%` : "—"} tone={successRate >= 95 ? "ok" : "warn"} />
            <TelRowIcon icon={<CheckCircle2 className="h-3.5 w-3.5" />} label={t("Settled")} value={String(settledCount)} tone="ok" />
            <TelRowIcon icon={<XCircle className="h-3.5 w-3.5" />} label={t("Failed")} value={String(failedCount)} tone={failedCount > 0 ? "warn" : "ok"} />
            <TelRowIcon icon={<Activity className="h-3.5 w-3.5" />} label={t("Horizon latency")} value={`${horizonLatency} ms`} tone={horizonLatency < 1000 ? "ok" : "warn"} />
            <TelRowIcon icon={<Activity className="h-3.5 w-3.5" />} label={t("Counterparties")} value={String(stats?.total_users ?? 0)} tone="muted" />
          </div>
        </Card>
      </div>

      {/* Participant Risk Snapshot — only for verified operators */}
      {isVerified && (
        <Card className="border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("Participant Risk Snapshot")}
              </p>
            </div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
              {t("Verified participants only")}
            </span>
          </div>

          {riskLoading ? (
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : risk ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-5">
                {/* Real metrics from Supabase */}
                <RiskMetric
                  label={t("Verified Participants")}
                  value={`${risk.verified_participants} / ${risk.total_registered}`}
                  badge={risk.verified_participants > 0 ? t("VERIFIED") : t("NONE")}
                  tone={risk.verified_participants > 0 ? "ok" : "muted"}
                />
                <RiskMetric
                  label={t("Pending Verification")}
                  value={String(risk.partially_verified + risk.unverified)}
                  badge={risk.partially_verified + risk.unverified > 0 ? t("REVIEW") : t("CLEAR")}
                  tone={risk.partially_verified + risk.unverified > 0 ? "warn" : "ok"}
                />
                <RiskMetric
                  label={t("Settlement Reliability")}
                  value={risk.settlement_reliability_pct !== null ? `${risk.settlement_reliability_pct}%` : "—"}
                  badge={
                    risk.settlement_reliability_pct === null
                      ? t("NO DATA")
                      : risk.settlement_reliability_pct >= 95
                        ? t("HIGH")
                        : risk.settlement_reliability_pct >= 70
                          ? t("MODERATE")
                          : t("LOW")
                  }
                  tone={
                    risk.settlement_reliability_pct === null
                      ? "muted"
                      : risk.settlement_reliability_pct >= 95
                        ? "ok"
                        : risk.settlement_reliability_pct >= 70
                          ? "warn"
                          : "bad"
                  }
                />
                <RiskMetric
                  label={t("Netting Eligibility")}
                  value={risk.netting_eligible_participants !== null ? `${risk.netting_eligible_participants} ${t("participants")}` : "—"}
                  badge={
                    risk.netting_eligible_participants === null
                      ? t("NO DATA")
                      : risk.netting_eligible_participants > 0
                        ? t("ELIGIBLE")
                        : t("NONE")
                  }
                  tone={risk.netting_eligible_participants !== null && risk.netting_eligible_participants > 0 ? "ok" : "muted"}
                />
                {/* Collateral — no real source yet */}
                <RiskMetric
                  label={t("Collateral Coverage")}
                  value="—"
                  badge={t("PENDING DATA SOURCE")}
                  tone="muted"
                />
              </div>

              {/* Second row: metrics that require a risk engine */}
              <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-5">
                <RiskMetric
                  label={t("Active Contracts")}
                  value={String(risk.active_contracts)}
                  badge={risk.active_contracts > 0 ? t("ACTIVE") : t("NONE")}
                  tone={risk.active_contracts > 0 ? "ok" : "muted"}
                />
                <RiskMetric
                  label={t("Avg Settlement Score")}
                  value="—"
                  badge={t("REQUIRES RISK ENGINE")}
                  tone="muted"
                />
                <RiskMetric
                  label={t("Watchlist")}
                  value="—"
                  badge={t("NOT AVAILABLE")}
                  tone="muted"
                />
                <RiskMetric
                  label={t("Blocked")}
                  value="—"
                  badge={t("NOT AVAILABLE")}
                  tone="muted"
                />
                <RiskMetric
                  label={t("Risk Tiers")}
                  value="—"
                  badge={t("REQUIRES RISK ENGINE")}
                  tone="muted"
                />
              </div>

              <p className="mt-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                {t("Risk data is restricted to authenticated and verified clearing participants.")}
              </p>
            </>
          ) : (
            <div className="mt-3 py-4 text-center">
              <p className="font-mono text-xs text-muted-foreground">{t("No risk snapshot data available.")}</p>
            </div>
          )}
        </Card>
      )}

      {/* Recent Cleared Settlements */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Settlement Feed · Cleared Transactions")}
          </p>
          <p className="font-display text-lg font-semibold">{t("Recent Settlements")}</p>
        </div>

        {loading && settlements.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : settlements.length === 0 ? (
          <div className="py-10 text-center">
            <Activity className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="font-mono text-sm text-muted-foreground">{t("No cleared settlements yet.")}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[11px] uppercase tracking-wider">{t("ID")}</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">{t("Seller")}</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider">{t("Amount")}</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">{t("Tx Hash")}</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">{t("Status")}</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">{t("When")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((s) => (
                <TableRow key={s.id + s.created_at} className="border-border">
                  <TableCell className="font-mono text-xs">{s.id}</TableCell>
                  <TableCell className="max-w-[120px] truncate font-mono text-xs">
                    {s.seller ? shortHash(s.seller) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-success">
                    {s.amount_brl ? fmtBRL(s.amount_brl) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {s.tx_hash && s.tx_hash !== "UNAVAILABLE" ? (
                      <a
                        href={stellarExpertTx(s.tx_hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-primary"
                      >
                        {shortHash(s.tx_hash)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] ${
                        s.status === "SETTLED" || s.status === "CONFIRMED"
                          ? "border-success/40 bg-success/10 text-success"
                          : s.status === "FAILED"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-warning/40 bg-warning/10 text-warning"
                      }`}
                    >
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">
                    {timeAgo(s.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
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
}: {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  tone?: "ok" | "warn" | "muted";
  led?: boolean;
}) {
  const valueColor = led
    ? tone === "ok" ? "text-success" : tone === "warn" ? "text-destructive" : ""
    : "";
  const ledColor = tone === "ok" ? "bg-success" : tone === "warn" ? "bg-destructive" : "bg-muted-foreground";
  const fontSize = value.length > 16 ? "text-sm" : value.length > 9 ? "text-base" : "text-xl";

  return (
    <Card className="border-border bg-card p-3">
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-20" />
      ) : (
        <p className={`mt-1 font-mono font-semibold tracking-tight ${fontSize} ${valueColor} flex items-center gap-2`}>
          {led && (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${ledColor}`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${ledColor}`} />
            </span>
          )}
          {value}
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

function StateMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "muted";
}) {
  const color = tone === "ok" ? "text-success" : tone === "warn" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function HealthBar({ label, value, noData }: { label: string; value: number; noData?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 95 ? "bg-success" : pct >= 70 ? "bg-warning" : "bg-destructive";
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        {noData ? (
          <span className="font-mono text-[11px] text-muted-foreground/60">Awaiting data</span>
        ) : (
          <span className={`font-mono text-[11px] ${pct >= 95 ? "text-success" : pct >= 70 ? "text-warning" : "text-destructive"}`}>
            {pct.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {!noData && (
          <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}

function TelRowIcon({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value?: string; tone: "ok" | "warn" | "muted" }) {
  const color = tone === "ok" ? "text-success" : tone === "warn" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`font-mono text-[11px] ${color}`}>{value ?? "—"}</span>
    </div>
  );
}

function TelRow({ label, value, tone }: { label: string; value?: string; tone: "ok" | "warn" | "muted" }) {
  const color = tone === "ok" ? "text-success" : tone === "warn" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2.5 py-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`font-mono text-[11px] ${color}`}>{value ?? "—"}</span>
    </div>
  );
}

function RiskMetric({
  label,
  value,
  badge,
  tone,
}: {
  label: string;
  value: string;
  badge: string;
  tone: "ok" | "warn" | "bad" | "muted";
}) {
  const badgeClass =
    tone === "ok"
      ? "border-success/40 bg-success/10 text-success"
      : tone === "warn"
        ? "border-warning/40 bg-warning/10 text-warning"
        : tone === "bad"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted/30 text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-background/40 px-2.5 py-2">
      <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold">{value}</p>
      <Badge variant="outline" className={`mt-1 font-mono text-[8px] ${badgeClass}`}>
        {badge}
      </Badge>
    </div>
  );
}

/* ── Counterparty Risk Panel ── */

function CounterpartyRiskPanel({
  profiles,
  loading,
  error,
  fetched,
  onLoad,
}: {
  profiles: CounterpartyProfile[];
  loading: boolean;
  error: string | null;
  fetched: boolean;
  onLoad: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleOpen = () => {
    setOpen(true);
    if (!fetched) onLoad();
  };

  const filtered = profiles.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.organization.toLowerCase().includes(q) ||
      p.city?.toLowerCase().includes(q) ||
      p.roles.some((r) => r.toLowerCase().includes(q)) ||
      p.stellar_public_key?.toLowerCase().includes(q)
    );
  });

  const fmtBrl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const memberDays = (iso: string) => {
    if (!iso) return 0;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  };

  return (
    <Card className="border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Counterparty Risk Assessment")}
          </p>
        </div>
        {!open ? (
          <Button size="sm" variant="outline" onClick={handleOpen} disabled={loading}>
            {loading ? (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t("View Participants")}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
            {t("Collapse")}
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("Search by name, organization, city, role or public key…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 font-mono text-xs"
            />
          </div>

          {error ? (
            <div className="py-6 text-center">
              <XCircle className="mx-auto mb-2 h-6 w-6 text-destructive/60" />
              <p className="font-mono text-xs text-muted-foreground">{t(error)}</p>
            </div>
          ) : loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center">
              <p className="font-mono text-xs text-muted-foreground">
                {search ? t("No participants match your search.") : t("No verified participants found.")}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((p) => {
                const isExp = expanded === p.id;
                const reliabilityTone = p.settlement_reliability_pct === null
                  ? "muted" : p.settlement_reliability_pct >= 95
                    ? "ok" : p.settlement_reliability_pct >= 70
                      ? "warn" : "bad";
                const primaryRole = (p.roles?.[0] || "USER") as ParticipantRole;
                const roleColor = ROLE_COLORS[primaryRole] || ROLE_COLORS.USER;

                return (
                  <div
                    key={p.id}
                    className="rounded-md border border-border bg-background/40 transition-colors hover:border-border/80"
                  >
                    {/* Summary row */}
                    <button
                      onClick={() => setExpanded(isExp ? null : p.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold truncate">{p.full_name}</span>
                          <Badge variant="outline" className={`font-mono text-[8px] ${roleColor.border} ${roleColor.bg} ${roleColor.text}`}>
                            {primaryRole}
                          </Badge>
                          <Badge variant="outline" className="font-mono text-[8px] border-success/40 bg-success/10 text-success">
                            {t("VERIFIED")}
                          </Badge>
                          {p.clearing_eligible && (
                            <Badge variant="outline" className="font-mono text-[8px] border-primary/40 bg-primary/10 text-primary">
                              {t("ELIGIBLE")}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate">
                          {p.organization} · {p.city}, {p.country}
                        </p>
                        {p.stellar_public_key && (
                          <p className="font-mono text-[9px] text-muted-foreground/60 truncate">
                            {p.stellar_public_key}
                          </p>
                        )}
                      </div>

                      {/* Quick indicators */}
                      <div className="hidden sm:flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">{t("Reliability")}</p>
                          <p className={`font-mono text-xs font-semibold ${
                            reliabilityTone === "ok" ? "text-success"
                              : reliabilityTone === "warn" ? "text-warning"
                                : reliabilityTone === "bad" ? "text-destructive"
                                  : "text-muted-foreground"
                          }`}>
                            {p.settlement_reliability_pct !== null ? `${p.settlement_reliability_pct}%` : "—"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">{t("Settlements")}</p>
                          <p className="font-mono text-xs font-semibold">{p.settlements_total}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">{t("Contracts")}</p>
                          <p className="font-mono text-xs font-semibold">{p.active_contracts}</p>
                        </div>
                      </div>

                      {isExp ? (
                        <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>

                    {/* Expanded detail */}
                    {isExp && (
                      <div className="border-t border-border px-3 py-3">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                          <CpMetric
                            label={t("Settlement Reliability")}
                            value={p.settlement_reliability_pct !== null ? `${p.settlement_reliability_pct}%` : "—"}
                            badge={
                              p.settlement_reliability_pct === null ? t("NO DATA")
                                : p.settlement_reliability_pct >= 95 ? t("HIGH")
                                  : p.settlement_reliability_pct >= 70 ? t("MODERATE") : t("LOW")
                            }
                            tone={reliabilityTone as "ok" | "warn" | "bad" | "muted"}
                          />
                          <CpMetric
                            label={t("Settled / Total")}
                            value={`${p.settlements_settled} / ${p.settlements_total}`}
                            badge={p.settlements_failed > 0 ? `${p.settlements_failed} ${t("FAILED")}` : t("CLEAN")}
                            tone={p.settlements_failed > 0 ? "warn" : p.settlements_total > 0 ? "ok" : "muted"}
                          />
                          <CpMetric
                            label={t("Cleared Volume")}
                            value={p.cleared_volume_brl > 0 ? fmtBrl(p.cleared_volume_brl) : "—"}
                            badge={p.cleared_volume_brl > 0 ? t("ACTIVE") : t("NO VOLUME")}
                            tone={p.cleared_volume_brl > 0 ? "ok" : "muted"}
                          />
                          <CpMetric
                            label={t("Active Contracts")}
                            value={String(p.active_contracts)}
                            badge={p.active_contracts > 0 ? t("ACTIVE") : t("NONE")}
                            tone={p.active_contracts > 0 ? "ok" : "muted"}
                          />
                          <CpMetric
                            label={t("Clearing Eligibility")}
                            value={p.clearing_eligible ? t("Eligible") : t("Not Eligible")}
                            badge={
                              !p.wallet_funded ? t("WALLET NOT FUNDED")
                                : !p.has_trustline ? t("NO TRUSTLINE")
                                  : t("ELIGIBLE")
                            }
                            tone={p.clearing_eligible ? "ok" : "warn"}
                          />
                          <CpMetric
                            label={t("Wallet Status")}
                            value={p.wallet_funded ? t("Funded") : t("Not Funded")}
                            badge={p.has_trustline ? t("EPWR TRUSTLINE") : t("NO TRUSTLINE")}
                            tone={p.wallet_funded ? "ok" : "warn"}
                          />
                          <CpMetric
                            label={t("Member Since")}
                            value={`${memberDays(p.member_since)} ${t("days")}`}
                            badge={t("VERIFIED")}
                            tone="ok"
                          />
                          <CpMetric
                            label={t("Collateral Coverage")}
                            value="—"
                            badge={t("PENDING DATA SOURCE")}
                            tone="muted"
                          />
                          <CpMetric
                            label={t("Risk Tier")}
                            value="—"
                            badge={t("REQUIRES RISK ENGINE")}
                            tone="muted"
                          />
                          <CpMetric
                            label={t("Credit Score")}
                            value="—"
                            badge={t("NOT AVAILABLE")}
                            tone="muted"
                          />
                        </div>
                        <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                          {t("Risk data is restricted to authenticated and verified clearing participants.")}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
            {filtered.length} verified participant{filtered.length !== 1 ? "s" : ""} · {t("Data derived from real settlement and wallet records.")}
          </p>
        </div>
      )}
    </Card>
  );
}

function CpMetric({
  label,
  value,
  badge,
  tone,
}: {
  label: string;
  value: string;
  badge: string;
  tone: "ok" | "warn" | "bad" | "muted";
}) {
  const badgeClass =
    tone === "ok"
      ? "border-success/40 bg-success/10 text-success"
      : tone === "warn"
        ? "border-warning/40 bg-warning/10 text-warning"
        : tone === "bad"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted/30 text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-card/60 px-2 py-1.5">
      <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-[11px] font-semibold">{value}</p>
      <Badge variant="outline" className={`mt-0.5 font-mono text-[7px] ${badgeClass}`}>
        {badge}
      </Badge>
    </div>
  );
}
