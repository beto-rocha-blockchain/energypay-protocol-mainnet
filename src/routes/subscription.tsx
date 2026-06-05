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
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/subscription")({
  head: () => ({
    meta: [
      { title: "Subscription — EnergyPay Settlement" },
      {
        name: "description",
        content:
          "Manage your EnergyPay subscription. Free, Operator and Enterprise plans paid via PIX, credit card or crypto.",
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
  ACTIVE:    { text: "Active",              className: "border-success/40 bg-success/10 text-success" },
  TRIALING:  { text: "Awaiting payment",    className: "border-warning/40 bg-warning/10 text-warning" },
  PAST_DUE:  { text: "Payment overdue",     className: "border-destructive/40 bg-destructive/10 text-destructive" },
  CANCELLED: { text: "Cancelled",           className: "border-muted/40 bg-muted/10 text-muted-foreground" },
  EXPIRED:   { text: "Expired",             className: "border-destructive/40 bg-destructive/10 text-destructive" },
};

type PaymentMethod = "PIX" | "CREDIT_CARD" | "CRYPTO";

// ── Page ───────────────────────────────────────────────────────────────────────

function SubscriptionPage() {
  const t = useT();
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
        toast.info(t("Payment link opened in a new tab."), {
          description: t("Once paid, your plan is activated automatically."),
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
        toast.error((err as Error).message || t("Failed to start checkout."));
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
      toast.error(t("Enter a valid CPF (11 digits) or CNPJ (14 digits)."));
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
    if (!confirm(t("Are you sure? Your plan stays active until the end of the current period."))) return;
    setCancelLoading(true);
    try {
      const res = await apiSubscriptionCancel();
      toast.success(res.message || t("Subscription cancelled."));
      await refreshSubscription();
    } catch (err) {
      toast.error((err as Error).message || t("Failed to cancel."));
    } finally {
      setCancelLoading(false);
    }
  };

  const handlePixPaid = async () => {
    await refreshSubscription();
    setPixModalOpen(false);
    setPixData(null);
    toast.success(t("Payment confirmed! Plan activated."));
  };

  const handleCryptoConfirmed = async () => {
    await refreshSubscription();
    setCryptoModalOpen(false);
    setCryptoPlan(null);
    toast.success(t("Crypto payment confirmed! Plan activated."));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      {/* Header */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("Platform · Subscription & Billing")}
        </p>
        <h1 className="font-display text-2xl font-semibold">{t("Subscription")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Manage your EnergyPay platform access plan.")}
        </p>
      </div>

      {/* Current plan card — always visible above the tabs */}
      <CurrentPlanCard onCancel={handleCancel} cancelLoading={cancelLoading} />

      <Tabs defaultValue="plan" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="plan" className="gap-1.5 py-2 font-mono text-[10px] uppercase tracking-widest">
            <Zap className="h-3 w-3" /> {t("Plan")}
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 py-2 font-mono text-[10px] uppercase tracking-widest">
            <Receipt className="h-3 w-3" /> {t("Invoices")}
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="gap-1.5 py-2 font-mono text-[10px] uppercase tracking-widest">
            <FileText className="h-3 w-3" /> {t("Receipts")}
          </TabsTrigger>
          <TabsTrigger value="cards" className="gap-1.5 py-2 font-mono text-[10px] uppercase tracking-widest">
            <CreditCard className="h-3 w-3" /> {t("Cards")}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Plano & Pagamento ───────────────────────────────── */}
        <TabsContent value="plan" className="space-y-8">
          {/* Payment method selector */}
          <div className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("Payment method")}
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
                  {m === "PIX" ? "PIX" : m === "CREDIT_CARD" ? t("Credit Card") : t("Crypto (XLM / USDC)")}
                </button>
              ))}
            </div>
            {paymentMethod === "PIX" && (
              <p className="font-mono text-[10px] text-success">
                {t("✓ PIX · approved within 1 minute · no extra fees")}
              </p>
            )}
            {paymentMethod === "CREDIT_CARD" && (
              <p className="font-mono text-[10px] text-muted-foreground">
                {t("Credit card · processed via Asaas (Bacen-certified)")}
              </p>
            )}
            {paymentMethod === "CRYPTO" && (
              <p className="font-mono text-[10px] text-muted-foreground">
                {t("Pay with XLM or USDC from any Stellar wallet. · On-chain verification on Stellar Mainnet.")}
              </p>
            )}
          </div>

          {/* Plan comparison cards */}
          <div className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("Available plans")}
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
                  {t("Security & compliance")}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("Card and PIX payments are processed by")} <strong className="text-foreground">Asaas</strong> — {t("a Brazilian fintech certified by the Central Bank of Brazil. Card data is tokenized by the gateway and never stored on EnergyPay servers. Crypto payments are verified on-chain on Stellar Mainnet, without exposing secret keys. Every paid charge generates a payment receipt — official NF-e/NFS-e issuance will be available once EnergyPay's tax profile and digital certificate are configured.")}
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
              {t("CPF or CNPJ")}
            </DialogTitle>
            <DialogDescription>
              {t("Asaas requires the holder's CPF or CNPJ to issue PIX or card charges. Enter it once — it's saved to your account.")}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); if (!loading) submitCpf(); }}
            className="space-y-3"
          >
            <Input
              value={cpfValue}
              onChange={(e) => setCpfValue(e.target.value.replace(/[^\d./-]/g, ""))}
              placeholder={t("000.000.000-00 or CNPJ")}
              inputMode="numeric"
              autoFocus
              disabled={loading}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCpfDialogOpen(false)} disabled={loading}>
                {t("Cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={loading || !cpfValue}>
                {loading && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                {t("Continue")}
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
  const t = useT();
  const operator = useOperator((s) => s.operator!);
  const s    = operator.subscription;
  const meta = SUBSCRIPTION_PLAN_META[s.plan];
  const Icon = PLAN_ICONS[s.plan];

  const statusInfo = STATUS_LABEL[s.status] ?? { text: s.status, className: "border-border text-muted-foreground" };

  const usedPct = s.settlementsLimit
    ? Math.min(100, Math.round(((s.settlementsUsed ?? 0) / s.settlementsLimit) * 100))
    : 0;

  const periodEndLabel = s.currentPeriodEnd
    ? new Date(s.currentPeriodEnd).toLocaleDateString("en-US", {
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
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("Current plan")}</p>
            <p className={`font-display text-xl font-semibold ${meta.textColor}`}>{meta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`font-mono text-[9px] uppercase tracking-widest ${statusInfo.className}`}>
            {t(statusInfo.text)}
          </Badge>
          {s.plan !== "FREE" && !s.cancelAtPeriodEnd && (
            <button
              onClick={onCancel}
              disabled={cancelLoading}
              className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60 hover:text-destructive disabled:opacity-50"
            >
              {cancelLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : t("Cancel plan")}
            </button>
          )}
          {s.cancelAtPeriodEnd && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-warning">
              {t("Cancellation scheduled")}
            </span>
          )}
        </div>
      </div>

      <Separator className="my-4" />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{t("Annual fee")}</p>
          <p className="mt-0.5 font-mono text-xl font-semibold">
            {meta.priceBrl === 0
              ? t("Free")
              : `US$ ${meta.priceBrl.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            {meta.priceBrl > 0 && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{t("/year")}</span>}
          </p>
        </div>

        {s.plan === "FREE" && s.settlementsLimit ? (
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {t("Settlements this month")}
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
              {s.cancelAtPeriodEnd ? t("Access until") : t("Next renewal")}
            </p>
            <p className="mt-0.5 font-mono text-sm font-semibold">
              {periodEndLabel ?? "—"}
            </p>
          </div>
        )}

        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {t("Settlements")}
          </p>
          <p className="mt-0.5 font-mono text-xl font-semibold">
            {meta.settlementsLimit === null
              ? <span className="text-2xl">∞</span>
              : meta.settlementsLimit}
            {meta.settlementsLimit === null && (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">{t("unlimited")}</span>
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
  const t = useT();
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
            {t("Current")}
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
          <p className="font-display text-2xl font-bold">{t("Free")}</p>
        ) : (
          <p className="font-display text-2xl font-bold">
            US$ {meta.priceBrl.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            <span className="ml-1 text-sm font-normal text-muted-foreground">{t("/year")}</span>
          </p>
        )}
        {plan !== "FREE" && (
          <p className={`mt-0.5 font-mono text-[9px] ${paymentMethod === "PIX" ? "text-success" : "text-muted-foreground"}`}>
            {paymentMethod === "PIX"
              ? t("via PIX · instant approval")
              : paymentMethod === "CREDIT_CARD"
                ? t("via credit card")
                : t("via XLM or USDC · Stellar")}
          </p>
        )}
      </div>

      <ul className="mb-5 flex-1 space-y-1.5">
        {meta.features.map((f) => (
          <li key={f} className="flex items-start gap-1.5">
            <CheckCircle2 className={`mt-0.5 h-3 w-3 shrink-0 ${meta.textColor}`} />
            <span className="text-[11px] text-muted-foreground">{t(f)}</span>
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
          {isCurrent ? t("Current plan") : t("Downgrade")}
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
            t("Current plan")
          ) : plan === "ENTERPRISE" ? (
            t("Subscribe to Enterprise →")
          ) : (
            t("Upgrade →")
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
  const t = useT();
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
        toast.info(t("Payment not confirmed yet. Try again shortly."));
      }
    } catch {
      toast.error(t("Error checking payment."));
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
            {t("PIX Payment")}
          </DialogTitle>
          <DialogDescription>
            {t("Scan the QR code or copy the code below to pay. Your plan activates within 1 minute of confirmation.")}
          </DialogDescription>
        </DialogHeader>

        {confirmed ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCheck className="h-12 w-12 text-success" />
            <p className="font-mono text-sm font-semibold text-success">{t("Payment confirmed!")}</p>
            <p className="text-[11px] text-muted-foreground">{t("Activating your plan…")}</p>
          </div>
        ) : data.pix_pending ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{data.message}</p>
            <Button size="sm" variant="outline" onClick={onClose}>{t("Close")}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* QR Code image */}
            {data.pix_qr_code && (
              <div className="flex justify-center">
                <div className="rounded-md border border-border bg-white p-3">
                  <img
                    src={`data:image/png;base64,${data.pix_qr_code}`}
                    alt={t("PIX QR Code")}
                    className="h-48 w-48"
                  />
                </div>
              </div>
            )}

            {/* Copia e cola */}
            {data.pix_qr_code_text && (
              <div>
                <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {t("PIX Copy & Paste")}
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
                {t("Valid until")} {new Date(data.pix_expires_at).toLocaleDateString("en-US", {
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
                {t("Check Payment")}
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>
                {t("Pay later")}
              </Button>
            </div>

            {pollCount > 0 && !confirmed && (
              <p className="text-center font-mono text-[9px] text-muted-foreground">
                {t("Payment not detected yet. Check your bank app and try again.")}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
