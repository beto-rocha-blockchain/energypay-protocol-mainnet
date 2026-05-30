/**
 * OperatorBadge — compact header trigger that opens the Operator Profile popover.
 *
 * The button shows:
 *   ● CONNECTED  [N]   (N = unread notification count badge, hidden when 0)
 *
 * The popover contains:
 *   · Operator identity (ID, name, org, email, wallet)
 *   · Email / phone verification
 *   · Roles & permissions
 *   · Notifications sub-panel (scrollable list + "View all" link)
 *   · Theme toggle
 *   · Sign-out
 */

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useOperator, maskAddress, ROLE_META } from "@/store/operator";
import { useNotifications } from "@/hooks/useNotifications";
import { type Notification } from "@/lib/api";
import { STELLAR_NETWORK_LABEL } from "@/lib/stellar";
import { apiResendVerification, apiSendPhoneCode, apiVerifyPhoneCode, apiUpdatePhone, apiUpdateProfile, apiGetContractDocumentUrl } from "@/lib/api";
import {
  Copy, LogOut, ShieldCheck, Activity, Building2, Mail, Hash, Check, KeyRound,
  MapPin, Sun, Moon, AlertTriangle, Loader2, MailCheck, Phone, PhoneCall,
  Bell, CheckCheck, ArrowUpRight, CheckCircle2, XCircle, Info, X, FileText, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useUiStore, type Theme } from "@/store/ui";
import { cn } from "@/lib/utils";

// ─── Notification helpers ─────────────────────────────────────────────────────

function NIcon({ type }: { type: Notification["type"] }) {
  if (type === "APPROVAL_REQUIRED")
    return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />;
  if (type === "APPROVED")
    return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />;
  if (type === "REJECTED")
    return <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />;
  if (type === "SETTLED")
    return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />;
  return <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
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

// ─── Main component ───────────────────────────────────────────────────────────

export function OperatorBadge() {
  const operator = useOperator((s) => s.operator);
  const logout   = useOperator((s) => s.logout);
  const navigate = useNavigate();
  const [copied, setCopied]     = useState(false);
  const [approving, setApproving]   = useState<string | null>(null);
  const [rejecting, setRejecting]   = useState<string | null>(null);
  const [fetchingDoc, setFetchingDoc] = useState<string | null>(null);

  const { notifications, unreadCount, markRead, markAllRead, approve, reject, softDismiss } =
    useNotifications();

  if (!operator) return null;

  // ── actions ──────────────────────────────────────────────────────────────

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(operator.settlementAddress);
      setCopied(true);
      toast.success("Settlement address copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const onLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) await markRead(n.id);
    if (n.action_url) navigate({ to: n.action_url as "/" });
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
      // Contract is no longer in DRAFT — dismiss the stuck notification
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
    <Popover>
      {/* ── Trigger button (compact, no operator ID) ── */}
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-widest text-foreground transition hover:bg-accent/10"
        >
          <span className="flex items-center gap-1.5 leading-none text-success">
            <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success" />
            Profile Settings
          </span>
          {unreadCount > 0 && (
            <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 font-mono text-[8px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      {/* ── Popover panel ── */}
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[500px] max-h-[90vh] overflow-y-auto border-border bg-card/95 p-0 backdrop-blur"
      >
        {/* Header row */}
        <div className="flex items-center justify-between border-b border-border bg-background/40 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Operator Profile
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            {operator.networkStatus}
          </span>
        </div>

        <div className="space-y-3 p-3.5">
          {/* Identity */}
          <Row icon={<Hash className="h-3 w-3" />} label="Operator ID" value={operator.operatorId} mono />
          <Row icon={<Hash className="h-3 w-3" />} label="Full Name"   value={operator.fullName} />
          <Row icon={<Building2 className="h-3 w-3" />} label="Organization" value={operator.organization} />
          <Row icon={<Mail className="h-3 w-3" />} label="Operator Email" value={operator.email} mono />

          <EmailVerificationBanner verified={operator.emailVerified} />
          <PhoneVerificationBanner
            verified={operator.phoneVerified}
            hasPhone={!!operator.phone}
            emailVerified={operator.emailVerified}
          />

          <Row icon={<MapPin className="h-3 w-3" />} label="Jurisdiction" value={`${operator.city} · ${operator.country}`} />

          <ProfileEditor />

          {/* Wallet */}
          <div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              Signer Address · Active Settlement Authority
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <code className="flex-1 truncate rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground">
                {operator.wallet.publicKey}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copy}
                className="h-7 px-2 font-mono text-[10px] uppercase tracking-widest">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
              {maskAddress(operator.wallet.publicKey)} · ed25519 · {STELLAR_NETWORK_LABEL}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <KeyRound className="h-3 w-3" />
              Signer custody
            </div>
            <div className="mt-1 rounded-md border border-border bg-background/60 px-2 py-1.5 font-mono text-[11px] text-foreground">
              Backend custody · ed25519 · {operator.wallet.status}
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
              Secret seed held by EnergyPay backend. Settlement signing is performed
              server-side on {STELLAR_NETWORK_LABEL}.
            </div>
          </div>

          <Separator className="bg-border/60" />

          {/* Roles */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Market Participant Roles
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {operator.roles.length === 0 && (
                <span className="font-mono text-[10px] text-muted-foreground">No roles provisioned</span>
              )}
              {operator.roles.map((r) => (
                <span key={r}
                  className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${ROLE_META[r].color.border} ${ROLE_META[r].color.bg} ${ROLE_META[r].color.text}`}>
                  {ROLE_META[r].label}
                </span>
              ))}
            </div>
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-widest">
            <Mini label="Access Level"  value={operator.accessLevel.replace("_", " ")} />
            <Mini label="Network"       value={operator.network || "Stellar"} />
            <Mini label="Funded"        value={operator.funded ? "Yes" : "No"} />
            <Mini label="Connectivity"  value="Horizon · OK" tone="success" />
          </div>

          {/* Permissions */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Reconciliation Permissions
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {operator.permissions.map((p) => (
                <span key={p}
                  className="rounded-sm border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                  {p}
                </span>
              ))}
            </div>
          </div>

          <Separator className="bg-border/60" />

          {/* ── Notifications sub-panel ── */}
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <Badge variant="outline"
                    className="h-4 border-destructive/40 px-1.5 font-mono text-[9px] text-destructive">
                    {unreadCount} new
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button onClick={markAllRead}
                    className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
                    <CheckCheck className="h-3 w-3" />
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => navigate({ to: "/notifications" })}
                  className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary"
                >
                  <ArrowUpRight className="h-3 w-3" />
                  View all
                </button>
              </div>
            </div>

            {/* Scrollable notification list */}
            <div className="mt-2 max-h-[220px] overflow-y-auto rounded-md border border-border bg-background/50">
              {notifications.length === 0 ? (
                <div className="py-8 text-center">
                  <Bell className="mx-auto mb-2 h-5 w-5 text-muted-foreground/30" />
                  <p className="font-mono text-[10px] text-muted-foreground">No notifications</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id}
                    className={cn("border-b border-border/40 px-3 py-2.5 last:border-0 transition-colors", !n.read && "bg-primary/[0.04]")}>
                    <div className="flex cursor-pointer items-start gap-2.5"
                      onClick={() => handleNotificationClick(n)}>
                      <NIcon type={n.type} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-[11px] leading-snug",
                            !n.read ? "font-medium text-foreground" : "text-foreground/80")}>
                            {n.title}
                          </p>
                          <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                          {n.message}
                        </p>
                      </div>
                      {!n.read && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>

                    {/* Approval actions */}
                    {n.type === "APPROVAL_REQUIRED" && n.contract_id && (
                      <div className="mt-2 flex items-center gap-2 pl-6">
                        <Button size="sm"
                          className="h-6 gap-1 font-mono text-[9px] uppercase tracking-widest"
                          disabled={approving === n.contract_id || rejecting === n.contract_id}
                          onClick={(e) => { e.stopPropagation(); handleApprove(n); }}>
                          {approving === n.contract_id
                            ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            : <Check className="h-2.5 w-2.5" />}
                          Approve
                        </Button>
                        <Button size="sm" variant="outline"
                          className="h-6 gap-1 border-destructive/40 font-mono text-[9px] uppercase tracking-widest text-destructive hover:bg-destructive/10"
                          disabled={approving === n.contract_id || rejecting === n.contract_id}
                          onClick={(e) => { e.stopPropagation(); handleReject(n); }}>
                          {rejecting === n.contract_id
                            ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            : <X className="h-2.5 w-2.5" />}
                          Reject
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="h-6 gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                          disabled={fetchingDoc === n.contract_id}
                          onClick={(e) => { e.stopPropagation(); handleViewDocument(n.contract_id!); }}>
                          {fetchingDoc === n.contract_id
                            ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            : <FileText className="h-2.5 w-2.5" />}
                          Document
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Theme toggle footer */}
        <div className="border-t border-border bg-background/40 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {useUiStore.getState().theme === "dark"
                ? <Moon className="h-3 w-3" />
                : <Sun className="h-3 w-3" />}
              Interface Theme
            </span>
            <ThemeToggle />
          </div>
        </div>

        {/* Session footer */}
        <div className="flex items-center justify-between border-t border-border bg-background/40 px-3 py-2">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Activity className="h-3 w-3 text-success" />
            Session active
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onLogout}
            className="h-7 px-2 font-mono text-[10px] uppercase tracking-widest">
            <LogOut className="h-3 w-3" /> Sign out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Profile editor (self-service · all profile fields except role) ───────────

function ProfileEditor() {
  const operator   = useOperator((s) => s.operator);
  const setProfile = useOperator((s) => s.setProfile);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const clean = (v?: string) => (v && v !== "—" ? v : "");
  const [form, setForm] = useState({
    fullName:     operator?.fullName ?? "",
    organization: clean(operator?.organization),
    country:      clean(operator?.country),
    state:        operator?.state ?? "",
    city:         clean(operator?.city),
  });

  if (!operator) return null;

  const handleSave = async () => {
    if (!form.fullName.trim()) { toast.error("Full name is required."); return; }
    setSaving(true);
    try {
      await apiUpdateProfile({
        full_name:    form.fullName,
        organization: form.organization,
        country:      form.country,
        state:        form.state,
        city:         form.city,
      });
      setProfile({
        fullName:     form.fullName.trim(),
        organization: form.organization.trim() || "—",
        country:      form.country.trim() || "—",
        state:        form.state.trim() || undefined,
        city:         form.city.trim() || "—",
      });
      toast.success("Profile updated.");
      setEditing(false);
    } catch (err) {
      toast.error((err as Error).message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}
        className="h-7 w-full font-mono text-[10px] uppercase tracking-widest">
        <Pencil className="mr-1.5 h-3 w-3" /> Edit Profile
      </Button>
    );
  }

  const fields: [keyof typeof form, string][] = [
    ["fullName", "Full Name"],
    ["organization", "Organization"],
    ["country", "Country"],
    ["state", "State (UF)"],
    ["city", "City"],
  ];

  return (
    <div className="space-y-2 rounded-md border border-border bg-background/40 p-2.5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Edit Profile
      </div>
      {fields.map(([k, label]) => (
        <div key={k} className="space-y-1">
          <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
            {label}
          </label>
          <Input
            value={form[k]}
            onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
            className="h-7 text-xs"
            disabled={saving}
          />
        </div>
      ))}
      <p className="font-mono text-[9px] text-muted-foreground/60">
        Email, password, phone and roles are managed in their own sections.
      </p>
      <div className="flex justify-end gap-2 pt-0.5">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}
          className="h-7 font-mono text-[10px] uppercase tracking-widest">Cancel</Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}
          className="h-7 font-mono text-[10px] uppercase tracking-widest">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}{label}
      </div>
      <div className={`mt-0.5 truncate text-xs ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-[11px] ${tone === "success" ? "text-success" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function EmailVerificationBanner({ verified }: { verified: boolean }) {
  const [sending, setSending] = useState(false);
  const setEmailVerified = useOperator((s) => s.setEmailVerified);

  if (verified) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5">
        <MailCheck className="h-3.5 w-3.5 text-success" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-success">Email verified</span>
      </div>
    );
  }

  const handleResend = async () => {
    setSending(true);
    try {
      const res = await apiResendVerification();
      if (res.already_verified) {
        setEmailVerified(true);
        toast.success("Email already verified!");
      } else {
        toast.success("Verification email sent — check your inbox.");
      }
    } catch (err) {
      toast.error((err as Error).message || "Failed to send verification email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-warning">Email not verified</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Verify your email to appear on the Operational Grid and enable full settlement capabilities.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={handleResend} disabled={sending}
        className="mt-2 h-7 w-full font-mono text-[10px] uppercase tracking-widest">
        {sending ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Mail className="mr-1.5 h-3 w-3" />}
        {sending ? "Sending…" : "Send Verification Email"}
      </Button>
    </div>
  );
}

function PhoneVerificationBanner({ verified, hasPhone, emailVerified }: { verified: boolean; hasPhone: boolean; emailVerified: boolean }) {
  const [sending, setSending]   = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode]         = useState("");
  const [verifying, setVerifying] = useState(false);
  const setPhoneVerified = useOperator((s) => s.setPhoneVerified);

  if (verified) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5">
        <PhoneCall className="h-3.5 w-3.5 text-success" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-success">Phone verified</span>
      </div>
    );
  }

  if (!emailVerified) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1.5">
        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Phone verification · Verify email first
        </span>
      </div>
    );
  }

  if (!hasPhone) return <PhoneRegisterForm />;

  const handleSendCode = async () => {
    setSending(true);
    try {
      const res = await apiSendPhoneCode();
      if (res.already_verified) {
        setPhoneVerified(true);
        toast.success("Phone already verified!");
      } else {
        setCodeSent(true);
        if (res.dev_code) {
          // WhatsApp sandbox fallback — show code directly so operators can test
          toast.info(`[DEV] OTP provider unavailable. Your code: ${res.dev_code}`, {
            duration: 60000,
            description: "This message only appears in development when no provider is configured.",
          });
        } else {
          toast.success("Verification code sent to your phone.");
        }
      }
    } catch (err) {
      toast.error((err as Error).message || "Failed to send code.");
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (!code.trim()) return;
    setVerifying(true);
    try {
      await apiVerifyPhoneCode(code.trim());
      setPhoneVerified(true);
      toast.success("Phone verified successfully!");
      setCodeSent(false);
      setCode("");
    } catch (err) {
      toast.error((err as Error).message || "Invalid code.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5">
      <div className="flex items-center gap-2">
        <Phone className="h-3.5 w-3.5 text-warning" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-warning">Phone not verified</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Verify your phone to be visible to other participants and enable settlements.
      </p>
      {!codeSent ? (
        <Button type="button" variant="outline" size="sm" onClick={handleSendCode} disabled={sending}
          className="mt-2 h-7 w-full font-mono text-[10px] uppercase tracking-widest">
          {sending ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Phone className="mr-1.5 h-3 w-3" />}
          {sending ? "Sending…" : "Send Verification Code"}
        </Button>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000" maxLength={6}
              className="h-7 flex-1 text-center font-mono text-sm tracking-[0.3em]" />
            <Button type="button" variant="outline" size="sm" onClick={handleVerify}
              disabled={verifying || code.length < 6}
              className="h-7 px-3 font-mono text-[10px] uppercase tracking-widest">
              {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify"}
            </Button>
          </div>
          <button type="button" onClick={handleSendCode} disabled={sending}
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary">
            Resend code
          </button>
        </div>
      )}
    </div>
  );
}

function PhoneRegisterForm() {
  const [phone, setPhoneInput] = useState("");
  const [saving, setSaving]    = useState(false);
  const setPhone = useOperator((s) => s.setPhone);

  const handleSave = async () => {
    const clean = phone.replace(/[^\d+]/g, "");
    if (clean.length < 8) { toast.error("Enter a valid phone number (min 8 digits)."); return; }
    setSaving(true);
    try {
      await apiUpdatePhone(clean);
      setPhone(clean);
      toast.success("Phone number saved. You can now verify it.");
    } catch (err) {
      toast.error((err as Error).message || "Failed to save phone.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5">
      <div className="flex items-center gap-2">
        <Phone className="h-3.5 w-3.5 text-warning" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-warning">No phone registered</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Add your phone number to proceed with verification.</p>
      <div className="mt-2 flex gap-2">
        <Input value={phone} onChange={(e) => setPhoneInput(e.target.value)}
          placeholder="+55 24 99999-0000" className="h-7 flex-1 font-mono text-xs" />
        <Button type="button" variant="outline" size="sm" onClick={handleSave}
          disabled={saving || phone.replace(/[^\d+]/g, "").length < 8}
          className="h-7 px-3 font-mono text-[10px] uppercase tracking-widest">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const theme    = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  return (
    <div className="flex gap-1">
      {(["dark", "light"] as Theme[]).map((t) => (
        <button key={t} type="button" onClick={() => setTheme(t)}
          className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-[9px] uppercase tracking-widest transition ${
            theme === t
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          }`}>
          {t === "dark" ? <Moon className="h-2.5 w-2.5" /> : <Sun className="h-2.5 w-2.5" />}
          {t}
        </button>
      ))}
    </div>
  );
}
