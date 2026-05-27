/**
 * Notifications — full-page notification centre.
 *
 * Accessible via the "View all" button in the OperatorBadge popup.
 * Shows all notifications with filters, actions (approve / reject),
 * and mark-as-read support.
 */

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Check,
  X,
  Loader2,
  Filter,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications } from "@/hooks/useNotifications";
import { type Notification, apiGetContractDocumentUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — EnergyPay" },
      {
        name: "description",
        content: "All system notifications, contract approvals, and settlement events.",
      },
    ],
  }),
  component: NotificationsPage,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

type FilterKey = "all" | "unread" | "pending";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",     label: "All" },
  { key: "unread",  label: "Unread" },
  { key: "pending", label: "Pending Approval" },
];

function NIcon({ type }: { type: Notification["type"] }) {
  if (type === "APPROVAL_REQUIRED")
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />;
  if (type === "APPROVED")
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />;
  if (type === "REJECTED")
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  if (type === "SETTLED")
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />;
  return <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
}

function TypeBadge({ type }: { type: Notification["type"] }) {
  const map: Record<Notification["type"], { label: string; cls: string }> = {
    APPROVAL_REQUIRED: { label: "Approval Required", cls: "border-warning/40 text-warning" },
    APPROVED:          { label: "Approved",           cls: "border-success/40 text-success" },
    REJECTED:          { label: "Rejected",           cls: "border-destructive/40 text-destructive" },
    SETTLED:           { label: "Settled",            cls: "border-primary/40 text-primary" },
    INFO:              { label: "Info",               cls: "border-border text-muted-foreground" },
  };
  const { label, cls } = map[type];
  return (
    <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${cls}`}>
      {label}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day:    "2-digit",
    month:  "2-digit",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: FilterKey }) {
  const messages: Record<FilterKey, string> = {
    all:     "No notifications yet.",
    unread:  "All caught up — no unread notifications.",
    pending: "No pending approvals.",
  };
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Bell className="mb-4 h-10 w-10 text-muted-foreground/20" />
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {messages[filter]}
      </p>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 border-b border-border/40 px-5 py-4 last:border-0">
      <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-3 w-12 shrink-0" />
    </div>
  );
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotificationRow({
  n,
  approving,
  rejecting,
  fetchingDoc,
  onRead,
  onApprove,
  onReject,
  onViewDocument,
}: {
  n: Notification;
  approving: string | null;
  rejecting: string | null;
  fetchingDoc: string | null;
  onRead: (n: Notification) => void;
  onApprove: (n: Notification) => void;
  onReject: (n: Notification) => void;
  onViewDocument: (contractId: string) => void;
}) {
  const navigate = useNavigate();

  const handleClick = () => {
    onRead(n);
    if (n.action_url) navigate({ to: n.action_url as "/" });
  };

  return (
    <div
      className={cn(
        "border-b border-border/40 px-5 py-4 last:border-0 transition-colors",
        !n.read && "bg-primary/[0.03]",
      )}
    >
      {/* Main row */}
      <div
        className="flex cursor-pointer items-start gap-3"
        onClick={handleClick}
      >
        <NIcon type={n.type} />

        <div className="min-w-0 flex-1">
          {/* Title + timestamp */}
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p
              className={cn(
                "text-[13px] leading-snug",
                !n.read ? "font-semibold text-foreground" : "text-foreground/80",
              )}
            >
              {n.title}
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <TypeBadge type={n.type} />
              <span className="font-mono text-[10px] text-muted-foreground">
                {timeAgo(n.created_at)}
              </span>
            </div>
          </div>

          {/* Message */}
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {n.message}
          </p>

          {/* Metadata row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {n.contract_id && (
              <span className="font-mono text-[10px] text-muted-foreground/60">
                Contract · {n.contract_id.slice(0, 8)}…
              </span>
            )}
            <span className="font-mono text-[10px] text-muted-foreground/50">
              {fmtDate(n.created_at)}
            </span>
          </div>
        </div>

        {/* Unread dot */}
        {!n.read && (
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
        )}
      </div>

      {/* Approval actions */}
      {n.type === "APPROVAL_REQUIRED" && n.contract_id && (
        <div className="mt-3 flex items-center gap-2 pl-7">
          <Button
            size="sm"
            className="h-7 gap-1.5 font-mono text-[10px] uppercase tracking-widest"
            disabled={approving === n.contract_id || rejecting === n.contract_id}
            onClick={(e) => { e.stopPropagation(); onApprove(n); }}
          >
            {approving === n.contract_id
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Check className="h-3 w-3" />}
            Approve Contract
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-destructive/40 font-mono text-[10px] uppercase tracking-widest text-destructive hover:bg-destructive/10"
            disabled={approving === n.contract_id || rejecting === n.contract_id}
            onClick={(e) => { e.stopPropagation(); onReject(n); }}
          >
            {rejecting === n.contract_id
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <X className="h-3 w-3" />}
            Reject
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            disabled={fetchingDoc === n.contract_id}
            onClick={(e) => { e.stopPropagation(); onViewDocument(n.contract_id!); }}
          >
            {fetchingDoc === n.contract_id
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <FileText className="h-3 w-3" />}
            View Document
          </Button>
          {n.action_url && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate({ to: n.action_url as "/" }); }}
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
            >
              {n.action_label || "View contract →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter]       = useState<FilterKey>("all");
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [fetchingDoc, setFetchingDoc] = useState<string | null>(null);

  const { notifications, unreadCount, loading, markRead, markAllRead, approve, reject, refresh, softDismiss } =
    useNotifications();

  // ── filter logic ──────────────────────────────────────────────────────────

  const filtered = notifications.filter((n) => {
    if (filter === "unread")  return !n.read;
    if (filter === "pending") return n.type === "APPROVAL_REQUIRED";
    return true;
  });

  const pendingCount = notifications.filter((n) => n.type === "APPROVAL_REQUIRED").length;

  // ── action handlers ───────────────────────────────────────────────────────

  const handleRead = async (n: Notification) => {
    if (!n.read) await markRead(n.id).catch(() => {});
  };

  const handleApprove = async (n: Notification) => {
    if (!n.contract_id) return;
    setApproving(n.contract_id);
    try {
      await markRead(n.id);
      const { activated } = await approve(n.contract_id);
      toast.success(activated ? "Contract approved and activated." : "Approval recorded.");
      if (activated) navigate({ to: "/contracts" });
    } catch (err) {
      const msg = (err as Error).message || "Approval failed.";
      toast.error(msg);
      if (/draft|not found|already/i.test(msg)) softDismiss(n.id);
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (n: Notification) => {
    if (!n.contract_id) return;
    setRejecting(n.contract_id);
    try {
      await markRead(n.id);
      await reject(n.contract_id);
      toast.success("Contract rejected.");
    } catch (err) {
      const msg = (err as Error).message || "Rejection failed.";
      toast.error(msg);
      if (/draft|not found|already/i.test(msg)) softDismiss(n.id);
    } finally {
      setRejecting(null);
    }
  };

  const handleViewDocument = async (contractId: string) => {
    setFetchingDoc(contractId);
    try {
      const res = await apiGetContractDocumentUrl(contractId);
      window.open(res.signed_url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("No document is attached to this contract.");
    } finally {
      setFetchingDoc(null);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Page header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            System Events · Settlement Alerts
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Notification Centre
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={markAllRead}
              className="font-mono text-[10px] uppercase tracking-widest"
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            disabled={loading}
            className="font-mono text-[10px] uppercase tracking-widest"
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-3 gap-3 sm:max-w-lg">
        <KpiCard label="Total"   value={notifications.length} />
        <KpiCard label="Unread"  value={unreadCount}  tone={unreadCount  > 0 ? "warn" : undefined} />
        <KpiCard label="Pending" value={pendingCount} tone={pendingCount > 0 ? "warn" : undefined} />
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex items-center gap-1 border-b border-border pb-1">
        <Filter className="mr-1 h-3 w-3 shrink-0 text-muted-foreground" />
        {FILTERS.map((f) => {
          const count =
            f.key === "all"     ? notifications.length :
            f.key === "unread"  ? unreadCount :
            pendingCount;

          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-sm px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition",
                filter === f.key
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              {count > 0 && (
                <span className={cn(
                  "flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 font-mono text-[8px] font-bold",
                  filter === f.key
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground",
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Notification list ── */}
      <div className="overflow-hidden rounded-md border border-border bg-card/60">
        {loading && notifications.length === 0 ? (
          <>
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
          </>
        ) : filtered.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          filtered.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              approving={approving}
              rejecting={rejecting}
              fetchingDoc={fetchingDoc}
              onRead={handleRead}
              onApprove={handleApprove}
              onReject={handleReject}
              onViewDocument={handleViewDocument}
            />
          ))
        )}
      </div>

    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-md border border-border bg-card/60 px-3 py-2.5">
      <p className="font-mono text-[9.5px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={cn(
        "mt-0.5 font-display text-xl font-semibold",
        tone === "warn" ? "text-warning" : "text-foreground",
      )}>
        {value}
      </p>
    </div>
  );
}
