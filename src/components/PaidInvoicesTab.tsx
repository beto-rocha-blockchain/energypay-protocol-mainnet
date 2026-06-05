/**
 * PaidInvoicesTab — unified list of PAID charges (card / PIX via Asaas +
 * confirmed crypto invoices). Read-only verification view.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Receipt,
  Loader2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  CreditCard,
  Coins,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiListPaidInvoices, type BillingInvoice } from "@/lib/api";
import { useT } from "@/lib/i18n";

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PaidInvoicesTab() {
  const t = useT();
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListPaidInvoices();
      setInvoices(res.invoices);
    } catch (err) {
      toast.error((err as Error).message || t("Failed to load invoices."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Paid invoices")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("Confirmed charges — card, PIX and crypto payments.")}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
          {t("Refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : invoices.length === 0 ? (
        <Card className="border-dashed border-border bg-card/40 p-10 text-center">
          <Receipt className="mx-auto mb-3 h-6 w-6 text-muted-foreground/30" />
          <p className="font-mono text-[11px] text-muted-foreground">{t("No paid invoices yet.")}</p>
          <p className="mt-1 text-[10px] text-muted-foreground/60">
            {t("Your confirmed charges will appear here.")}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const isCrypto = inv.source === "crypto_invoice";
            return (
              <Card key={`${inv.source}-${inv.id}`} className="border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-md border border-border bg-muted/30 p-2">
                      {isCrypto ? (
                        <Coins className="h-4 w-4 text-primary" />
                      ) : (
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-mono text-sm font-semibold">{inv.plan_name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {inv.method} · {fmtDate(inv.paid_at)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-base font-semibold">{brl(inv.amount_brl)}</p>
                    <Badge variant="outline" className="border-success/40 bg-success/10 font-mono text-[8px] uppercase tracking-widest text-success">
                      <CheckCircle2 className="mr-1 h-2.5 w-2.5" /> {t("Paid")}
                    </Badge>
                  </div>
                </div>

                {isCrypto && (inv.tx_hash || inv.explorer_url) && (
                  <div className="mt-3 border-t border-border pt-2.5">
                    {inv.amount_received && inv.asset_code && (
                      <p className="font-mono text-[9px] text-muted-foreground">
                        {t("Received:")} {inv.amount_received} {inv.asset_code}
                        {inv.ledger ? ` · ledger ${inv.ledger}` : ""}
                      </p>
                    )}
                    {inv.explorer_url && (
                      <a
                        href={inv.explorer_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 flex items-center gap-1 font-mono text-[9px] text-primary hover:underline"
                      >
                        {inv.tx_hash ? `${inv.tx_hash.slice(0, 12)}…` : t("View transaction")} {t("on Stellar Expert")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}

                {!isCrypto && inv.gateway_invoice_url && (
                  <div className="mt-3 border-t border-border pt-2.5">
                    <a
                      href={inv.gateway_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-mono text-[9px] text-primary hover:underline"
                    >
                      {t("View receipt on gateway")} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
