import { createFileRoute, Link } from "@tanstack/react-router";
import { OperatorTag } from "@/components/OperatorTag";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";
import { stellarExpertTx, STELLAR_NETWORK_LABEL } from "@/lib/stellar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  computeExposure,
  contractStartDate,
  contractEndDate,
  contractDurationDays,
  contractPeriodStatus,
  type Contract,
  type ContractStatus,
  type ContractPeriodStatus,
} from "@/lib/mock-data";
import { StateMachine } from "@/components/StateMachine";
import {
  apiListContracts,
  apiGetContract,
  apiActivateContract,
  apiRequestSettlement,
  apiExecuteContractSettlement,
  apiPrepareSettlement,
  apiSubmitSignedSettlement,
  apiGetMovements,
  apiReconcileContract,
  apiGetContractDocumentUrl,
  type DbContract,
  type ContractMovement,
  type ContractReconciliation,
} from "@/lib/api";
import { TransactionSigningModal } from "@/components/TransactionSigningModal";
import { toast } from "sonner";
import { useOperator } from "@/store/operator";
import { useT } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";

export const Route = createFileRoute("/contracts/")({
  head: () => ({
    meta: [
      { title: "Contract Registry — EnergyPay" },
      {
        name: "description",
        content: "Bilateral PPAs registered for programmable settlement and reconciliation.",
      },
    ],
  }),
  component: ContractsList,
});

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// ── Helpers: convert DbContract to legacy Contract shape for table rendering ──
function dbToContract(c: DbContract): Contract {
  const buyer = c.buyer_label || (c.buyer_public_key ? `${c.buyer_public_key.slice(0, 8)}…` : "—");
  const seller =
    c.seller_label ||
    (c.seller_public_key ? `${c.seller_public_key.slice(0, 8)}…` : "Distribution");
  const statusMap: Record<string, Contract["status"]> = {
    DRAFT: "PENDING",
    ACTIVE: "ACTIVE",
    PENDING: "PENDING",
    SETTLED: "SETTLED",
    FAILED: "FAILED",
  };
  return {
    id: c.id,
    buyer,
    seller,
    buyerIsOperator: c.buyer_is_operator,
    sellerIsOperator: c.seller_is_operator,
    volumeMWh: Number(c.volume_mwh),
    priceBRL: Number(c.price_brl),
    pldBRL: Number(c.pld_brl ?? c.price_brl),
    settlementDate: c.settlement_date || c.end_date || "",
    startDate: c.start_date ?? undefined,
    endDate: c.end_date ?? undefined,
    status: statusMap[c.status] ?? "PENDING",
    txHash: c.tx_hash ?? "0".repeat(64),
    state: (c.state as Contract["state"]) ?? "CREATED",
    ledger: c.ledger ?? 0,
    latencyMs: c.finality_ms ?? 0,
    window: c.settlement_window ?? "D+1 17:00 BRT",
  };
}

type SortKey =
  | "id"
  | "volumeMWh"
  | "priceBRL"
  | "pldBRL"
  | "exposure"
  | "settlementDate"
  | "startDate"
  | "endDate";

type StatusFilter = "ALL" | ContractStatus;

const CONTRACT_SORT_ACCESSORS: Record<SortKey, (contract: Contract) => number | string> = {
  id: (contract) => contract.id,
  volumeMWh: (contract) => contract.volumeMWh,
  priceBRL: (contract) => contract.priceBRL,
  pldBRL: (contract) => contract.pldBRL,
  exposure: computeExposure,
  settlementDate: (contract) => contract.settlementDate,
  startDate: contractStartDate,
  endDate: contractEndDate,
};

const isStatusFilter = (value: string): value is StatusFilter =>
  value === "ALL" ||
  value === "ACTIVE" ||
  value === "PENDING" ||
  value === "SETTLED" ||
  value === "FAILED";

function StatusBadge({ status }: { status: ContractStatus }) {
  const map: Record<ContractStatus, string> = {
    ACTIVE: "border-success/40 bg-success/10 text-success",
    PENDING: "border-warning/40 bg-warning/10 text-warning",
    SETTLED: "border-accent/40 bg-accent/10 text-accent",
    FAILED: "border-destructive/40 bg-destructive/10 text-destructive",
  };
  return (
    <Badge variant="outline" className={`${map[status]} font-mono text-[10px]`}>
      ● {status}
    </Badge>
  );
}

function PeriodBadge({ status }: { status: ContractPeriodStatus }) {
  const map: Record<ContractPeriodStatus, string> = {
    UPCOMING: "border-warning/40 bg-warning/10 text-warning",
    ACTIVE: "border-success/40 bg-success/10 text-success",
    EXPIRED: "border-muted/40 bg-muted/10 text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={`${map[status]} font-mono text-[10px]`}>
      ● {status}
    </Badge>
  );
}

// ── hook: load DB contracts ──
function useDbContracts() {
  const [dbContracts, setDbContracts] = useState<DbContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListContracts();
      setDbContracts(res.contracts ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { dbContracts, loading, error, reload: load };
}

// ── Lifecycle action panel in the detail dialog ──
function LifecycleActions({
  dbContract,
  onRefresh,
}: {
  dbContract: DbContract | null;
  onRefresh: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [movements, setMovements] = useState<ContractMovement[]>([]);
  const [reconciliation, setReconciliation] = useState<ContractReconciliation | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  // USER_CONTROLLED signing modal
  const [signingModalOpen, setSigningModalOpen] = useState(false);
  const [pendingUnsignedXdr, setPendingUnsignedXdr] = useState("");
  const [pendingSettlementId, setPendingSettlementId] = useState("");

  // ── Role guards ─────────────────────────────────────────────────────────────
  const operator = useOperator((s) => s.operator);
  const _roles = (operator?.roles ?? []).map((r) => String(r).toUpperCase());

  // Active market participants can drive lifecycle transitions
  const isParticipant = _roles.some((r) =>
    ["GENERATOR", "SELLER", "USER", "UTILITY"].includes(r),
  );
  // Only these roles may execute the on-chain settlement call
  const canExecuteSettlementByRole = _roles.some((r) =>
    ["GENERATOR", "SELLER", "UTILITY"].includes(r),
  );
  // SELLER + INVESTOR can see AND run reconciliation; REGULATORY_AUTHORITY can monitor
  const canSeeReconciliation = _roles.some((r) =>
    ["SELLER", "INVESTOR", "REGULATORY_AUTHORITY"].includes(r),
  );
  const canRunReconciliation = _roles.some((r) =>
    ["SELLER", "INVESTOR"].includes(r),
  );

  useEffect(() => {
    if (!dbContract?.id) return;
    apiGetMovements(dbContract.id)
      .then((r) => setMovements(r.movements ?? []))
      .catch(() => {});
  }, [dbContract?.id]);

  const runReconcile = async () => {
    if (!dbContract?.id) return;
    setReconLoading(true);
    try {
      const res = await apiReconcileContract(dbContract.id);
      setReconciliation(res.reconciliation);
    } catch (err) {
      toast.error(t("Reconciliation failed"), { description: (err as Error).message });
    } finally {
      setReconLoading(false);
    }
  };

  if (!dbContract) return null;

  const { status, state } = dbContract;

  const canActivate          = status === "DRAFT"   && isParticipant;
  const canRequestSettlement = status === "ACTIVE"  && isParticipant;
  const canExecute           = status === "PENDING" && canExecuteSettlementByRole;
  const isSettled = status === "SETTLED";
  const isFailed = status === "FAILED";

  const activate = async () => {
    setBusy(true);
    try {
      await apiActivateContract(dbContract.id);
      toast.success(t("Contract activated"), { description: t("Status: ACTIVE · State: VALIDATED") });
      onRefresh();
    } catch (err) {
      toast.error(t("Activation failed"), { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const requestSettlement = async () => {
    setBusy(true);
    try {
      const res = await apiRequestSettlement(dbContract.id);
      toast.success(t("Settlement requested"), {
        description: `${t("Instruction created")} · ${res.idempotency_key}`,
      });
      onRefresh();
    } catch (err) {
      toast.error(t("Settlement request failed"), { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const executeSettlement = async () => {
    if (!dbContract) return;
    setBusy(true);

    if (operator?.wallet?.walletMode === "USER_CONTROLLED") {
      // USER_CONTROLLED: prepare unsigned XDR locally, open signing modal
      try {
        // Determine the settlement recipient: the other party in the contract
        const recipientKey =
          operator.wallet.publicKey === dbContract.buyer_public_key
            ? dbContract.seller_public_key ?? ""
            : dbContract.buyer_public_key ?? "";

        if (!recipientKey) {
          toast.error(t("Cannot determine settlement recipient from contract."));
          setBusy(false);
          return;
        }

        const settlementId = `CTR-${dbContract.id.slice(0, 8)}-${Date.now()}`;
        const prep = await apiPrepareSettlement({
          recipient_public_key: recipientKey,
          asset: "EPWR",
          amount: dbContract.price_brl,
          memo: `CTR-${dbContract.id.slice(0, 8)}`,
          contract_id: dbContract.id,
          settlement_id: settlementId,
        });
        setPendingUnsignedXdr(prep.unsigned_xdr);
        setPendingSettlementId(prep.settlement_id);
        setSigningModalOpen(true);
      } catch (err) {
        toast.error(t("Settlement preparation failed"), { description: (err as Error).message });
      } finally {
        setBusy(false);
      }
      return;
    }

    // PLATFORM_MANAGED: full server-side execution
    try {
      const res = await apiExecuteContractSettlement(dbContract.id);
      toast.success(t("Settlement executed"), {
        description: `Tx ${res.tx_hash?.slice(0, 12)}… · ${t("Ledger")} #${res.ledger}`,
      });
      onRefresh();
    } catch (err) {
      toast.error(t("Settlement execution failed"), { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleContractSigned = async (signedXdr: string) => {
    setSigningModalOpen(false);
    setBusy(true);
    try {
      const res = await apiSubmitSignedSettlement({
        settlement_id: pendingSettlementId,
        signed_xdr: signedXdr,
        contract_id: dbContract?.id,
        amount_brl: dbContract?.price_brl,
      });
      toast.success(t("Contract settlement executed"), {
        description: `Tx ${res.tx_hash.slice(0, 12)}… · ${t("Ledger")} #${res.ledger}`,
      });
      onRefresh();
    } catch (err) {
      toast.error(t("Contract settlement failed"), { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const timeAgo = (iso: string) => relativeTime(iso);

  return (
    <div className="space-y-4">
      {/* Lifecycle actions */}
      {!isSettled && !isFailed && (
        <div className="rounded-md border border-border bg-background/40 p-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Lifecycle Actions")}
          </p>
          {isParticipant ? (
            <div className="flex flex-wrap gap-2">
              {canActivate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 font-mono text-[11px] uppercase"
                  onClick={activate}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                  {t("Activate Contract")}
                </Button>
              )}
              {canRequestSettlement && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 font-mono text-[11px] uppercase"
                  onClick={requestSettlement}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                  {t("Request Settlement")}
                </Button>
              )}
              {canExecute && (
                <Button
                  size="sm"
                  className="h-7 bg-primary font-mono text-[11px] uppercase"
                  onClick={executeSettlement}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Zap className="mr-1.5 h-3 w-3" />
                  )}
                  {t("Execute Settlement")}
                </Button>
              )}
            </div>
          ) : (
            <p className="font-mono text-[10px] text-muted-foreground/60">
              {t("Read-only access · lifecycle actions require an active market role.")}
            </p>
          )}
          <p className="mt-1.5 font-mono text-[10px] text-muted-foreground/60">
            {t("Current:")} {status} · {state}
          </p>
        </div>
      )}

      {/* Audit trail — contract movements */}
      {movements.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Audit Trail · Contract Movements")}
          </p>
          <ol className="space-y-1.5">
            {movements.map((m, i, arr) => (
              <li key={m.id} className="relative flex gap-2.5 pl-1">
                {m.to_state === "SETTLED" ? (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                ) : m.to_state === "FAILED" ? (
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                )}
                {i < arr.length - 1 && (
                  <span className="absolute left-[6px] top-4 bottom-[-6px] w-px bg-border" />
                )}
                <div className="flex-1 pb-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-medium leading-tight">
                      {m.from_state ? `${m.from_state} → ` : ""}
                      {m.to_state}
                    </p>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {timeAgo(m.created_at)}
                    </span>
                  </div>
                  {m.notes && (
                    <p className="text-[10px] leading-snug text-muted-foreground">{m.notes}</p>
                  )}
                  {m.tx_hash && (
                    <p className="font-mono text-[10px] text-success">
                      {t("Tx")} {m.tx_hash.slice(0, 12)}…
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Reconciliation — SELLER/INVESTOR run · REGULATORY_AUTHORITY monitor-only */}
      {canSeeReconciliation && (
      <div>
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("Ledger Reconciliation")}
          </p>
          {canRunReconciliation ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 font-mono text-[10px]"
              onClick={runReconcile}
              disabled={reconLoading}
            >
              <RefreshCw className={`mr-1 h-3 w-3 ${reconLoading ? "animate-spin" : ""}`} />
              {t("Reconcile")}
            </Button>
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/50">
              {t("monitor only")}
            </span>
          )}
        </div>
        {reconciliation && (
          <div className="mt-2 rounded-md border border-border bg-background/40 p-3 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Horizon verified")}</span>
              <span className={reconciliation.horizon_verified ? "text-success" : "text-destructive"}>
                {reconciliation.horizon_verified ? t("✓ YES") : t("✗ NO")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Internal ledger")}</span>
              <span>{reconciliation.internal_ledger ?? "—"}</span>
            </div>
            {reconciliation.horizon_ledger != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Horizon ledger")}</span>
                <span>{reconciliation.horizon_ledger}</span>
              </div>
            )}
            {reconciliation.discrepancy && (
              <p className="text-destructive text-[10px] pt-1">⚠ {reconciliation.discrepancy}</p>
            )}
            {!reconciliation.discrepancy && reconciliation.horizon_verified && (
              <p className="text-success text-[10px] pt-1">{t("✓ No discrepancy — ledger matches.")}</p>
            )}
          </div>
        )}
      </div>
      )}

      {/* USER_CONTROLLED local signing modal for contract settlement */}
      <TransactionSigningModal
        open={signingModalOpen}
        unsignedXdr={pendingUnsignedXdr}
        settlementId={pendingSettlementId}
        onSigned={handleContractSigned}
        onCancel={() => {
          setSigningModalOpen(false);
          setBusy(false);
          toast.info(t("Contract settlement signing cancelled."));
        }}
      />
    </div>
  );
}

// ── Document viewer — fetches a signed URL and opens it in a new tab ──────────
function DocumentViewer({ contractId, documentName }: { contractId: string; documentName: string }) {
  const t = useT();
  const [fetching, setFetching] = useState(false);

  const openDocument = async () => {
    setFetching(true);
    try {
      const res = await apiGetContractDocumentUrl(contractId);
      window.open(res.signed_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(t("Failed to open document"), { description: (err as Error).message });
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {t("Contract Document")}
          </p>
          <p className="truncate text-[12px] font-medium">{documentName}</p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="ml-3 h-7 shrink-0 gap-1.5 font-mono text-[10px] uppercase tracking-widest"
        onClick={openDocument}
        disabled={fetching}
      >
        {fetching ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ExternalLink className="h-3 w-3" />
        )}
        {t("View")}
      </Button>
    </div>
  );
}

function ContractsList() {
  const t = useT();
  const { dbContracts, loading: dbLoading, reload: reloadDb } = useDbContracts();

  // Role guard for contract creation button
  const _listOperator = useOperator((s) => s.operator);
  const _listRoles = (_listOperator?.roles ?? []).map((r) => String(r).toUpperCase());
  const canCreateContract = _listRoles.some((r) =>
    ["GENERATOR", "SELLER", "USER", "UTILITY"].includes(r),
  );

  // One-time migration: purge any synthetic EPC-N contracts that the atomic
  // tokenize flow incorrectly added to the Zustand localStorage cache.
  // DB contracts use UUID format; local phantom entries use "EPC-N" IDs.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("energypay.ops.v2");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const contracts: Array<{ id: string }> = parsed?.state?.contracts ?? [];
      const cleaned = contracts.filter((c) => !/^EPC-\d+$/.test(c.id));
      if (cleaned.length !== contracts.length) {
        parsed.state.contracts = cleaned;
        localStorage.setItem("energypay.ops.v2", JSON.stringify(parsed));
      }
    } catch { /* non-fatal */ }
  }, []);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "settlementDate",
    dir: "desc",
  });
  const [selected, setSelected] = useState<Contract | null>(null);
  const [selectedDb, setSelectedDb] = useState<DbContract | null>(null);
  const [selectedMovements, setSelectedMovements] = useState<ContractMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  // Registry is DB-authoritative — only real on-chain contracts are shown
  const contracts = useMemo(() => dbContracts.map(dbToContract), [dbContracts]);

  const rows = useMemo(() => {
    let r = contracts.filter((c) => {
      const matchQ =
        !q ||
        c.id.toLowerCase().includes(q.toLowerCase()) ||
        c.buyer.toLowerCase().includes(q.toLowerCase()) ||
        c.seller.toLowerCase().includes(q.toLowerCase());
      const matchS = statusFilter === "ALL" || c.status === statusFilter;
      return matchQ && matchS;
    });
    r = [...r].sort((a, b) => {
      const va = CONTRACT_SORT_ACCESSORS[sort.key](a);
      const vb = CONTRACT_SORT_ACCESSORS[sort.key](b);
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return r;
  }, [contracts, q, statusFilter, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const handleRowClick = async (c: Contract) => {
    setSelected(c);
    setSelectedMovements([]);
    const db = dbContracts.find((d) => d.id === c.id) ?? null;
    setSelectedDb(db);
    if (db) {
      setMovementsLoading(true);
      try {
        const { movements } = await apiGetMovements(db.id);
        setSelectedMovements(movements ?? []);
      } catch {
        // non-fatal — timeline will show empty state
      } finally {
        setMovementsLoading(false);
      }
    }
  };

  const handleDialogClose = () => {
    setSelected(null);
    setSelectedDb(null);
    setSelectedMovements([]);
  };

  const handleRefresh = async () => {
    reloadDb();
    if (selectedDb) {
      const updated = dbContracts.find((d) => d.id === selectedDb.id);
      if (updated) setSelectedDb(updated);
      // Re-fetch movements for the open contract
      try {
        const { movements } = await apiGetMovements(selectedDb.id);
        setSelectedMovements(movements ?? []);
      } catch { /* non-fatal */ }
    }
  };

  const SortableHead = ({
    k,
    label,
    align = "left",
  }: {
    k: SortKey;
    label: string;
    align?: "left" | "right";
  }) => (
    <TableHead
      className={`text-[11px] uppercase tracking-wider ${align === "right" ? "text-right" : ""}`}
    >
      <button
        onClick={() => toggle(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label} <ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    </TableHead>
  );

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {t("Clearing & Reconciliation / Contract Registry")}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            {t("Contract Registry")}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Bilateral PPAs under settlement supervision · counterparty exposure, PLD reference and transaction finality.")}
          </p>
        </div>
      </div>

      {/* Prominent, explanatory entry point for registering a contract */}
      {canCreateContract && (
        <Card className="border-primary/30 bg-primary/5 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold tracking-tight">
                  {t("Register a bilateral energy contract")}
                </h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  {t("Define the counterparties, the volume in MWh, the price and the delivery period. Once every party approves, EnergyPay tokenizes the energy as EPWR and settles it automatically on Stellar — with no manual reconciliation.")}
                </p>
              </div>
            </div>
            <Link to="/contracts/new" className="w-full sm:w-auto sm:shrink-0">
              <Button size="lg" className="w-full gap-2 font-mono text-xs uppercase tracking-widest sm:w-auto">
                <Plus className="h-4 w-4" />
                {t("Register Contract")}
              </Button>
            </Link>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden border-border bg-card/60 p-0 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-background/40 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("Registry · Live")}
            </span>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              {rows.length} / {contracts.length} {t("contracts")}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 font-mono text-[10px]"
              onClick={reloadDb}
              disabled={dbLoading}
            >
              <RefreshCw className={`h-3 w-3 ${dbLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b border-border bg-background/20 px-4 py-2.5 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Search ID, buyer or seller…")}
              className="h-8 bg-input pl-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                if (isStatusFilter(value)) setStatusFilter(value);
              }}
            >
              <SelectTrigger className="h-8 w-[160px] bg-input text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("All statuses")}</SelectItem>
                <SelectItem value="ACTIVE">{t("Active")}</SelectItem>
                <SelectItem value="PENDING">{t("Pending")}</SelectItem>
                <SelectItem value="SETTLED">{t("Settled")}</SelectItem>
                <SelectItem value="FAILED">{t("Failed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="max-h-[calc(100vh-280px)] overflow-auto">
          <Table className="text-xs [&_th]:h-8 [&_th]:px-2.5 [&_td]:px-2.5 [&_td]:py-1.5">
            <TableHeader className="sticky top-0 z-10 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
              <TableRow className="border-border hover:bg-transparent">
                <SortableHead k="id" label={t("Contract")} />
                <TableHead className="text-[10px] uppercase tracking-wider">{t("Buyer")}</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">{t("Seller")}</TableHead>
                <SortableHead k="volumeMWh" label={t("MWh")} align="right" />
                <SortableHead k="priceBRL" label={t("Price")} align="right" />
                <SortableHead k="pldBRL" label={t("PLD")} align="right" />
                <SortableHead k="exposure" label={t("Exposure")} align="right" />
                <TableHead className="text-[10px] uppercase tracking-wider">{t("Status")}</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">{t("Period")}</TableHead>
                <SortableHead k="startDate" label={t("Start")} />
                <SortableHead k="endDate" label={t("End")} />
                <TableHead className="text-[10px] uppercase tracking-wider text-right">
                  {t("Duration")}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">{t("State")}</TableHead>
                <SortableHead k="settlementDate" label={t("Settles")} />
                <TableHead className="text-[10px] uppercase tracking-wider">{t("Ledger")}</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">{t("Tx Hash")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const exp = computeExposure(c);
                const period = contractPeriodStatus(c);
                const start = contractStartDate(c);
                const end = contractEndDate(c);
                const duration = contractDurationDays(c);
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer border-border/60 hover:bg-accent/5"
                    onClick={() => handleRowClick(c)}
                  >
                    <TableCell className="font-mono text-[11px]">{c.id}</TableCell>
                    <TableCell className="text-xs">{c.buyer}<OperatorTag operator={c.buyerIsOperator} className="ml-1.5" /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.seller}<OperatorTag operator={c.sellerIsOperator} className="ml-1.5" /></TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.volumeMWh.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.priceBRL.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {c.pldBRL.toFixed(2)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-xs font-medium ${exp >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {exp >= 0 ? "+" : ""}
                      {fmtBRL(exp)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell>
                      <PeriodBadge status={period} />
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {start}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {end}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                      {duration}d
                    </TableCell>
                    <TableCell className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {c.state}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {c.settlementDate}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                      {c.ledger ? `#${c.ledger.toLocaleString("en-US")}` : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                      {c.txHash && c.txHash !== "0".repeat(64)
                        ? `${c.txHash.slice(0, 6)}…${c.txHash.slice(-6)}`
                        : "—"}{" "}
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={16}
                    className="py-10 text-center text-xs text-muted-foreground"
                  >
                    {dbLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t("Loading contracts…")}
                      </span>
                    ) : (
                      t("No contracts match the current filters.")
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-background/40 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>{t("Σ Exposure")} · {fmtBRL(rows.reduce((a, c) => a + computeExposure(c), 0))}</span>
          <span>{STELLAR_NETWORK_LABEL} · {t("Settlement Network")}</span>
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && handleDialogClose()}>
        <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
          {selected && (
            <>
              <DialogHeader className="border-b border-border px-5 py-4 space-y-1 shrink-0">
                <DialogTitle className="font-display flex items-center gap-2">
                  <span>{t("Contract")}</span>
                  <span className="font-mono text-base text-primary">{selected.id}</span>
                  <StatusBadge status={selected.status} />
                  <PeriodBadge status={contractPeriodStatus(selected)} />
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {t("Bilateral PPA · operational state, exposure, settlement finality & audit trail")}
                </DialogDescription>
              </DialogHeader>

              <div className="overflow-y-auto px-5 py-4 space-y-5">
                {selected.state !== "SETTLED" && selected.state !== "FAILED" && (
                  <div>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t("Settlement state machine")}
                    </p>
                    <StateMachine current={selected.state} failed={false} />
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-stretch">
                  <div className="flex h-full flex-col rounded-md border border-border bg-card p-3.5 text-sm">
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t("Operational metadata")}
                    </p>
                    <div className="flex-1 space-y-1.5">
                      <KV k={t("Buyer")} v={selected.buyer} />
                      <KV k={t("Seller")} v={selected.seller} />
                      <KV k={t("Volume")} v={`${selected.volumeMWh.toLocaleString("pt-BR")} MWh`} mono />
                      <KV k={t("Contract price")} v={`R$ ${selected.priceBRL.toFixed(2)}`} mono />
                      <KV k={t("PLD reference")} v={`R$ ${selected.pldBRL.toFixed(2)}`} mono />
                      <KV k={t("Settlement window")} v={selected.window} mono />
                      <KV
                        k={t("Active period")}
                        v={`${contractStartDate(selected)} → ${contractEndDate(selected)}`}
                        mono
                      />
                      <KV k={t("Duration")} v={`${contractDurationDays(selected)} ${t("days")}`} mono />
                      <KV k={t("Settlement date")} v={selected.settlementDate} mono />
                      <KV
                        k={t("Ledger #")}
                        v={selected.ledger ? selected.ledger.toLocaleString("en-US") : "—"}
                        mono
                      />
                      <KV
                        k={t("Finality")}
                        v={selected.latencyMs ? `${(selected.latencyMs / 1000).toFixed(2)}s` : "—"}
                        mono
                      />
                    </div>
                    <div className="mt-2 border-t border-border pt-2">
                      <KV k={t("Net exposure")} v={fmtBRL(computeExposure(selected))} mono highlight />
                    </div>
                    <div className="mt-2 border-t border-border pt-2 space-y-1.5">
                      <KV k={t("Submarket")} v={selectedDb?.submarket ?? "—"} mono />
                      <KV
                        k={t("Settled")}
                        v={
                          selectedDb
                            ? `${Number(selectedDb.settled_mwh ?? 0).toLocaleString("pt-BR")} / ${Number(selectedDb.volume_mwh).toLocaleString("pt-BR")} MWh (${selectedDb.volume_mwh ? ((Number(selectedDb.settled_mwh ?? 0) / Number(selectedDb.volume_mwh)) * 100).toFixed(0) : 0}%)`
                            : "—"
                        }
                        mono
                      />
                      <KV
                        k={t("Exposure (PLD)")}
                        v={selectedDb?.exposure_brl != null ? fmtBRL(Number(selectedDb.exposure_brl)) : "—"}
                        mono
                      />
                      <KV
                        k={t("Risk")}
                        v={`${selectedDb?.risk_band ?? "—"}${selectedDb?.risk_status ? ` · ${selectedDb.risk_status}` : ""}`}
                        mono
                      />
                      <KV
                        k={t("PLD snapshot")}
                        v={selectedDb?.pld_snapshot_id ? `${selectedDb.pld_snapshot_id.slice(0, 8)}…` : "—"}
                        mono
                      />
                    </div>
                  </div>

                  <div className="flex h-full flex-col rounded-md border border-border bg-card p-3.5">
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t("Operational timeline")}
                    </p>
                    {movementsLoading ? (
                      <div className="flex flex-1 items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : selectedMovements.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">{t("No events recorded yet.")}</p>
                    ) : (
                      <ol className="flex-1 space-y-1.5">
                        {selectedMovements.map((m, i, arr) => (
                          <li key={m.id} className="relative flex gap-2.5 pl-1">
                            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                            {i < arr.length - 1 && (
                              <span className="absolute left-[6px] top-4 bottom-[-6px] w-px bg-border" />
                            )}
                            <div className="flex-1 pb-0.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[11px] font-medium leading-tight">
                                  {m.from_state ? `${m.from_state} → ${m.to_state}` : m.to_state}
                                </p>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })}
                                </span>
                              </div>
                              {m.notes && (
                                <p className="text-[10px] leading-snug text-muted-foreground">
                                  {m.notes}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>

                {/* Attached physical document */}
                {selectedDb?.document_name && (
                  <DocumentViewer
                    contractId={selectedDb.id}
                    documentName={selectedDb.document_name}
                  />
                )}

                {/* DB-backed lifecycle actions + audit trail + reconciliation */}
                {selectedDb && (
                  <LifecycleActions
                    dbContract={selectedDb}
                    onRefresh={() => handleRefresh()}
                  />
                )}
              </div>

              <div className="shrink-0 border-t border-border bg-background/40 px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {t("Stellar Tx Hash")}
                    </p>
                    <p className="truncate font-mono text-[11px]">
                      {selected.state === "FAILED"
                        ? t("— transaction not broadcast —")
                        : selected.txHash && selected.txHash !== "0".repeat(64)
                          ? selected.txHash
                          : t("Awaiting settlement hash")}
                    </p>
                  </div>
                  {selected.state !== "FAILED" &&
                    selected.txHash &&
                    selected.txHash !== "0".repeat(64) && (
                      <a
                        href={stellarExpertTx(selected.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-card px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-accent hover:bg-accent/10"
                      >
                        {t("View on Stellar Expert")} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                </div>
              </div>

              <div className="shrink-0 flex items-center justify-end gap-2 border-t border-border bg-card/40 px-5 py-3">
                <Button size="sm" variant="ghost" onClick={handleDialogClose}>
                  {t("Close")}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KV({
  k,
  v,
  mono,
  highlight,
}: {
  k: string;
  v: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span
        className={`${mono ? "font-mono" : ""} ${highlight ? "text-base font-semibold text-primary" : "text-sm"}`}
      >
        {v}
      </span>
    </div>
  );
}
