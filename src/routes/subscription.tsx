import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  Zap,
  Crown,
  CreditCard,
  QrCode,
  Shield,
  Loader2,
  RefreshCw,
  Copy,
  ExternalLink,
  CheckCheck,
  Coins,
  FileText,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

import {
  useOperator,
  SUBSCRIPTION_PLAN_META,
  type SubscriptionPlan,
  type OperatorSubscription,
} from "@/store/operator";
import {
  apiSubscriptionCheckout,
  apiSubscriptionCancel,
  apiSubscriptionMe,
  apiSubscriptionPaymentStatus,
  type SubscriptionCheckoutPixResponse,
} from "@/lib/api";
import { CryptoPaymentModal } from "@/components/CryptoPaymentModal";
import { CardManager } from "@/components/CardManager";
import { PaidInvoicesTab } from "@/components/PaidInvoicesTab";
import { FiscalDocumentsTab } from "@/components/FiscalDocumentsTab";

export const Route = createFileRoute("/subscription")({
  head: () => ({
    meta: [
      { title: "Assinatura — EnergyPay Settlement" },
      {
        name: "description",
        content:
          "Gerencie sua assinatura EnergyPay. Planos Free, Operator e Enterprise com pagamento via PIX ou cartão de crédito.",
      },
    ],
  }),
  component: SubscriptionPage,
});

// ── Constants ──────────────────────────────────────────────────────────────────

const PLAN_ICONS: Record<SubscriptionPlan, React.ComponentType<{ className?: string }>> = {
  FREE:       CreditCard,
  OPERATOR:   Zap,
  ENTERPRISE: Crown,
};

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  ACTIVE:    { text: "Ativo",              className: "border-success/40 bg-success/10 text-success" },
  TRIALING:  { text: "Aguardando pgto.",   className: "border-warning/40 bg-warning/10 text-warning" },
  PAST_DUE:  { text: "Pgto. Atrasado",    className: "border-destructive/40 bg-destructive/10 text-destructive" },
  CANCELLED: { text: "Cancelado",         className: "border-muted/40 bg-muted/10 text-muted-foreground" },
  EXPIRED:   { text: "Expirado",          className: "border-destructive/40 bg-destructive/10 text-destructive" },
};

type PaymentMethod = "PIX" | "CREDIT_CARD" | "CRYPTO";

// ── Page ───────────────────────────────────────────────────────────────────────

function SubscriptionPage() {
  const isAuthenticated  = useOperator((s) => s.isAuthenticated);
  const operator         = useOperator((s) => s.operator);
  const setSubscription  = useOperator((s) => s.setSubscription);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [loading, setLoading]             = useState(false);
  const [checkoutingPlan, setCheckoutingPlan] = useState<SubscriptionPlan | null>(null);

  // PIX payment modal
  const [pixData, setPixData]     = useState<SubscriptionCheckoutPixResponse | null>(null);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Crypto payment modal (isolated external-transfer billing flow)
  const [cryptoModalOpen, setCryptoModalOpen] = useState(false);
  const [cryptoPlan, setCryptoPlan] = useState<"operator" | "enterprise" | null>(null);

  // CPF/CNPJ capture — Asaas requires it on the customer for PIX/card charges.
  const [cpfDialogOpen, setCpfDialogOpen] = useState(false);
  const [cpfPlan, setCpfPlan] = useState<SubscriptionPlan | null>(null);
  const [cpfValue, setCpfValue] = useState("");

  if (!isAuthenticated || !operator) return <Navigate to="/login" />;

  const sub = operator.subscription;

  // Refresh subscription from backend
  const refreshSubscription = useCallback(async () => {
    try {
      const res = await apiSubscriptionMe();
      if (res.subscription) {
        setSubscription({
          plan: res.subscription.plan as SubscriptionPlan,
          status: res.subscription.status as OperatorSubscription["status"],
          currentPeriodEnd: res.subscription.current_period_end ?? undefined,
          cancelAtPeriodEnd: !!res.subscription.cancel_at_period_end,
          settlementsUsed: res.subscription.settlements_used,
          settlementsLimit: res.subscription.settlements_limit,
        });
      }
    } catch {/* silent */}
  }, [setSubscription]);

  // Fiat checkout (PIX / card). Returns false if it needs a CPF/CNPJ (so the
  // caller can prompt and retry), true on success.
  const runFiatCheckout = async (plan: SubscriptionPlan, cpfCnpj?: string) => {
    setCheckoutingPlan(plan);
    setLoading(true);
    try {
      const res = await apiSubscriptionCheckout(
        plan.toLowerCase() as "operator" | "enterprise",
        paymentMethod === "PIX" ? "pix" : "credit_card",
        cpfCnpj,
      );

      if (res.payment_method === "pix") {
        setPixData(res);
        setPixModalOpen(true);
      } else if (res.payment_method === "credit_card" && res.payment_url) {
        window.open(res.payment_url, "_blank", "noopener,noreferrer");
        toast.info("Link de pagamento aberto em nova aba.", {
          description: "Após o pagamento, seu plano será ativado automaticamente.",
        });
      }
      return true;
    } catch (err) {
      const code =
        (err as { payload?: { error?: string } }).payload?.error ?? (err as Error).message;
      if (code === "CPF_CNPJ_REQUIRED") {
        setCpfPlan(plan);
        setCpfDialogOpen(true);
      } else {
        toast.error((err as Error).message || "Erro ao iniciar checkout.");
      }
      return false;
    } finally {
      setLoading(false);
      setCheckoutingPlan(null);
    }
  };

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (plan === "FREE" || sub.plan === plan) return;

    // Crypto is an isolated external-transfer flow — open the dedicated modal.
    if (paymentMethod === "CRYPTO") {
      setCryptoPlan(plan.toLowerCase() as "operator" | "enterprise");
      setCryptoModalOpen(true);
      return;
    }

    await runFiatCheckout(plan);
  };

  // Submit the CPF/CNPJ collected in the dialog, then retry the fiat checkout.
  const submitCpf = async () => {
    const digits = cpfValue.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) {
      toast.error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.");
      return;
    }
    if (!cpfPlan) return;
    setCpfDialogOpen(false);
    const ok = await runFiatCheckout(cpfPlan, digits);
    if (ok) {
      setCpfValue("");
      setCpfPlan(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Tem certeza? Seu plano continuará ativo até o fim do período atual.")) return;
    setCancelLoading(true);
    try {
      const res = await apiSubscriptionCancel();
      toast.success(res.message || "Assinatura cancelada.");
      await refreshSubscription();
    } catch (err) {
      toast.error((err as Error).message || "Erro ao cancelar.");
    } finally {
      setCancelLoading(false);
    }
  };

  const handlePixPaid = async () => {
    await refreshSubscription();
    setPixModalOpen(false);
    setPixData(null);
    toast.success("Pagamento confirmado! Plano ativado.");
  };

  const handleCryptoConfirmed = async () => {
    await refreshSubscription();
    setCryptoModalOpen(false);
    setCryptoPlan(null);
    toast.success("Pagamento em cripto confirmado! Plano ativado.");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      {/* Header */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Plataforma · Assinatura &amp; Cobrança
        </p>
        <h1 className="font-display text-2xl font-semibold">Assinatura</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie seu plano de acesso à plataforma EnergyPay.
        </p>
      </div>

      {/* Current plan card — always visible above the tabs */}
      <CurrentPlanCard onCancel={handleCancel} cancelLoading={cancelLoading} />

      <Tabs defaultValue="plan" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="plan" className="gap-1.5 font-mono text-[10px] uppercase tracking-widest">
            <Zap className="h-3 w-3" /> Plano
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 font-mono text-[10px] uppercase tracking-widest">
            <Receipt className="h-3 w-3" /> Faturas
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="gap-1.5 font-mono text-[10px] uppercase tracking-widest">
            <FileText className="h-3 w-3" /> Notas Fiscais
          </TabsTrigger>
          <TabsTrigger value="cards" className="gap-1.5 font-mono text-[10px] uppercase tracking-widest">
            <CreditCard className="h-3 w-3" /> Cartões
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Plano & Pagamento ───────────────────────────────── */}
        <TabsContent value="plan" className="space-y-8">
          {/* Payment method selector */}
          <div className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Método de pagamento
            </p>
            <div className="flex flex-wrap gap-3">
              {(["PIX", "CREDIT_CARD", "CRYPTO"] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`flex items-center gap-2 rounded-md border px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                    paymentMethod === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {m === "PIX" ? (
                    <QrCode className="h-3.5 w-3.5" />
                  ) : m === "CREDIT_CARD" ? (
                    <CreditCard className="h-3.5 w-3.5" />
                  ) : (
                    <Coins className="h-3.5 w-3.5" />
                  )}
                  {m === "PIX" ? "PIX" : m === "CREDIT_CARD" ? "Cartão de Crédito" : "Cripto (XLM / USDC)"}
                </button>
              ))}
            </div>
            {paymentMethod === "PIX" && (
              <p className="font-mono text-[10px] text-success">
                ✓ PIX · aprovação em até 1 minuto · sem taxas adicionais
              </p>
            )}
            {paymentMethod === "CREDIT_CARD" && (
              <p className="font-mono text-[10px] text-muted-foreground">
                Cartão de crédito · processado via Asaas (certificado Bacen)
              </p>
            )}
            {paymentMethod === "CRYPTO" && (
              <p className="font-mono text-[10px] text-muted-foreground">
                Pay with XLM or USDC from any Stellar wallet. · Verificação on-chain na Stellar Mainnet.
              </p>
            )}
          </div>

          {/* Plan comparison cards */}
          <div className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Planos disponíveis
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {(["FREE", "OPERATOR", "ENTERPRISE"] as SubscriptionPlan[]).map((plan) => (
                <PlanCard
                  key={plan}
                  plan={plan}
                  isCurrent={sub.plan === plan}
                  paymentMethod={paymentMethod}
                  loading={loading && checkoutingPlan === plan}
                  onSelect={() => handleSubscribe(plan)}
                />
              ))}
            </div>
          </div>

          {/* Security note */}
          <Card className="border-border bg-card/50 p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Segurança &amp; conformidade
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Pagamentos em cartão e PIX processados por <strong className="text-foreground">Asaas</strong> —
                  fintech brasileira certificada pelo Banco Central do Brasil. Dados de cartão são tokenizados
                  pelo gateway e nunca são armazenados pelos servidores EnergyPay. Pagamentos em cripto são
                  verificados on-chain na Stellar Mainnet, sem expor chaves secretas. Cada cobrança paga gera um
                  recibo de pagamento — a emissão oficial de NF-e/NFS-e estará disponível após a configuração do
                  perfil fiscal da EnergyPay e do certificado digital.
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ── Tab: Faturas Pagas ───────────────────────────────────── */}
        <TabsContent value="invoices">
          <PaidInvoicesTab />
        </TabsContent>

        {/* ── Tab: Notas Fiscais ───────────────────────────────────── */}
        <TabsContent value="fiscal">
          <FiscalDocumentsTab />
        </TabsContent>

        {/* ── Tab: Cartões ─────────────────────────────────────────── */}
        <TabsContent value="cards">
          <CardManager />
        </TabsContent>
      </Tabs>

      {/* PIX QR code modal */}
      <PixPaymentModal
        open={pixModalOpen}
        data={pixData}
        onClose={() => setPixModalOpen(false)}
        onConfirmed={handlePixPaid}
      />

      {/* Crypto payment modal (isolated external-transfer billing flow) */}
      <CryptoPaymentModal
        open={cryptoModalOpen}
        plan={cryptoPlan}
        planLabel={cryptoPlan ? SUBSCRIPTION_PLAN_META[cryptoPlan.toUpperCase() as SubscriptionPlan].label : ""}
        onClose={() => setCryptoModalOpen(false)}
        onConfirmed={handleCryptoConfirmed}
      />

      {/* CPF/CNPJ capture — required by Asaas to issue PIX/card charges */}
      <Dialog open={cpfDialogOpen} onOpenChange={(v) => { if (!v) setCpfDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              CPF ou CNPJ
            </DialogTitle>
            <DialogDescription>
              O Asaas exige um CPF ou CNPJ do titular para emitir cobranças via PIX ou cartão.
              Informe uma vez — fica salvo na sua conta.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); if (!loading) submitCpf(); }}
            className="space-y-3"
          >
            <Input
              value={cpfValue}
              onChange={(e) => setCpfValue(e.target.value.replace(/[^\d./-]/g, ""))}
              placeholder="000.000.000-00 ou CNPJ"
              inputMode="numeric"
              autoFocus
              disabled={loading}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCpfDialogOpen(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={loading || !cpfValue}>
                {loading && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                Continuar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Current plan card ─────────────────────────────────────────────────────────

function CurrentPlanCard({
  onCancel,
  cancelLoading,
}: {
  onCancel: () => void;
  cancelLoading: boolean;
}) {
  const operator = useOperator((s) => s.operator!);
  const s    = operator.subscription;
  const meta = SUBSCRIPTION_PLAN_META[s.plan];
  const Icon = PLAN_ICONS[s.plan];

  const statusInfo = STATUS_LABEL[s.status] ?? { text: s.status, className: "border-border text-muted-foreground" };

  const usedPct = s.settlementsLimit
    ? Math.min(100, Math.round(((s.settlementsUsed ?? 0) / s.settlementsLimit) * 100))
    : 0;

  const periodEndLabel = s.currentPeriodEnd
    ? new Date(s.currentPeriodEnd).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "long", year: "numeric",
      })
    : null;

  return (
    <Card className={`border ${meta.borderColor} ${meta.bgColor} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-md border ${meta.borderColor} p-2.5`}>
            <Icon className={`h-5 w-5 ${meta.textColor}`} />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Plano atual</p>
            <p className={`font-display text-xl font-semibold ${meta.textColor}`}>{meta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`font-mono text-[9px] uppercase tracking-widest ${statusInfo.className}`}>
            {statusInfo.text}
          </Badge>
          {s.plan !== "FREE" && !s.cancelAtPeriodEnd && (
            <button
              onClick={onCancel}
              disabled={cancelLoading}
              className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60 hover:text-destructive disabled:opacity-50"
            >
              {cancelLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancelar plano"}
            </button>
          )}
          {s.cancelAtPeriodEnd && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-warning">
              Cancelamento agendado
            </span>
          )}
        </div>
      </div>

      <Separator className="my-4" />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Mensalidade</p>
          <p className="mt-0.5 font-mono text-xl font-semibold">
            {meta.priceBrl === 0
              ? "Grátis"
              : `R$ ${meta.priceBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            {meta.priceBrl > 0 && <span className="ml-1 text-[10px] font-normal text-muted-foreground">/mês</span>}
          </p>
        </div>

        {s.plan === "FREE" && s.settlementsLimit ? (
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Liquidações este mês
            </p>
            <p className="mt-0.5 font-mono text-xl font-semibold">
              {s.settlementsUsed ?? 0}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">/ {s.settlementsLimit}</span>
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sidebar-border">
              <div
                className={`h-full rounded-full ${usedPct >= 80 ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        ) : (
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {s.cancelAtPeriodEnd ? "Acesso até" : "Próxima renovação"}
            </p>
            <p className="mt-0.5 font-mono text-sm font-semibold">
              {periodEndLabel ?? "—"}
            </p>
          </div>
        )}

        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Liquidações
          </p>
          <p className="mt-0.5 font-mono text-xl font-semibold">
            {meta.settlementsLimit === null
              ? <span className="text-2xl">∞</span>
              : meta.settlementsLimit}
            {meta.settlementsLimit === null && (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">ilimitadas</span>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}

// ── Plan card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrent,
  paymentMethod,
  loading,
  onSelect,
}: {
  plan: SubscriptionPlan;
  isCurrent: boolean;
  paymentMethod: PaymentMethod;
  loading: boolean;
  onSelect: () => void;
}) {
  const meta = SUBSCRIPTION_PLAN_META[plan];
  const Icon = PLAN_ICONS[plan];

  return (
    <Card
      className={`relative flex flex-col border p-5 transition-all ${
        isCurrent
          ? `${meta.borderColor} ${meta.bgColor}`
          : "border-border bg-card hover:border-primary/20"
      }`}
    >
      {isCurrent && (
        <div className="absolute right-3 top-3">
          <Badge variant="outline" className={`font-mono text-[8px] uppercase tracking-widest ${meta.borderColor} ${meta.textColor}`}>
            Atual
          </Badge>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${meta.textColor}`} />
        <span className={`font-mono text-[11px] font-semibold uppercase tracking-widest ${meta.textColor}`}>
          {meta.label}
        </span>
      </div>

      <div className="mb-4">
        {plan === "FREE" ? (
          <p className="font-display text-2xl font-bold">Grátis</p>
        ) : (
          <p className="font-display text-2xl font-bold">
            R$ {meta.priceBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/mês</span>
          </p>
        )}
        {plan !== "FREE" && (
          <p className={`mt-0.5 font-mono text-[9px] ${paymentMethod === "PIX" ? "text-success" : "text-muted-foreground"}`}>
            {paymentMethod === "PIX"
              ? "via PIX · aprovação instantânea"
              : paymentMethod === "CREDIT_CARD"
                ? "via cartão de crédito"
                : "via XLM ou USDC · Stellar"}
          </p>
        )}
      </div>

      <ul className="mb-5 flex-1 space-y-1.5">
        {meta.features.map((f) => (
          <li key={f} className="flex items-start gap-1.5">
            <CheckCircle2 className={`mt-0.5 h-3 w-3 shrink-0 ${meta.textColor}`} />
            <span className="text-[11px] text-muted-foreground">{f}</span>
          </li>
        ))}
      </ul>

      {plan === "FREE" ? (
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full font-mono text-[10px] uppercase tracking-widest"
          disabled
        >
          {isCurrent ? "Plano atual" : "Downgrade"}
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={isCurrent || loading}
          onClick={onSelect}
          className={`h-8 w-full font-mono text-[10px] uppercase tracking-widest ${
            plan === "ENTERPRISE"
              ? "bg-violet-500 text-white hover:bg-violet-600"
              : ""
          }`}
        >
          {loading ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : isCurrent ? (
            "Plano atual"
          ) : plan === "ENTERPRISE" ? (
            "Assinar Enterprise →"
          ) : (
            "Fazer Upgrade →"
          )}
        </Button>
      )}
    </Card>
  );
}

// ── PIX Payment Modal ─────────────────────────────────────────────────────────

function PixPaymentModal({
  open,
  data,
  onClose,
  onConfirmed,
}: {
  open: boolean;
  data: SubscriptionCheckoutPixResponse | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [copied, setCopied]         = useState(false);
  const [polling, setPolling]       = useState(false);
  const [pollCount, setPollCount]   = useState(0);
  const [confirmed, setConfirmed]   = useState(false);

  const handleCopy = () => {
    if (!data?.pix_qr_code_text) return;
    navigator.clipboard.writeText(data.pix_qr_code_text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const checkPayment = useCallback(async () => {
    if (!data?.payment_id) return;
    setPolling(true);
    try {
      const res = await apiSubscriptionPaymentStatus(data.payment_id);
      if (res.confirmed) {
        setConfirmed(true);
        setTimeout(onConfirmed, 1500);
      } else {
        setPollCount((c) => c + 1);
        toast.info("Pagamento ainda não confirmado. Tente novamente em instantes.");
      }
    } catch {
      toast.error("Erro ao verificar pagamento.");
    } finally {
      setPolling(false);
    }
  }, [data?.payment_id, onConfirmed]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) { setConfirmed(false); setPollCount(0); }
  }, [open]);

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            Pagamento via PIX
          </DialogTitle>
          <DialogDescription>
            Escaneie o QR Code ou copie o código abaixo para pagar.
            O plano é ativado em até 1 minuto após a confirmação.
          </DialogDescription>
        </DialogHeader>

        {confirmed ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCheck className="h-12 w-12 text-success" />
            <p className="font-mono text-sm font-semibold text-success">Pagamento confirmado!</p>
            <p className="text-[11px] text-muted-foreground">Ativando seu plano…</p>
          </div>
        ) : data.pix_pending ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{data.message}</p>
            <Button size="sm" variant="outline" onClick={onClose}>Fechar</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* QR Code image */}
            {data.pix_qr_code && (
              <div className="flex justify-center">
                <div className="rounded-md border border-border bg-white p-3">
                  <img
                    src={`data:image/png;base64,${data.pix_qr_code}`}
                    alt="PIX QR Code"
                    className="h-48 w-48"
                  />
                </div>
              </div>
            )}

            {/* Copia e cola */}
            {data.pix_qr_code_text && (
              <div>
                <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  Pix Copia e Cola
                </p>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-muted/20 px-3 py-2">
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {data.pix_qr_code_text}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-auto shrink-0 px-3"
                    onClick={handleCopy}
                  >
                    {copied ? <CheckCheck className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}

            {/* Expiry */}
            {data.pix_expires_at && (
              <p className="font-mono text-[9px] text-muted-foreground">
                Válido até {new Date(data.pix_expires_at).toLocaleDateString("pt-BR", {
                  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                size="sm"
                onClick={checkPayment}
                disabled={polling}
              >
                {polling
                  ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  : <RefreshCw className="mr-1.5 h-3 w-3" />}
                Verificar Pagamento
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>
                Pagar depois
              </Button>
            </div>

            {pollCount > 0 && !confirmed && (
              <p className="text-center font-mono text-[9px] text-muted-foreground">
                Pagamento ainda não detectado. Verifique seu app do banco e tente novamente.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
