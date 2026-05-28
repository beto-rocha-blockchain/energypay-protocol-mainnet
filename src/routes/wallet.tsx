import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Activity, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletBalancesPanel } from "@/components/WalletBalancesPanel";
import { useOperator } from "@/store/operator";
import { useWalletActivity } from "@/hooks/useWalletActivity";
import { stellarExpertTx } from "@/lib/stellar";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — EnergyPay Settlement" },
      {
        name: "description",
        content:
          "Live institutional wallet balances on the Stellar settlement rail — XLM, EPWR and operational telemetry.",
      },
    ],
  }),
  component: WalletPage,
});

const shortHash = (h: string) =>
  h && h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-6)}` : h || "—";

function WalletPage() {
  const operator = useOperator((s) => s.operator);
  const isAuthenticated = useOperator((s) => s.isAuthenticated);

  if (!isAuthenticated || !operator) {
    return <Navigate to="/login" />;
  }

  const publicKey =
    operator?.wallet?.publicKey ||
    operator?.settlementAddress ||
    "";

  if (!publicKey) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-warning">
            Wallet unavailable
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            This operator session does not include a valid Stellar settlement address.
            Please sign out and provision a new settlement identity.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <WalletBalancesPanel
        publicKey={publicKey}
        organization={operator.organization}
        funded={operator.funded || operator.wallet?.funded}
      />
      <LedgerActivityPanel publicKey={publicKey} />
    </div>
  );
}

/* ── Ledger Activity Panel ── */

function LedgerActivityPanel({ publicKey }: { publicKey: string }) {
  const activity = useWalletActivity(publicKey);

  return (
    <Card className="border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Stellar Horizon · Your On-chain Operations
          </p>
          <p className="font-display text-lg font-semibold">Recent Ledger Operations</p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
          {activity.fetchedAt && (
            <Badge variant="outline" className="border-success/40 text-success">
              <Activity className="mr-1.5 h-3 w-3 animate-pulse" />
              STREAMING
            </Badge>
          )}
          {activity.fetchedAt && (
            <span className="text-muted-foreground">
              sync {new Date(activity.fetchedAt).toUTCString().slice(17, 25)}
            </span>
          )}
        </div>
      </div>

      {activity.loading && activity.events.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : activity.events.length === 0 ? (
        <div className="py-10 text-center">
          <Activity className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="font-mono text-sm text-muted-foreground">
            No ledger activity in current window.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Tx Hash</th>
                <th className="px-2 py-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Kind</th>
                <th className="px-2 py-2 text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Amount</th>
                <th className="px-2 py-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Asset</th>
                <th className="px-2 py-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Result</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {activity.events.slice(0, 15).map((ev) => (
                <tr key={ev.id} className="border-b border-border/50 hover:bg-primary/[0.03]">
                  <td className="px-2 py-2 font-mono text-[11px] text-primary">
                    {shortHash(ev.tx_hash)}
                  </td>
                  <td className="px-2 py-2 font-mono text-[10px] uppercase text-muted-foreground">
                    {ev.kind}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[11px]">
                    {ev.amount ?? "—"}
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px]">{ev.asset ?? "—"}</td>
                  <td className="px-2 py-2">
                    <Badge
                      variant="outline"
                      className={`font-mono text-[9px] ${
                        ev.successful
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-destructive/40 bg-destructive/10 text-destructive"
                      }`}
                    >
                      {ev.successful ? "FINALIZED" : "FAILED"}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <a
                      href={stellarExpertTx(ev.tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-primary"
                    >
                      Stellar Expert <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}