/**
 * FiscalDocumentsTab — downloadable payment RECEIPTS now + official NF-e/NFS-e
 * status (future).
 *
 * IMPORTANT (per product/compliance decision):
 *   · EnergyPay does NOT yet issue official Brazilian fiscal documents
 *     (NF-e / NFS-e). The PDFs offered here are PAYMENT RECEIPTS, clearly
 *     labelled as such — never presented as official fiscal invoices.
 *   · Downloading a receipt is a maximum-security action → step-up required.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Download,
  Loader2,
  RefreshCw,
  Info,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StepUpModal } from "@/components/StepUpModal";
import {
  apiListBillingDocuments,
  apiDownloadReceipt,
  type FiscalReadiness,
  type ReceiptDocument,
} from "@/lib/api";

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export function FiscalDocumentsTab() {
  const [fiscal, setFiscal] = useState<FiscalReadiness | null>(null);
  const [receipts, setReceipts] = useState<ReceiptDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Step-up gate for receipt downloads.
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const pendingAction = useRef<((token: string) => Promise<void>) | null>(null);
  const requireStepUp = (action: (token: string) => Promise<void>) => {
    pendingAction.current = action;
    setStepUpOpen(true);
  };
  const onStepUpConfirmed = async (token: string) => {
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) await action(token);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListBillingDocuments();
      setFiscal(res.fiscal);
      setReceipts(res.receipts);
    } catch (err) {
      toast.error((err as Error).message || "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const download = (r: ReceiptDocument) => {
    const key = `${r.source}-${r.payment_id}`;
    requireStepUp(async (token) => {
      setBusyKey(key);
      try {
        const blob = await apiDownloadReceipt(r.source, r.payment_id, token);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `energypay-receipt-${r.payment_id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("Receipt downloaded.");
      } catch (err) {
        toast.error((err as Error).message || "Could not download the receipt.");
      } finally {
        setBusyKey(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Tax documents &amp; receipts
          </p>
          <p className="text-[11px] text-muted-foreground">
            Download payment receipts. Official NF-e/NFS-e coming soon.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
          Refresh
        </Button>
      </div>

      {/* Official fiscal-issuance status banner */}
      <Card className="border-warning/30 bg-warning/5 p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-warning">
              Official fiscal issuance
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {fiscal?.message_en ??
                "Official NF-e/NFS-e issuance will be available once EnergyPay's tax profile and digital certificate are configured."}
            </p>
            {fiscal && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                  Tax profile: {fiscal.company_profile_status}
                </Badge>
                <Badge variant="outline" className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                  Certificate: {fiscal.certificate_status}
                </Badge>
                <Badge variant="outline" className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                  {fiscal.can_issue_official ? "Ready to issue" : "Issuance pending"}
                </Badge>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Receipts list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : receipts.length === 0 ? (
        <Card className="border-dashed border-border bg-card/40 p-10 text-center">
          <FileText className="mx-auto mb-3 h-6 w-6 text-muted-foreground/30" />
          <p className="font-mono text-[11px] text-muted-foreground">No receipts available.</p>
          <p className="mt-1 text-[10px] text-muted-foreground/60">
            Each paid charge generates a receipt for download here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {receipts.map((r) => {
            const key = `${r.source}-${r.payment_id}`;
            return (
              <Card key={key} className="flex items-center justify-between border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-md border border-border bg-muted/30 p-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm font-semibold">Payment receipt</p>
                      <Badge variant="outline" className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                        {r.source === "crypto_invoice" ? "Crypto" : "Subscription"}
                      </Badge>
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {brl(r.amount_brl)} · {fmtDate(r.issued_at)}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => download(r)}
                  disabled={busyKey === key}
                >
                  {busyKey === key ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Download className="mr-1.5 h-3 w-3" />}
                  Download receipt
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {/* Receipt vs NF-e disclaimer */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-card/40 p-3">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="font-mono text-[9px] leading-relaxed text-muted-foreground">
          Estes documentos são recibos de pagamento gerados pela EnergyPay. Eles não substituem uma Nota
          Fiscal eletrônica (NF-e/NFS-e) oficial. · This document is a payment receipt generated by EnergyPay.
          It is not an official Brazilian NF-e/NFS-e fiscal invoice.
        </p>
      </div>

      <StepUpModal open={stepUpOpen} onOpenChange={setStepUpOpen} onConfirmed={onStepUpConfirmed} />
    </div>
  );
}
