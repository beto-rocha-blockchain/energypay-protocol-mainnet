import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import {
  Shield,
  Search,
  RefreshCw,
  Edit2,
  Key,
  UserCog,
  ChevronLeft,
  ChevronRight,
  Link2,
  Trash2,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Mail,
  Ban,
  Layers,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useOperator } from "@/store/operator";
import type { PlatformRole } from "@/store/operator";
import {
  apiAdminListUsers,
  apiAdminUpdateUser,
  apiAdminSetPassword,
  apiAdminSetPlatformRole,
  apiAdminSetRoles,
  apiAdminSetEmail,
  apiAdminBlockUser,
  apiAdminUnblockUser,
  apiAdminAuditLog,
  apiAdminGetRecoveryLinks,
  apiAdminRemoveRecoveryLink,
  type AdminUser,
  type AuditLogEntry,
  type RecoveryLink,
} from "@/lib/api";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Platform Admin — EnergyPay" },
      { name: "description", content: "Platform user management and admin control panel." },
    ],
  }),
  component: AdminPage,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<PlatformRole, { label: string; cls: string }> = {
  PLATFORM_OWNER:   { label: "Owner",    cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  PLATFORM_ADMIN:   { label: "Admin",    cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  ACCOUNT_RECOVERY: { label: "Recovery", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  USER:             { label: "User",     cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

function PlatformBadge({ role }: { role: PlatformRole }) {
  const cfg = ROLE_BADGE[role] ?? ROLE_BADGE.USER;
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-px font-mono text-[10px] leading-none ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function MarketRoles({ roles }: { roles: string[] }) {
  if (!roles?.length) return <span className="text-muted-foreground/50 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map(r => (
        <span key={r} className="rounded bg-muted/60 px-1.5 py-px font-mono text-[10px] text-muted-foreground">
          {r}
        </span>
      ))}
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * Client-side mirror of the backend recovery matrix (best-effort, for showing/
 * hiding the "recover password" button). The server is the source of truth:
 *   • common USER  → only OWNER
 *   • ADMIN/RECOVERY → OWNER or ADMIN
 *   • OWNER        → OWNER/ADMIN may try; server allows only the linked recoverer
 */
function uiCanRecover(operatorEmail: string, operatorRole: PlatformRole, target: AdminUser): boolean {
  if (operatorEmail.toLowerCase() === target.email.toLowerCase()) return false;
  const t = target.platform_role;
  if (t === "USER") return operatorRole === "PLATFORM_OWNER";
  return operatorRole === "PLATFORM_OWNER" || operatorRole === "PLATFORM_ADMIN";
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────

function EditModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: (updated: AdminUser) => void;
}) {
  const canLinkWallet = user.wallet_mode === "USER_CONTROLLED" && !user.stellar_public_key;

  const [form, setForm] = useState({
    full_name:           user.full_name    ?? "",
    organization:        user.organization ?? "",
    phone:               user.phone        ?? "",
    country:             user.country      ?? "",
    state:               user.state        ?? "",
    city:                user.city         ?? "",
    stellar_public_key:  "",          // only sent when canLinkWallet and non-empty
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        full_name:    form.full_name,
        organization: form.organization,
        phone:        form.phone,
        country:      form.country,
        state:        form.state,
        city:         form.city,
      };
      // Only include stellar_public_key if we're linking a wallet and the field is filled
      if (canLinkWallet && form.stellar_public_key.trim()) {
        payload.stellar_public_key = form.stellar_public_key.trim();
      }
      const res = await apiAdminUpdateUser(user.id, payload);
      toast.success("Profile updated.");
      onSaved(res.user);
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Edit2 className="h-4 w-4 text-primary" />
            Edit Profile — {user.email}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Market roles, email, and encrypted wallet fields cannot be changed here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {(["full_name", "organization", "phone", "country", "state", "city"] as const).map(field => (
            <div key={field} className="grid gap-1">
              <label className="font-mono text-[11px] text-muted-foreground capitalize">
                {field.replace("_", " ")}
              </label>
              <Input
                value={form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
          ))}

          {/* Wallet link — only shown for USER_CONTROLLED accounts with no wallet yet */}
          {canLinkWallet && (
            <div className="grid gap-1 border-t border-border/40 pt-3">
              <label className="font-mono text-[11px] text-yellow-400">
                Link Stellar Wallet (optional)
              </label>
              <Input
                value={form.stellar_public_key}
                onChange={e => setForm(f => ({ ...f, stellar_public_key: e.target.value }))}
                placeholder="G… (56 characters, Stellar Mainnet)"
                className="h-8 font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Public key only — secret never stored. Leave blank to skip.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Set Password Modal ───────────────────────────────────────────────────────

function SetPasswordModal({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const [pwd, setPwd]         = useState("");
  const [confirm, setConfirm] = useState("");
  const [reason, setReason]   = useState("");
  const [saving, setSaving]   = useState(false);

  const valid = pwd.length >= 8 && pwd === confirm;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await apiAdminSetPassword(user.id, pwd, reason || undefined);
      toast.success("Password reset successfully.");
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Failed to reset password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Key className="h-4 w-4 text-yellow-400" />
            Force Reset Password
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {user.email}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <label className="font-mono text-[11px] text-muted-foreground">New Password (min 8 chars)</label>
            <Input type="password" autoComplete="new-password" value={pwd} onChange={e => setPwd(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="grid gap-1">
            <label className="font-mono text-[11px] text-muted-foreground">Confirm Password</label>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className="h-8 text-sm" />
            {confirm && !valid && pwd !== confirm && (
              <span className="text-[11px] text-red-400">Passwords do not match.</span>
            )}
          </div>
          <div className="grid gap-1">
            <label className="font-mono text-[11px] text-muted-foreground">Reason (optional)</label>
            <Input value={reason} onChange={e => setReason(e.target.value)} className="h-8 text-sm" placeholder="e.g. User requested recovery" />
          </div>
          <div className="flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/5 p-3">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-yellow-400" />
            <p className="text-xs text-yellow-300/80">
              This action is logged in the admin audit trail and cannot be undone.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={handleSave} disabled={saving || !valid}>
            {saving ? "Setting…" : "Set Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Set Platform Role Modal ──────────────────────────────────────────────────

// Elevated platform roles are restricted by email (mirrors the server-side allowlist).
const OWNER_ELIGIBLE_EMAILS = ["energypayepwr@gmail.com", "roberto.blockchainresources@gmail.com"];
const ADMIN_ELIGIBLE_EMAILS = [...OWNER_ELIGIBLE_EMAILS, "contato@edugera.com.br", "eduferreira053@gmail.com"];
const eligiblePlatformRoles = (email: string): PlatformRole[] => {
  const e = (email || "").trim().toLowerCase();
  const roles: PlatformRole[] = ["USER"];
  if (ADMIN_ELIGIBLE_EMAILS.includes(e)) roles.push("ACCOUNT_RECOVERY", "PLATFORM_ADMIN");
  if (OWNER_ELIGIBLE_EMAILS.includes(e)) roles.push("PLATFORM_OWNER");
  return roles;
};

function SetRoleModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: (id: string, role: PlatformRole) => void;
}) {
  const [role, setRole]   = useState<PlatformRole>(user.platform_role);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (role === user.platform_role) { onClose(); return; }
    setSaving(true);
    try {
      await apiAdminSetPlatformRole(user.id, role);
      toast.success(`Role set to ${role}.`);
      onSaved(user.id, role);
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Failed to set role.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <UserCog className="h-4 w-4 text-violet-400" />
            Set Platform Role
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">{user.email}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          {eligiblePlatformRoles(user.email).map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`flex items-center gap-3 rounded border px-3 py-2 text-left text-sm transition-colors
                ${role === r
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border/50 bg-background hover:border-border text-muted-foreground"
                }`}
            >
              <PlatformBadge role={r} />
              <span className="font-mono text-xs">{r}</span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || role === user.platform_role}>
            {saving ? "Saving…" : "Set Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Set Market Roles Modal ───────────────────────────────────────────────────

const MARKET_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "GENERATOR", label: "Generator" },
  { value: "SELLER",    label: "Trader" },
  { value: "INVESTOR",  label: "Investor" },
  { value: "USER",      label: "Consumer" },
  { value: "UTILITY",   label: "Utility" },
];

function SetMarketRolesModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: (id: string, roles: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(
    (user.roles ?? []).filter(r => MARKET_ROLE_OPTIONS.some(o => o.value === r)),
  );
  const [saving, setSaving] = useState(false);
  const toggle = (v: string) =>
    setSelected(s => (s.includes(v) ? s.filter(x => x !== v) : [...s, v]));
  const preserved = (user.roles ?? []).filter(r => r === "ADMIN" || r === "REGULATORY_AUTHORITY");

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiAdminSetRoles(user.id, selected);
      toast.success("Market roles updated.");
      onSaved(user.id, res.roles);
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Failed to update roles.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-primary" />
            Market Roles
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">{user.email}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          {MARKET_ROLE_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => toggle(o.value)}
              className={`flex items-center justify-between rounded border px-3 py-2 text-left text-sm transition-colors
                ${selected.includes(o.value)
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border/50 bg-background hover:border-border text-muted-foreground"
                }`}
            >
              <span>{o.label}</span>
              {selected.includes(o.value) && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
            </button>
          ))}
        </div>

        {preserved.length > 0 && (
          <p className="font-mono text-[10px] text-muted-foreground">
            Preserved (unchanged): {preserved.map(r => (r === "ADMIN" ? "Platform Operator" : "Regulatory")).join(", ")}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Roles"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Change Email Modal (OWNER only) ──────────────────────────────────────────

function ChangeEmailModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: (id: string, email: string) => void;
}) {
  const [email, setEmail]   = useState("");
  const [saving, setSaving] = useState(false);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.trim().toLowerCase() !== user.email.toLowerCase();

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await apiAdminSetEmail(user.id, email.trim());
      toast.success("Email updated — the new address must be re-verified.");
      onSaved(user.id, res.email);
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Failed to change email.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-primary" /> Change Email
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">Current: {user.email}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <label className="font-mono text-[11px] text-muted-foreground">New email</label>
            <Input type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} className="h-8 text-sm" placeholder="user@example.com" />
          </div>
          <div className="flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/5 p-3">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-yellow-400" />
            <p className="text-xs text-yellow-300/80">
              Changing the email resets verification (the new address must be re-verified) and is recorded in the audit trail.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !valid}>{saving ? "Saving…" : "Change Email"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Block Account Modal (OWNER + ADMIN) ───────────────────────────────────────

function BlockModal({
  user,
  onClose,
  onBlocked,
}: {
  user: AdminUser;
  onClose: () => void;
  onBlocked: (id: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleBlock = async () => {
    setSaving(true);
    try {
      await apiAdminBlockUser(user.id, reason || undefined);
      toast.success("Account blocked — the user can no longer log in.");
      onBlocked(user.id);
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Failed to block account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Ban className="h-4 w-4 text-red-400" /> Block Account
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">{user.email}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <label className="font-mono text-[11px] text-muted-foreground">Reason (optional)</label>
            <Input value={reason} onChange={e => setReason(e.target.value)} className="h-8 text-sm" placeholder="e.g. Abuse / fraud / user request" />
          </div>
          <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/5 p-3">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-red-400" />
            <p className="text-xs text-red-300/80">
              A blocked account cannot log in (existing sessions expire within 12h). Recorded in the audit trail.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={handleBlock} disabled={saving}>{saving ? "Blocking…" : "Block Account"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Users Tab ───────────────────────────────────────────────────────────────

function UsersTab({ operatorEmail, operatorRole }: { operatorEmail: string; operatorRole: PlatformRole }) {
  const isOwner = operatorRole === "PLATFORM_OWNER";
  const isAdmin = operatorRole === "PLATFORM_OWNER" || operatorRole === "PLATFORM_ADMIN";
  const [users, setUsers]       = useState<AdminUser[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [pwdUser, setPwdUser]   = useState<AdminUser | null>(null);
  const [roleUser, setRoleUser] = useState<AdminUser | null>(null);
  const [emailUser, setEmailUser] = useState<AdminUser | null>(null);
  const [blockUser, setBlockUser] = useState<AdminUser | null>(null);
  const [marketRolesUser, setMarketRolesUser] = useState<AdminUser | null>(null);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiAdminListUsers({ search, page, limit });
      setUsers(res.users);
      setTotal(res.total);
    } catch (err) {
      toast.error((err as Error).message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.ceil(total / limit);

  const handleUnblock = async (id: string) => {
    try {
      await apiAdminUnblockUser(id);
      setUsers(us => us.map(u => u.id === id ? { ...u, account_status: "ACTIVE" } : u));
      toast.success("Account unblocked.");
    } catch (err) {
      toast.error((err as Error).message || "Failed to unblock account.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search + refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search email, name, org…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" onClick={load} className="h-8 w-8 p-0">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <span className="font-mono text-xs text-muted-foreground">{total} total</span>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border/50 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">NAME / EMAIL</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">ORG</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">MARKET ROLES</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">PLATFORM</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">STATUS</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">JOINED</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : users.map(u => (
                  <TableRow key={u.id} className="border-border/30 hover:bg-muted/30">
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium">{u.full_name || "—"}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{u.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.organization || "—"}</TableCell>
                    <TableCell><MarketRoles roles={u.roles ?? []} /></TableCell>
                    <TableCell><PlatformBadge role={u.platform_role} /></TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {u.account_status === "BLOCKED" && (
                          <span className="w-fit rounded border border-red-500/40 bg-red-500/15 px-1 py-px font-mono text-[9px] font-semibold text-red-400">
                            BLOCKED
                          </span>
                        )}
                        {u.stellar_public_key
                          ? <span className="font-mono text-[10px]">{u.wallet_status ?? "—"}</span>
                          : <span className="rounded border border-yellow-500/30 bg-yellow-500/10 px-1 py-px font-mono text-[9px] text-yellow-400">no wallet</span>
                        }
                        <div className="flex gap-1">
                          {u.email_verified
                            ? <CheckCircle2 className="h-3 w-3 text-green-400" />
                            : <XCircle className="h-3 w-3 text-red-400/60" />
                          }
                          <span className="font-mono text-[9px] text-muted-foreground/60">email</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                      {timeAgo(u.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => setEditUser(u)} title="Edit profile">
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                            onClick={() => setMarketRolesUser(u)} title="Market roles">
                            <Layers className="h-3 w-3" />
                          </Button>
                        )}
                        {uiCanRecover(operatorEmail, operatorRole, u) && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-yellow-400"
                            onClick={() => setPwdUser(u)} title="Recover password (reset)">
                            <Key className="h-3 w-3" />
                          </Button>
                        )}
                        {isAdmin && u.platform_role !== "PLATFORM_OWNER" && u.email !== operatorEmail && (
                          u.account_status === "BLOCKED"
                            ? <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-green-400"
                                onClick={() => handleUnblock(u.id)} title="Unblock account">
                                <CheckCircle2 className="h-3 w-3" />
                              </Button>
                            : <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                                onClick={() => setBlockUser(u)} title="Block account">
                                <Ban className="h-3 w-3" />
                              </Button>
                        )}
                        {isOwner && (
                          <>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-sky-400"
                              onClick={() => setEmailUser(u)} title="Change email">
                              <Mail className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-violet-400"
                              onClick={() => setRoleUser(u)} title="Set platform role">
                              <UserCog className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
            }
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="font-mono text-xs text-muted-foreground">{page} / {pages}</span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Modals */}
      {editUser && (
        <EditModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={updated => setUsers(us => us.map(u => u.id === updated.id ? updated : u))}
        />
      )}
      {pwdUser && <SetPasswordModal user={pwdUser} onClose={() => setPwdUser(null)} />}
      {roleUser && (
        <SetRoleModal
          user={roleUser}
          onClose={() => setRoleUser(null)}
          onSaved={(id, role) => setUsers(us => us.map(u => u.id === id ? { ...u, platform_role: role } : u))}
        />
      )}
      {emailUser && (
        <ChangeEmailModal
          user={emailUser}
          onClose={() => setEmailUser(null)}
          onSaved={(id, email) => setUsers(us => us.map(u => u.id === id ? { ...u, email, email_verified: false } : u))}
        />
      )}
      {blockUser && (
        <BlockModal
          user={blockUser}
          onClose={() => setBlockUser(null)}
          onBlocked={id => setUsers(us => us.map(u => u.id === id ? { ...u, account_status: "BLOCKED" } : u))}
        />
      )}
      {marketRolesUser && (
        <SetMarketRolesModal
          user={marketRolesUser}
          onClose={() => setMarketRolesUser(null)}
          onSaved={(id, roles) => setUsers(us => us.map(u => u.id === id ? { ...u, roles } : u))}
        />
      )}
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditLogTab() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiAdminAuditLog({ page, limit });
      setEntries(res.entries);
      setTotal(res.total);
    } catch (err) {
      toast.error((err as Error).message || "Failed to load audit log.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{total} entries</span>
        <Button variant="outline" size="sm" onClick={load} className="h-7 w-7 p-0">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <div className="rounded-md border border-border/50 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">WHEN</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">ACTOR</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">ACTION</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">TARGET</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">DETAILS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : entries.length === 0
                ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">No audit entries yet.</TableCell></TableRow>
                : entries.map(e => (
                    <TableRow key={e.id} className="border-border/30 hover:bg-muted/30">
                      <TableCell className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(e.created_at)}</TableCell>
                      <TableCell className="font-mono text-[10px]">{e.actor?.email ?? "—"}</TableCell>
                      <TableCell>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                          {e.action}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{e.target?.email ?? "—"}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground/70 max-w-xs truncate">
                        {JSON.stringify(e.details)}
                      </TableCell>
                    </TableRow>
                  ))
            }
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="font-mono text-xs text-muted-foreground">{page} / {pages}</span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Recovery Links Tab ───────────────────────────────────────────────────────

function RecoveryLinksTab({ isOwner }: { isOwner: boolean }) {
  const [links, setLinks]     = useState<RecoveryLink[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetRecoveryLinks();
      setLinks(res.links);
    } catch (err) {
      toast.error((err as Error).message || "Failed to load recovery links.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async (id: string) => {
    try {
      await apiAdminRemoveRecoveryLink(id);
      setLinks(ls => ls.filter(l => l.id !== id));
      toast.success("Recovery link removed.");
    } catch (err) {
      toast.error((err as Error).message || "Failed to remove link.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{links.length} links</span>
        <Button variant="outline" size="sm" onClick={load} className="h-7 w-7 p-0">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <div className="rounded-md border border-border/50 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">ACCOUNT</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">CAN BE RECOVERED BY</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest text-muted-foreground/70">ADDED</TableHead>
              {isOwner && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    {Array.from({ length: isOwner ? 4 : 3 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : links.length === 0
                ? <TableRow><TableCell colSpan={isOwner ? 4 : 3} className="py-8 text-center text-xs text-muted-foreground">No recovery links configured.</TableCell></TableRow>
                : links.map(l => (
                    <TableRow key={l.id} className="border-border/30 hover:bg-muted/30">
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-[10px]">{l.account.email}</span>
                          <PlatformBadge role={l.account.platform_role} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Link2 className="h-3 w-3 text-muted-foreground/50" />
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-[10px]">{l.recovery.email}</span>
                            <PlatformBadge role={l.recovery.platform_role} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{timeAgo(l.created_at)}</TableCell>
                      {isOwner && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                            onClick={() => handleRemove(l.id)}
                            title="Remove recovery link"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
            }
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "users" | "audit" | "recovery";

function AdminPage() {
  const operator = useOperator(s => s.operator);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("users");

  // Guard: only platform admins can access this page
  useEffect(() => {
    if (!operator) { navigate({ to: "/login" }); return; }
    if (operator.platformRole === "USER") { navigate({ to: "/" }); }
  }, [operator, navigate]);

  if (!operator || operator.platformRole === "USER") return null;

  const isOwner = operator.platformRole === "PLATFORM_OWNER";

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "users",    label: "Users",          icon: Shield },
    { id: "audit",    label: "Audit Log",       icon: ClipboardList },
    { id: "recovery", label: "Recovery Links",  icon: Link2 },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-500/10 ring-1 ring-violet-500/20">
          <Shield className="h-4 w-4 text-violet-400" />
        </div>
        <div>
          <h1 className="text-sm font-semibold">Platform Admin</h1>
          <p className="text-[11px] text-muted-foreground">
            {isOwner ? "Full access — PLATFORM_OWNER" : `${operator.platformRole} access`}
          </p>
        </div>

        <Badge
          variant="outline"
          className="ml-auto font-mono text-[10px] bg-violet-500/10 text-violet-300 border-violet-500/30"
        >
          {operator.email}
        </Badge>
      </div>

      {/* Warning for ACCOUNT_RECOVERY role */}
      {operator.platformRole === "ACCOUNT_RECOVERY" && (
        <div className="flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/5 p-3">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-yellow-400" />
          <p className="text-xs text-yellow-300/80">
            You have <strong>Account Recovery</strong> access. You can view users but cannot edit profiles
            or change platform roles. Contact a PLATFORM_OWNER to request elevated access.
          </p>
        </div>
      )}

      {/* Tabs */}
      <Card className="border-border/40 bg-background/50">
        <div className="border-b border-border/40 px-4">
          <div className="flex gap-0">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-3 font-mono text-[11px] transition-colors
                  ${tab === t.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-muted-foreground/80"
                  }`}
              >
                <t.icon className="h-3 w-3" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {tab === "users"    && <UsersTab    operatorEmail={operator.email} operatorRole={operator.platformRole} />}
          {tab === "audit"    && <AuditLogTab />}
          {tab === "recovery" && <RecoveryLinksTab isOwner={isOwner} />}
        </div>
      </Card>
    </div>
  );
}
