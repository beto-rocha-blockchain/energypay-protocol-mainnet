/**
 * CryptoPaymentModal — pay a subscription with XLM or USDC from ANY Stellar
 * wallet.
 *
 * This is an ISOLATED billing flow. It NEVER:
 *   · touches the user's internal/managed wallet, custody or settlement engine;
 *   · asks for a secret key;
 *   · signs or submits a transaction.
 *
 * The user transfers funds externally to the EnergyPay treasury address using
 * the unique memo/reference shown here. The backend verifies the payment on
 * Stellar Mainnet via Horizon (read-only) and marks the invoice PAID.
 *
 * USDC asset code + issuer are resolved server-side from env vars — never
 * hard-coded here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Coins,
  Copy,
  CheckCheck,
  Loader2,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Info,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  apiCreateCryptoInvoice,
  apiVerifyCryptoInvoice,
  type CryptoBillingAsset,
  type CryptoInvoice,
} from "@/lib/api";

const ASSETS: CryptoBillingAsset[] = ["XLM", "USDC"];

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Trim trailing zeros from a fixed-decimal Stellar amount for display. */
function trimAmount(raw: string | null | undefined) {
  if (!raw) return "—";
  if (!raw.includes(".")) return raw;
  return raw.replace(/\.?0+$/, "");
}

function CopyField({
  label,
  value,
  mono = true,
  emphasis = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };
  return (
    <div>
      <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <div
          className={`min-w-0 flex-1 overflow-hidden rounded-md border px-3 py-2 ${
            emphasis ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20"
          }`}
        >
          <p className={`truncate ${mono ? "font-mono" : ""} text-[11px] ${emphasis ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            {value}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-auto shrink-0 px-3" onClick={copy} aria-label={`Copiar ${label}`}>
          {copied ? <CheckCheck className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

export function CryptoPaymentModal({
  open,
  plan,
  planLabel,
  onClose,
  onConfirmed,
}: {
  open: boolean;
  plan: "operator" | "enterprise" | null;
  planLabel: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [asset, setAsset] = useState<CryptoBillingAsset>("XLM");
  const [invoice, setInvoice] = useState<CryptoInvoice | null>(null);
  const [creating, setCreating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the modal is closed.
  useEffect(() => {
    if (!open) {
      setInvoice(null);
      setCreating(false);
      setVerifying(false);
      setError(null);
      setAsset("XLM");
    }
  }, [open]);

  const isPaid = invoice?.status === "PAID";
  const isExpired = invoice?.status === "EXPIRED" || invoice?.status === "FAILED";

  const generate = async () => {
    if (!plan) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiCreateCryptoInvoice(plan, asset);
      setInvoice(res.invoice);
    } catch (err) {
      const msg = (err as Error).message || "Falha ao gerar a fatura.";
      setError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const verify = useCallback(
    async (silent = false) => {
      if (!invoice?.id) return;
      setVerifying(true);
      try {
        const res = await apiVerifyCryptoInvoice(invoice.id);
        setInvoice(res.invoice);
        if (res.status === "PAID") {
          toast.success("Pagamento confirmado on-chain!");
          setTimeout(onConfirmed, 1600);
        } else if (!silent) {
          if (res.status === "EXPIRED") {
            toast.error("Esta fatura expirou. Gere uma nova.");
          } else {
            toast.info("Pagamento ainda não detectado na Stellar Mainnet.");
          }
        }
      } catch (err) {
        if (!silent) toast.error((err as Error).message || "Erro ao verificar.");
      } finally {
        setVerifying(false);
      }
    },
    [invoice?.id, onConfirmed],
  );

  // Light auto-poll while an invoice is pending and the modal is open.
  const verifyRef = useRef(verify);
  verifyRef.current = verify;
  useEffect(() => {
    if (!open || !invoice?.id || invoice.status !== "PENDING_PAYMENT") return;
    const t = setInterval(() => verifyRef.current(true), 15000);
    return () => clearInterval(t);
  }, [open, invoice?.id, invoice?.status]);

  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            Pagar com cripto — {planLabel}
          </DialogTitle>
          <DialogDescription>
            Pay with XLM or USDC from any Stellar wallet. O pagamento é verificado
            on-chain na Stellar Mainnet — sem expor sua chave secreta.
          </DialogDescription>
        </DialogHeader>

        {/* ── Success ─────────────────────────────────────────────── */}
        {isPaid ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCheck className="h-12 w-12 text-success" />
            <p className="font-mono text-sm font-semibold text-success">Pagamento confirmado!</p>
            <p className="text-[11px] text-muted-foreground">Ativando seu plano…</p>
            {invoice?.explorer_url && (
              <a
                href={invoice.explorer_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
              >
                Ver transação no Stellar Expert <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ) : !invoice ? (
          /* ── Step 1 — choose asset + generate ──────────────────── */
          <div className="space-y-4">
            <div>
              <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Ativo de pagamento
              </p>
              <div className="flex gap-3">
                {ASSETS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAsset(a)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                      asset === a
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <Coins className="h-3.5 w-3.5" />
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <p className="font-mono text-[10px] text-destructive">{error}</p>
              </div>
            )}

            <Button className="w-full" size="sm" onClick={generate} disabled={creating}>
              {creating ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Coins className="mr-1.5 h-3 w-3" />}
              Gerar instruções de pagamento
            </Button>

            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-3">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="font-mono text-[9px] leading-relaxed text-muted-foreground">
                Internal wallet balance payments are not enabled for subscriptions yet.
              </p>
            </div>
          </div>
        ) : (
          /* ── Step 2 — payment instructions ─────────────────────── */
          <div className="space-y-3.5">
            {isExpired && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <p className="font-mono text-[10px] text-destructive">
                  Esta fatura {invoice.status === "EXPIRED" ? "expirou" : "falhou"}. Gere uma nova para continuar.
                </p>
              </div>
            )}

            {/* Amount summary */}
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-card/50 p-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Valor a enviar</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-foreground">
                  {trimAmount(invoice.expected_amount)} {invoice.asset_code}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Equivalente</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-foreground">{brl(invoice.amount_brl)}</p>
              </div>
              {invoice.exchange_rate && (
                <div className="col-span-2 border-t border-border pt-2">
                  <p className="font-mono text-[9px] text-muted-foreground">
                    Cotação: 1 {invoice.asset_code} ≈ {brl(Number(invoice.exchange_rate))}
                    {invoice.rate_source ? ` · ${invoice.rate_source}` : ""}
                  </p>
                </div>
              )}
            </div>

            {/* Treasury address */}
            <CopyField label="Endereço da treasury (destino)" value={invoice.treasury_public_key} />

            {/* Memo — REQUIRED, emphasised */}
            <div>
              <CopyField label="Memo / referência — OBRIGATÓRIO" value={invoice.memo || invoice.payment_reference} emphasis />
              <div className="mt-1.5 flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                <p className="font-mono text-[9px] leading-relaxed text-warning">
                  Inclua este memo (tipo <span className="font-semibold">TEXT</span>) na transação. Sem o memo
                  correto, o pagamento não pode ser associado à sua fatura.
                </p>
              </div>
            </div>

            {/* Asset detail (issuer for USDC) */}
            {invoice.asset === "USDC" && invoice.asset_issuer && (
              <CopyField label={`Emissor do ${invoice.asset_code}`} value={invoice.asset_issuer} />
            )}

            {/* Expiry */}
            {invoice.expires_at && !isExpired && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <p className="font-mono text-[9px] text-muted-foreground">
                  Válido até {new Date(invoice.expires_at).toLocaleString("pt-BR", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
            )}

            {/* Treasury explorer link */}
            {invoice.treasury_explorer_url && (
              <a
                href={invoice.treasury_explorer_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[9px] text-primary hover:underline"
              >
                Ver treasury no Stellar Expert (mainnet) <ExternalLink className="h-3 w-3" />
              </a>
            )}

            <Separator />

            {/* Actions */}
            {isExpired ? (
              <Button className="w-full" size="sm" onClick={() => setInvoice(null)}>
                <RefreshCw className="mr-1.5 h-3 w-3" /> Gerar nova fatura
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button className="flex-1" size="sm" onClick={() => verify(false)} disabled={verifying}>
                  {verifying ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
                  Já paguei — verificar
                </Button>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Pagar depois
                </Button>
              </div>
            )}

            <p className="text-center font-mono text-[9px] text-muted-foreground/70">
              Verificamos automaticamente a cada 15s. Nenhuma chave secreta é solicitada.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
