import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  Gauge,
  RefreshCw,
  Radio,
  Factory,
  TrendingUp,
  LineChart,
  ShoppingCart,
  ArrowRight,
  Building2,
  Scale,
} from "lucide-react";
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
import { useNetworkStore } from "@/store/network";
import { stellarExpertTx, STELLAR_NETWORK_LABEL } from "@/lib/stellar";
import { useOperator, type ParticipantRole } from "@/store/operator";
import { useT } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations — EnergyPay" },
      {
        name: "description",
        content:
          "Real-time settlement operations, treasury balances, telemetry and transaction feed.",
      },
    ],
  }),
  component: OperationsPage,
});

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtCompact = (n: number) => {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
};

const shortHash = (h: string) =>
  h && h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-6)}` : h || "—";

const timeAgo = (iso: string) => relativeTime(iso);

function OperationsPage() {
  const t = useT();
  const { stats, settlements, horizon, loading, error, refresh } = useDashboard();
  const operator = useOperator((s) => s.operator);
  // Primary role drives the contextual panel (first role wins)
  const primaryRole = operator?.roles?.[0] ?? null;
  // Network-wide counts (e.g. total participants) are administrative — only
  // platform owners/admins see them.
  const isAdmin =
    operator?.platformRole === "PLATFORM_OWNER" || operator?.platformRole === "PLATFORM_ADMIN";

  // Live connection status — from the shared store, independent of this page's fetch.
  const stellarStatus = useNetworkStore((s) => s.stellar);
  const backendOnline = useNetworkStore((s) => s.backend.online);

  const finalityMs = stats?.avg_finality_ms ?? 0;
  const finalitySamples = stats?.finality_samples ?? 0;
  const horizonLatency = stellarStatus.latencyMs ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Settlement Operations")}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("Operations Dashboard")}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-widest">
            <Radio className="mr-1.5 h-3 w-3 text-success" />
            {STELLAR_NETWORK_LABEL}
          </Badge>
          <Badge
            variant="outline"
            className={`font-mono text-[10px] uppercase tracking-widest ${
              stellarStatus.online === false
                ? "border-destructive/40 text-destructive"
                : "border-success/40 text-success"
            }`}
          >
            <Activity className="mr-1.5 h-3 w-3" />
            {stellarStatus.online === false ? t("HORIZON OFFLINE") : t("HORIZON ONLINE")}
          </Badge>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("Refresh")}
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <p className="flex-1 text-sm text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={refresh}>
              {t("Retry")}
            </Button>
          </div>
        </Card>
      )}

      {/* Role Context Panel */}
      {primaryRole && <RoleContextPanel role={primaryRole} />}

      {/* KPI Strip */}
      <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${isAdmin ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        <KpiCard
          label={t("Settlements")}
          value={String(stats?.total_settlements ?? 0)}
          sub={`${stats?.settled_count ?? 0} ${t("confirmed")}`}
          loading={loading && !stats}
        />
        <KpiCard
          label={t("Failed")}
          value={String(stats?.failed_count ?? 0)}
          sub={t("rejected / reverted")}
          loading={loading && !stats}
          tone={stats?.failed_count ? "warn" : "ok"}
        />
        <KpiCard
          label={t("Cleared Volume")}
          value={fmtBRL(stats?.total_value_brl ?? 0)}
          sub={t("total BRL settled")}
          loading={loading && !stats}
        />
        {isAdmin && (
          <KpiCard
            label={t("Users")}
            value={String(stats?.total_users ?? 0)}
            sub={t("counterparties")}
            loading={loading && !stats}
          />
        )}
        {finalitySamples > 0 && (
          <KpiCard
            label={t("Avg. Finality")}
            value={`${(finalityMs / 1000).toFixed(2)}s`}
            sub={`Horizon · ${horizonLatency} ms`}
            loading={loading && !stats}
            tone={finalityMs && finalityMs < 6000 ? "ok" : "muted"}
          />
        )}
        <KpiCard
          label="Horizon"
          value={stellarStatus.online === false ? t("OFFLINE") : t("ONLINE")}
          sub={`${horizonLatency} ms ${t("latency")}`}
          loading={stellarStatus.online === null}
          tone={stellarStatus.online === false ? "warn" : "ok"}
          led
        />
      </div>

      {/* Treasury + Telemetry */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="border-border bg-card p-4 lg:col-span-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Platform Treasury · Live Balances")}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <BalanceMini label={t("Operator")} value={horizon?.operator_balance?.xlm} symbol="XLM" />
            <BalanceMini label={t("Distribution")} value={horizon?.distribution_balance?.xlm} symbol="XLM" />
            <BalanceMini label={t("EPWR Supply")} value={horizon?.distribution_balance?.epwr} symbol="EPWR" compact />
          </div>
        </Card>

        <Card className="border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Operational Telemetry")}
          </p>
          <div className="mt-3 space-y-2">
            <TelRow icon={<Gauge className="h-3.5 w-3.5" />} label={t("Horizon latency")} value={`${horizonLatency} ms`} tone={horizonLatency < 1000 ? "ok" : "warn"} />
            <TelRow icon={<Activity className="h-3.5 w-3.5" />} label={t("Backend API")} value={backendOnline === false ? t("OFFLINE") : t("ONLINE")} tone={backendOnline === false ? "warn" : "ok"} />
          </div>
        </Card>
      </div>

      {/* Recent Settlements */}
      <Card className="border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("Settlement Feed · Live")}
            </p>
            <p className="font-display text-lg font-semibold">{t("Recent Transactions")}</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/contracts">
                {t("Contracts")} <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/p2p">
                {t("Direct Settlement")} <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
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
            <p className="font-mono text-sm text-muted-foreground">{t("No settlements recorded yet.")}</p>
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
  const fontSize = value.length > 16 ? "text-sm" : value.length > 12 ? "text-base" : "text-xl";

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

function BalanceMini({
  label,
  value,
  symbol,
  compact = false,
}: {
  label: string;
  value?: string;
  symbol: string;
  compact?: boolean;
}) {
  const formatted = value
    ? compact
      ? fmtCompact(Number(value))
      : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })
    : "—";
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display font-semibold break-all ${formatted.length > 14 ? "text-xs" : formatted.length > 10 ? "text-sm" : "text-lg"}`}>{formatted}</p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{symbol}</p>
    </div>
  );
}

function TelRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  tone: "ok" | "warn" | "muted";
}) {
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

// ── Role-specific contextual panel ────────────────────────────────────────────

const ROLE_CONTEXT = {
  GENERATOR: {
    Icon: Factory,
    accent: "border-red-400/30 bg-red-400/5",
    iconAccent: "text-red-400 bg-red-400/10 border-red-400/30",
    label: "Generator Operations",
    description: "You produce energy and sell it on the settlement network. Register your real-world energy contracts on the platform so the counterparty can review and approve them. All settlements arrive as EPWR to your custody wallet.",
    actions: [
      { label: "Register Energy Contract", to: "/contracts/new", primary: true },
      { label: "Settlement History", to: "/settlement", primary: true },
    ],
    tips: [
      "You only sell — never buy. Sellers and consumers come to you.",
      "Set your price per MWh when creating a contract.",
      "EPWR received represents your settled energy production.",
    ],
  },
  SELLER: {
    Icon: TrendingUp,
    accent: "border-sky-400/30 bg-sky-400/5",
    iconAccent: "text-sky-400 bg-sky-400/10 border-sky-400/30",
    label: "Trading Operations",
    description: "You buy energy from generators at wholesale and resell to consumers at market rate. Your profit is the spread between buy and sell price. Manage both sides of your book through the Contract Registry.",
    actions: [
      { label: "New Trade Contract", to: "/contracts/new", primary: true },
      { label: "Contract Registry", to: "/contracts", primary: false },
      { label: "Oracle & Market Data", to: "/oracle", primary: false },
    ],
    tips: [
      "Monitor PLD (Preço de Liquidação das Diferenças) in Oracle & Market Data.",
      "Buy contracts link you to generators; sell contracts link you to consumers.",
      "Reconciliation shows your net position across all open contracts.",
    ],
  },
  INVESTOR: {
    Icon: LineChart,
    accent: "border-yellow-400/30 bg-yellow-400/5",
    iconAccent: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
    label: "Investment Portfolio",
    description: "You hold EPWR as a store of value, appreciating as the energy market grows. Track your portfolio value against the PLD reference price and monitor settlement volume for market signals.",
    actions: [
      { label: "Oracle & Market Data", to: "/oracle", primary: true },
      { label: "Custody Wallet", to: "/wallet", primary: false },
      { label: "Settlement Analytics", to: "/settlement", primary: false },
    ],
    tips: [
      "EPWR value tracks the Brazilian energy settlement market.",
      "Higher settlement volume = stronger demand for EPWR.",
      "Treasury & Rails shows the total EPWR supply and distribution.",
    ],
  },
  USER: {
    Icon: ShoppingCart,
    accent: "border-green-400/30 bg-green-400/5",
    iconAccent: "text-green-400 bg-green-400/10 border-green-400/30",
    label: "Energy Consumption",
    description: "You are a free-market consumer (Mercado Livre) and can purchase energy directly from generators and sellers. Browse the Operational Grid to find available supply, create a buy contract, and settle in EPWR.",
    actions: [
      { label: "Find Energy Sellers", to: "/grid", primary: true },
      { label: "My Contracts", to: "/contracts", primary: false },
    ],
    tips: [
      "As a free-market consumer you can buy directly from generators — no intermediary needed.",
      "Check Oracle & Market Data for the current PLD before negotiating.",
    ],
  },
  UTILITY: {
    Icon: Building2,
    accent: "border-orange-400/30 bg-orange-400/5",
    iconAccent: "text-orange-400 bg-orange-400/10 border-orange-400/30",
    label: "Utility Operations",
    description: "",
    actions: [
      { label: "Consumer Registry", to: "/utility/uc", primary: true },
      { label: "Grid Connections", to: "/utility/connections", primary: false },
      { label: "TUSD Settlement", to: "/utility/tusd", primary: false },
    ],
    tips: [],
  },
  REGULATORY_AUTHORITY: {
    Icon: Scale,
    accent: "border-violet-400/30 bg-violet-400/5",
    iconAccent: "text-violet-400 bg-violet-400/10 border-violet-400/30",
    label: "Regulatory Oversight",
    description: "You have certified read-only access to the EnergyPay settlement network. Monitor the full audit trail, verify settlement receipts, and export compliance reports without the ability to execute transactions or modify any operational data.",
    actions: [
      { label: "Audit & Compliance", to: "/audit", primary: true },
      { label: "Contract Registry", to: "/contracts", primary: false },
      { label: "Settlement Console", to: "/settlement", primary: false },
    ],
    tips: [
      "Your access is strictly read-only — no execution, no wallet operations.",
      "All settlement receipts are immutably recorded on the Stellar ledger.",
      "Use Audit & Compliance to export reports for institutional review.",
    ],
  },
} as const;

function RoleContextPanel({ role }: { role: ParticipantRole }) {
  const t = useT();
  const ctx = ROLE_CONTEXT[role as keyof typeof ROLE_CONTEXT];
  if (!ctx?.actions?.length) return null;

  // Only the quick-action buttons — no framed card, icon, title or description.
  return (
    <div className="flex flex-wrap gap-1.5">
      {ctx.actions.map((a) => (
        <Button
          key={a.to}
          asChild
          size="sm"
          variant={a.primary ? "default" : "outline"}
          className="h-7 font-mono text-[10px] uppercase tracking-widest"
        >
          <Link to={a.to}>
            {t(a.label)}
            <ArrowRight className="ml-1.5 h-3 w-3" />
          </Link>
        </Button>
      ))}
    </div>
  );
}
