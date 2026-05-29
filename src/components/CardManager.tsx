/**
 * CardManager — saved payment cards (max 5).
 *
 * SECURITY
 *   · The full card number (PAN) and CVV are forwarded once to the gateway for
 *     tokenisation and NEVER stored by EnergyPay — only an opaque token +
 *     masked metadata (brand / last4 / holder / expiry) live in our database.
 *   · Adding, deleting and changing the default card all require a fresh
 *     step-up identity re-confirmation (account password).
 *   · Deleting a card removes the only data the platform holds for it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CreditCard,
  Plus,
  Trash2,
  Star,
  Loader2,
  ShieldCheck,
  Lock,
  X,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StepUpModal } from "@/components/StepUpModal";
import {
  apiListCards,
  apiAddCard,
  apiDeleteCard,
  apiSetDefaultCard,
  type PaymentCard,
  type AddCardPayload,
} from "@/lib/api";

const BLANK_FORM: AddCardPayload = {
  holder_name: "",
  number: "",
  expiry_month: "",
  expiry_year: "",
  ccv: "",
  postal_code: "",
  address_number: "",
};

export function CardManager() {
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [max, setMax] = useState(5);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddCardPayload>(BLANK_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Step-up gate — a pending action runs once the password is re-confirmed.
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
      const res = await apiListCards();
      setCards(res.cards);
      setMax(res.max ?? 5);
    } catch (err) {
      toast.error((err as Error).message || "Falha ao carregar cartões.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const atLimit = cards.length >= max;

  // ── Add card (step-up gated) ──────────────────────────────────────────────
  const handleAdd = () => {
    if (!form.holder_name || !form.number || !form.expiry_month || !form.expiry_year || !form.ccv) {
      toast.error("Preencha todos os campos obrigatórios do cartão.");
      return;
    }
    requireStepUp(async (token) => {
      setSubmitting(true);
      try {
        await apiAddCard(form, token);
        toast.success("Cartão adicionado com segurança.");
        setForm(BLANK_FORM);
        setShowForm(false);
        await load();
      } catch (err) {
        toast.error((err as Error).message || "Não foi possível adicionar o cartão.");
      } finally {
        setSubmitting(false);
      }
    });
  };

  // ── Delete card (step-up gated) ───────────────────────────────────────────
  const handleDelete = (card: PaymentCard) => {
    const masked = `${card.brand ?? "cartão"} •••• ${card.last4 ?? "????"}`;
    if (!confirm(`Excluir o ${masked}? Todos os dados deste cartão serão removidos da plataforma.`)) return;
    requireStepUp(async (token) => {
      setBusyId(card.id);
      try {
        const res = await apiDeleteCard(card.id, token);
        toast.success(res.message || "Cartão removido.");
        await load();
      } catch (err) {
        toast.error((err as Error).message || "Não foi possível excluir o cartão.");
      } finally {
        setBusyId(null);
      }
    });
  };

  // ── Set default (step-up gated) ───────────────────────────────────────────
  const handleSetDefault = (card: PaymentCard) => {
    if (card.is_default) return;
    requireStepUp(async (token) => {
      setBusyId(card.id);
      try {
        await apiSetDefaultCard(card.id, token);
        toast.success("Cartão padrão atualizado.");
        await load();
      } catch (err) {
        toast.error((err as Error).message || "Não foi possível definir o cartão padrão.");
      } finally {
        setBusyId(null);
      }
    });
  };

  const setField = (k: keyof AddCardPayload, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Cartões salvos
          </p>
          <p className="text-[11px] text-muted-foreground">
            {cards.length} de {max} cartões · máximo de {max}
          </p>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)} disabled={atLimit}>
            <Plus className="mr-1.5 h-3 w-3" />
            Adicionar cartão
          </Button>
        )}
      </div>

      {atLimit && !showForm && (
        <p className="font-mono text-[10px] text-warning">
          Limite de {max} cartões atingido. Exclua um cartão para adicionar outro.
        </p>
      )}

      {/* Card list */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : cards.length === 0 && !showForm ? (
        <Card className="border-dashed border-border bg-card/40 p-8 text-center">
          <CreditCard className="mx-auto mb-3 h-6 w-6 text-muted-foreground/30" />
          <p className="font-mono text-[11px] text-muted-foreground">Nenhum cartão cadastrado.</p>
          <p className="mt-1 text-[10px] text-muted-foreground/60">
            Adicione um cartão para pagar suas assinaturas com mais agilidade.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => (
            <Card key={card.id} className="flex items-center justify-between border-border bg-card p-3.5">
              <div className="flex items-center gap-3">
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm font-semibold">
                      {(card.brand || "CARTÃO").toUpperCase()} •••• {card.last4 ?? "????"}
                    </p>
                    {card.is_default && (
                      <Badge variant="outline" className="border-primary/40 bg-primary/10 font-mono text-[8px] uppercase tracking-widest text-primary">
                        Padrão
                      </Badge>
                    )}
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {card.holder_name ?? "—"}
                    {card.exp_month && card.exp_year ? ` · ${card.exp_month}/${String(card.exp_year).slice(-2)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!card.is_default && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-muted-foreground hover:text-primary"
                    onClick={() => handleSetDefault(card)}
                    disabled={busyId === card.id}
                    title="Definir como padrão"
                  >
                    {busyId === card.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(card)}
                  disabled={busyId === card.id}
                  title="Excluir cartão"
                >
                  {busyId === card.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add-card form */}
      {showForm && (
        <Card className="border-primary/30 bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-foreground">
              <Lock className="h-3 w-3 text-primary" /> Novo cartão
            </p>
            <button
              onClick={() => { setShowForm(false); setForm(BLANK_FORM); }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cc-holder" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Nome impresso no cartão
              </Label>
              <Input
                id="cc-holder"
                value={form.holder_name}
                onChange={(e) => setField("holder_name", e.target.value)}
                placeholder="NOME COMPLETO"
                autoComplete="cc-name"
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-number" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Número do cartão
              </Label>
              <Input
                id="cc-number"
                value={form.number}
                onChange={(e) => setField("number", e.target.value.replace(/[^\d ]/g, ""))}
                placeholder="0000 0000 0000 0000"
                inputMode="numeric"
                autoComplete="cc-number"
                disabled={submitting}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cc-mm" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Mês</Label>
                <Input
                  id="cc-mm"
                  value={form.expiry_month}
                  onChange={(e) => setField("expiry_month", e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="MM"
                  inputMode="numeric"
                  autoComplete="cc-exp-month"
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc-yy" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ano</Label>
                <Input
                  id="cc-yy"
                  value={form.expiry_year}
                  onChange={(e) => setField("expiry_year", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="AAAA"
                  inputMode="numeric"
                  autoComplete="cc-exp-year"
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc-cvv" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">CVV</Label>
                <Input
                  id="cc-cvv"
                  type="password"
                  value={form.ccv}
                  onChange={(e) => setField("ccv", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="•••"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cc-cep" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">CEP</Label>
                <Input
                  id="cc-cep"
                  value={form.postal_code}
                  onChange={(e) => setField("postal_code", e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="00000000"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc-num" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Nº do endereço</Label>
                <Input
                  id="cc-num"
                  value={form.address_number}
                  onChange={(e) => setField("address_number", e.target.value)}
                  placeholder="123"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2.5">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <p className="font-mono text-[9px] leading-relaxed text-muted-foreground">
                O número e o CVV são tokenizados pelo gateway e <span className="text-foreground">nunca</span> são
                armazenados pela EnergyPay. Guardamos apenas a bandeira, os 4 últimos dígitos e a validade.
              </p>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" size="sm" onClick={handleAdd} disabled={submitting}>
                {submitting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Check className="mr-1.5 h-3 w-3" />}
                Salvar cartão com segurança
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setForm(BLANK_FORM); }} disabled={submitting}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Deletion guarantee */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-card/40 p-3">
        <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="font-mono text-[9px] leading-relaxed text-muted-foreground">
          Ao excluir um cartão, removemos definitivamente o token e os metadados associados — não resta
          nenhuma informação dele na plataforma. O número completo e o CVV nunca foram armazenados.
        </p>
      </div>

      <StepUpModal open={stepUpOpen} onOpenChange={setStepUpOpen} onConfirmed={onStepUpConfirmed} />
    </div>
  );
}
