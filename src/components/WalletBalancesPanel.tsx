import { useCallback, useMemo, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { getSession } from "@/lib/session";
import {
  Wallet,
  Coins,
  Activity,
  RefreshCw,
  Copy,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Zap,
  CheckCircle2,
  Gauge,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { stellarExpertAccount, STELLAR_NETWORK_LABEL } from "@/lib/stellar";
import { maskAddress } from "@/store/operator";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

type Props = {
  publicKey: string;
  organization?: string;
  funded?: boolean;
};

const fmtAmount = (raw: string, decimals = 4) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 2 });
};

const sinceMs = (iso: string | null) => (iso ? Date.now() - new Date(iso).getTime() : null);

export function WalletBalancesPanel({ publicKey, organization, funded }: Props) {
  const t = useT();
  const { data, error, loading, fetchedAt, refresh } = useWalletBalances(publicKey);
  const [copied, setCopied] = useState(false);

  const xlm = data?.balances?.xlm ?? "0";
  const eprw = data?.balances?.eprw ?? "0";
  const xlmNum = Number(xlm);
  const eprwNum = Number(eprw);

  // Reserve calculation — same formula used across the platform
  const subentries = data?.subentry_count ?? 0;
  const STELLAR_BASE_RESERVE = 0.5;
  const STELLAR_FEE_BUFFER = 0.01;
  const xlmReserved = (2 + subentries) * STELLAR_BASE_RESERVE;
  const xlmSpendable = Math.max(0, xlmNum - xlmReserved - STELLAR_FEE_BUFFER);

  const health = useMemo(() => {
    if (error) return { label: "DEGRADED", tone: "warn" as const };
    if (!data) return { label: "INITIALIZING", tone: "muted" as const };
    if (xlmNum < 1) return { label: "LOW RESERVE", tone: "warn" as const };
    return { label: "OPERATIONAL", tone: "ok" as const };
  }, [data, error, xlmNum]);

  const trustline = data?.summary?.eprw_trustline ?? (!!data && eprwNum > 0);
  const latency = data?.latency_ms ?? null;
  const [enablingTrustline, setEnablingTrustline] = useState(false);

  const handleEnableEPWR = useCallback(async () => {
    setEnablingTrustline(true);
    try {
      const session = getSession();
      const res = await fetch(`${API_BASE_URL}/api/token/trustline/me`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
      });
      const json = await res.json();
      if (json.success) {
        toast.success(t("EPWR trustline created successfully"));
        refresh();
      } else {
        toast.error(json.error || t("Failed to create trustline"));
      }
    } catch (err) {
      toast.error(t("Network error creating trustline"));
    } finally {
      setEnablingTrustline(false);
    }
  }, [refresh, t]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(t("Public key copied"));
    } catch {
      toast.error(t("Copy failed"));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Custody Wallet · Your Settlement Account")}
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            {t("Live Wallet Balances")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Live on-chain balances for")} <strong>{t("your")}</strong> {t("personal settlement account on the Stellar ledger — backed directly by Horizon.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-widest">
            <Radio className="mr-1.5 h-3 w-3 text-success" /> {STELLAR_NETWORK_LABEL}
          </Badge>
          <Badge
            variant="outline"
            className={`font-mono text-[10px] uppercase tracking-widest ${
              health.tone === "ok"
                ? "border-success/40 text-success"
                : health.tone === "warn"
                  ? "border-destructive/40 text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            <Activity className="mr-1.5 h-3 w-3" /> {t(health.label)}
          </Badge>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("Refresh")}
          </Button>
        </div>
      </div>

      {/* Wallet identity strip */}
      <Card className="border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[image:var(--gradient-primary)] shadow-[var(--shadow-glow)]">
              <Wallet className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("Your Settlement Account · Stellar")} {data?.network ?? "Mainnet"}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="font-mono text-sm">{maskAddress(publicKey)}</span>
                <button
                  onClick={handleCopy}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t("Copy public key")}
                >
                  {copied ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <a
                  href={stellarExpertAccount(publicKey)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t("Open in Stellar Expert")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              {organization && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{organization}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <Indicator
              label={t("Funded")}
              value={data?.account_funded || funded ? t("YES") : "—"}
              tone={data?.account_funded || funded ? "ok" : "muted"}
            />
            <Indicator
              label={t("Trustline")}
              value={trustline ? "EPWR" : t("PENDING")}
              tone={trustline ? "ok" : "warn"}
            />
            <Indicator
              label={t("Reserve")}
              value={xlmNum >= 1 ? t("OK") : t("LOW")}
              tone={xlmNum >= 1 ? "ok" : "warn"}
            />
          </div>
        </div>
      </Card>

      {/* Error banner */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="flex-1">
              <p className="font-mono text-[11px] uppercase tracking-widest text-destructive">
                {t("Balance Feed Degraded")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={refresh}>
              {t("Retry")}
            </Button>
          </div>
        </Card>
      )}

      {/* Unfunded account guidance — shown when Horizon confirms the account isn't on the ledger */}
      {!error && !loading && data && !data.account_funded && (
        <Card className="border-yellow-500/30 bg-yellow-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-500 shrink-0" />
            <div className="flex-1">
              <p className="font-mono text-[11px] uppercase tracking-widest text-yellow-500">
                {t("Settlement Account — Not Yet on the Ledger")}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t("Your EnergyPay settlement account (")}<span className="font-mono text-foreground">{publicKey.slice(0, 6)}…{publicKey.slice(-6)}</span>{t(") has not been activated on Stellar Mainnet yet. To activate it, the account needs a minimum deposit of")} <strong>{t("1 XLM")}</strong>.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("Please contact EnergyPay support or fund the account using Stellar Expert:")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={stellarExpertAccount(publicKey)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-yellow-500 hover:bg-yellow-500/20 transition-colors"
                >
                  {t("View on Stellar Expert")} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Balance glow cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BalanceGlowCard
          symbol="XLM"
          label={t("Stellar Lumens")}
          tagline={t("Network reserve · operational gas")}
          icon={<Zap className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />}
          loading={loading && !data}
          amount={fmtAmount(xlm, 4)}
        />
        <BalanceGlowCard
          symbol="EPWR"
          label={t("EnergyPay Receivable")}
          tagline={t("Energy settlement unit · 1 EPWR = 1 MWh")}
          icon={<Coins className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />}
          loading={loading && !data}
          amount={fmtAmount(eprw, 2)}
        />
      </div>

      {/* Reserve breakdown — only when account is loaded */}
      {data && (
        <div className="rounded-md border border-border bg-background/40 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[10px]">
            <span className="text-muted-foreground uppercase tracking-widest shrink-0">
              {t("Account Balance Breakdown")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t("Total on-chain:")}</span>
              <span className="text-foreground font-semibold">{xlmNum.toFixed(7)} XLM</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t("Stellar reserve lock:")}</span>
              <span className="text-foreground">
                {xlmReserved.toFixed(2)} XLM
                <span className="text-muted-foreground/70">
                  {" "}· {2 + subentries} {t("entries × 0.5 XLM")}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t("Spendable:")}</span>
              <span className={xlmSpendable < 0.5 ? "text-destructive font-semibold" : "text-success font-semibold"}>
                {xlmSpendable.toFixed(7)} XLM
              </span>
            </span>
          </div>
          {xlmNum > 0 && xlmSpendable < 0.1 && (
            <p className="mt-1.5 font-mono text-[10px] text-destructive">
              ⚠ {t("Spendable balance is very low — reserve consumes most of the account balance.")}
            </p>
          )}
        </div>
      )}

      {/* Telemetry + Activity */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Operational Telemetry")}
          </p>
          <div className="mt-3 space-y-2">
            <TelemetryRow
              icon={<Gauge className="h-3.5 w-3.5" />}
              label={t("Backend latency")}
              value={latency != null ? `${latency} ms` : "—"}
              tone={latency != null && latency < 600 ? "ok" : "warn"}
            />
            <TelemetryRow
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label={t("Last update")}
              value={
                fetchedAt
                  ? `${Math.max(0, Math.round((sinceMs(fetchedAt) ?? 0) / 1000))}s ago`
                  : "—"
              }
              tone={fetchedAt ? "ok" : "muted"}
            />
          </div>
        </Card>

        <Card className="border-border bg-card p-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("Blockchain Activity")}
            </p>
            <a
              href={stellarExpertAccount(publicKey)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] uppercase tracking-widest text-primary hover:underline"
            >
              {t("View on Stellar Expert")}
              <ExternalLink className="ml-1 inline h-3 w-3" />
            </a>
          </div>

          <div className="mt-3 space-y-2 font-mono text-[11px]">
            <ActivityLine
              ok={!loading && !error}
              text={
                loading && !data
                  ? t("Initializing balance feed…")
                  : data
                    ? `${t("Horizon snapshot resolved ·")} ${data.checked_at.slice(11, 19)}`
                    : error
                      ? t("Horizon snapshot unavailable")
                      : t("Awaiting first sample")
              }
            />
            {!trustline && data && !loading && (
              <>
                <ActivityLine
                  ok={trustline}
                  text={t("EPWR trustline not yet detected")}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-5 h-6 text-[10px] uppercase tracking-wider"
                  disabled={enablingTrustline}
                  onClick={handleEnableEPWR}
                >
                  {enablingTrustline ? t("Enabling…") : t("Enable EPWR")}
                </Button>
              </>
            )}
            <ActivityLine
              ok={!error}
              text={error ? `${t("Backend rail:")} ${error}` : t("Backend settlement rail responsive")}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Indicator({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "muted";
}) {
  const color =
    tone === "ok" ? "text-success" : tone === "warn" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 font-mono text-xs font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function BalanceGlowCard({
  symbol,
  label,
  tagline,
  icon,
  loading,
  amount,
}: {
  symbol: string;
  label: string;
  tagline: string;
  icon: React.ReactNode;
  loading: boolean;
  amount: string;
}) {
  const t = useT();
  return (
    <Card className="relative overflow-hidden border-border bg-card p-6">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--gradient-primary)" }}
      />
      <div className="relative flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 font-display text-sm text-muted-foreground">{tagline}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[image:var(--gradient-primary)] shadow-[var(--shadow-glow)]">
          {icon}
        </div>
      </div>

      <div className="relative mt-5 flex items-baseline gap-2">
        {loading ? (
          <Skeleton className="h-10 w-44" />
        ) : (
          <>
            <span className="font-display text-4xl font-semibold tracking-tight">{amount}</span>
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {symbol}
            </span>
          </>
        )}
      </div>

      <div className="relative mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <Activity className="h-3 w-3 text-success" />
        {t("Live · Horizon settlement rail")}
      </div>
    </Card>
  );
}

function TelemetryRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "ok" | "warn" | "muted";
}) {
  const color =
    tone === "ok" ? "text-success" : tone === "warn" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`font-mono text-[11px] ${color}`}>{value}</span>
    </div>
  );
}

function ActivityLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          ok
            ? "bg-success shadow-[0_0_6px_var(--success,theme(colors.green.500))]"
            : "bg-destructive"
        }`}
      />
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}
