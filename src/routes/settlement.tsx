import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Calculator, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOps } from "@/store/operations";
import { ExecutionConsole } from "@/components/ExecutionConsole";
import { StateMachine } from "@/components/StateMachine";
import { useMarketContext } from "@/hooks/useMarketContext";
import { API_BASE_URL } from "@/lib/api";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/settlement")({
  // This settlement engine is a PLD-scenario simulator backed by local mock data;
  // real settlement happens in the contract flow (register → approve → atomic
  // on-chain). Redirect to the contract registry to avoid an empty/confusing page.
  beforeLoad: () => {
    throw redirect({ to: "/contracts" });
  },
  head: () => ({
    meta: [
      { title: "Settlement Engine — EnergyPay" },
      {
        name: "description",
        content:
          "Operational settlement console for programmable electricity contracts on Stellar.",
      },
    ],
  }),
  component: SettlementPage,
});

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function SettlementPage() {
  const t = useT();
  const market = useMarketContext();
  const contracts = useOps((s) => s.contracts);
  const [contractId, setContractId] = useState(contracts[0]?.id ?? "");
  const contract = contracts.find((c) => c.id === contractId) ?? contracts[0];
  const [pld, setPld] = useState<number>(278);
  const [oraclePld, setOraclePld] = useState<number | null>(null);
  const [pldSynced, setPldSynced] = useState(false);
  const [open, setOpen] = useState(false);

  // Fetch real-time PLD from the ONS oracle on mount.
  // Uses SE/CO submercado as the primary reference (largest market in Brazil).
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/oracle/pld`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.success && Array.isArray(json.prices) && json.prices.length > 0) {
          const se: any =
            json.prices.find((p: any) => p.subsistema === "SE") ?? json.prices[0];
          setOraclePld(se.cmo_brl_mwh);
          setPld(se.cmo_brl_mwh);
          setPldSynced(true);
        }
      })
      .catch(() => {
        // Keep the fallback default value on network error.
      });
  }, []);

  const syncToOracle = () => {
    if (oraclePld !== null) {
      setPld(oraclePld);
      setPldSynced(true);
    }
  };

  const settlement = useMemo(() => contract ? (pld - contract.priceBRL) * contract.volumeMWh : 0, [pld, contract]);
  const direction = settlement >= 0 ? t("Buyer receives") : t("Seller receives");

  if (!contract) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {t("Settlement Engine")}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            {t("No contracts registered")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Register a bilateral contract first to use the settlement engine.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {t("Settlement Engine / Simulation & Execution")}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          {t("Settlement Console")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Simulate exposure under")} {market.referencePrice.label} ({market.referencePrice.fullName}) {t("scenarios then execute atomic settlement on the Stellar settlement rail.")}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
          {market.clearingHouse.name} · {market.currency} · {market.settlementCycle} {market.settlementWindow} · {market.marketType}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-border bg-card p-6 lg:col-span-2">
          <div className="mb-5 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <p className="font-display text-base font-semibold">{t("Scenario Inputs")}</p>
          </div>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {t("Contract")}
              </Label>
              <Select value={contractId} onValueChange={setContractId}>
                <SelectTrigger className="bg-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-mono">{c.id}</span> — {c.buyer} ↔ {c.seller}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ReadOnly
                label={t("Contracted Volume")}
                value={`${contract.volumeMWh.toLocaleString("pt-BR")} MWh`}
              />
              <ReadOnly label={t("Contract Price")} value={`${market.currencySymbol} ${contract.priceBRL.toFixed(2)}`} />
              <ReadOnly label={t("Settlement window")} value={contract.window} />
              <ReadOnly label={t("Current state")} value={contract.state} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {t("Simulated")} {market.referencePrice.label}
                </Label>
                <div className="flex items-center gap-2">
                  {oraclePld !== null && (
                    <button
                      onClick={syncToOracle}
                      className="flex items-center gap-1 rounded border border-border bg-background/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      title={`${t("Sync to current")} ${market.referencePrice.label} ${t("from")} ${market.referencePrice.source}`}
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                      {market.referencePrice.source} {market.currencySymbol} {oraclePld.toFixed(2)}
                    </button>
                  )}
                  <span className={`font-mono text-sm ${pldSynced ? "text-success" : ""}`}>
                    {market.currencySymbol} {pld.toFixed(2)} / {market.energyUnit}
                  </span>
                </div>
              </div>
              <Slider
                value={[pld]}
                min={0}
                max={900}
                step={0.5}
                onValueChange={(v) => { setPld(v[0]); setPldSynced(false); }}
              />
              <div className="flex items-center gap-2 pt-1">
                <Input
                  type="number"
                  step="0.01"
                  value={pld}
                  onChange={(e) => { setPld(Number(e.target.value)); setPldSynced(false); }}
                  className="w-32 bg-input font-mono"
                />
                <span className="text-xs text-muted-foreground">
                  {pldSynced
                    ? `← ${market.referencePrice.source} ${t("oracle · SE/CO")}`
                    : t("Manual override")}
                </span>
              </div>
            </div>

            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("Settlement state machine")}
              </p>
              <StateMachine current={contract.state} failed={contract.state === "FAILED"} />
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden border-border bg-card p-6">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {t("Net Financial Exposure")}
          </p>
          <p
            className={`mt-2 font-display text-3xl font-semibold tracking-tight ${settlement >= 0 ? "text-success" : "text-destructive"}`}
          >
            {settlement >= 0 ? "+" : ""}
            {fmtBRL(settlement)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{direction}</p>

          <div className="my-5 rounded-md border border-dashed border-border bg-background/40 p-3 font-mono text-[11px] text-muted-foreground">
            settlement = ({market.referencePrice.label} − {t("Price")}) × {t("Volume")}
            <br />= ({pld.toFixed(2)} − {contract.priceBRL.toFixed(2)}) × {contract.volumeMWh}
            <br />= <span className="text-foreground">{fmtBRL(settlement)}</span>
          </div>

          <div className="flex gap-2">
            <Button className="w-full" size="lg" onClick={() => setOpen(true)}>
              <Zap className="mr-2 h-4 w-4" />
              {t("Run Settlement")}
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="border-red-500/40 text-red-400 hover:bg-red-500/10"
              onClick={() => {
                localStorage.removeItem("energypay.ops.v1");
                window.location.reload();
              }}
            >
              {t("Reset")}
            </Button>
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="h-3 w-3" /> {t("Atomic settlement · counterparty net exposure")}
          </p>
        </Card>
      </div>

      <ExecutionConsole
        open={open}
        onOpenChange={setOpen}
        contract={contract}
        pld={pld}
        amount={settlement}
      />
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      <div className="flex h-9 items-center rounded-md border border-border bg-input px-3 font-mono text-sm">
        {value}
      </div>
    </div>
  );
}
