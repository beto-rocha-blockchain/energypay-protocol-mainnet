import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Loader2, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiGetUtilityTusd } from "@/lib/api";
import { RequireRole } from "@/components/RequireRole";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/utility/tusd")({
  component: () => (
    <RequireRole role="UTILITY">
      <UtilityTusdPage />
    </RequireRole>
  ),
});

function maskTxHash(hash: string) {
  if (!hash) return "—";
  return hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}

function UtilityTusdPage() {
  const t = useT();
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGetUtilityTusd();
        setSettlements(res.settlements ?? []);
      } catch (err) {
        toast.error(`${t("Failed to load TUSD settlements")}: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalBrl = settlements.reduce((sum, s) => sum + (Number(s.amount_brl ?? s.amount ?? 0)), 0);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Banknote className="h-5 w-5 text-orange-400" />
        <h1 className="font-mono text-sm uppercase tracking-widest text-orange-400">
          {t("TUSD Settlement — UTL-03")}
        </h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-orange-400/20 bg-orange-400/5 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("Total Settled Volume")}</p>
          <p className="mt-1 font-mono text-2xl text-orange-400">
            {loading ? "—" : `R$ ${totalBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          </p>
        </Card>
        <Card className="border-green-400/20 bg-green-400/5 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("Settlement Count")}</p>
          <p className="mt-1 font-mono text-2xl text-green-400">{loading ? "—" : settlements.length}</p>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-border bg-background overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-mono text-xs uppercase tracking-widest">{t("Loading…")}</span>
          </div>
        ) : settlements.length === 0 ? (
          <div className="flex items-center justify-center p-12">
            <p className="font-mono text-xs text-muted-foreground text-center max-w-md">
              {t("No TUSD settlements recorded. Distribution tariff flows will appear here as UTILITY operators execute contracts.")}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("Settlement ID")}</th>
                <th className="px-4 py-3 text-right font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("Amount (R$)")}</th>
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("Tx Hash")}</th>
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("Date")}</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s, i) => {
                const txHash = s.tx_hash || s.txHash || "";
                const explorerUrl = txHash
                  ? `https://stellar.expert/explorer/public/tx/${txHash}`
                  : null;
                const amount = Number(s.amount_brl ?? s.amount ?? 0);
                const dateStr = s.settled_at || s.created_at || s.date || "";
                const displayDate = dateStr
                  ? new Date(dateStr).toLocaleDateString("pt-BR")
                  : "—";
                return (
                  <tr key={s.id ?? i} className="border-b border-border/50 hover:bg-orange-400/5">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {s.id ? `${String(s.id).slice(0, 8)}…` : `#${i + 1}`}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-foreground">
                      {amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {explorerUrl ? (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300"
                        >
                          {maskTxHash(txHash)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{maskTxHash(txHash)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{displayDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
