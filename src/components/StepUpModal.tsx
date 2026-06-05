/**
 * StepUpModal — identity re-confirmation for maximum-security actions.
 *
 * The user re-enters their ACCOUNT PASSWORD; the backend (POST /api/auth/step-up)
 * verifies it and returns a short-lived (5 min) step-up token. The token is
 * handed to the caller via `onConfirmed` and used as the `x-step-up-token`
 * header on the protected request.
 *
 * The password lives only in ephemeral component state and is wiped on close,
 * success and unmount. It is never logged, persisted or sent anywhere except
 * the step-up endpoint.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiStepUp } from "@/lib/api";
import { useT } from "@/lib/i18n";

export function StepUpModal({
  open,
  onOpenChange,
  onConfirmed,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the short-lived step-up token on success. */
  onConfirmed: (stepUpToken: string) => void;
  title?: string;
  description?: string;
}) {
  const t = useT();
  const resolvedTitle = title ?? t("Confirm your identity");
  const resolvedDescription =
    description ??
    t("This is a maximum-security area. Enter your account password to continue.");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Wipe the password whenever the modal is not open.
  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
      setLoading(false);
    } else {
      // Focus the field on open.
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const submit = async () => {
    if (!password) {
      setError(t("Enter your password."));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiStepUp(password);
      setPassword(""); // wipe immediately on success
      onOpenChange(false);
      onConfirmed(res.step_up_token);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(status === 401 ? t("Incorrect password.") : (err as Error).message || t("Confirmation failed."));
      setPassword("");
      toast.error(t("Could not confirm your identity."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {resolvedTitle}
          </DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) submit();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="step-up-password" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("Account password")}
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="step-up-password"
                ref={inputRef}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9"
                disabled={loading}
              />
            </div>
            {error && <p className="font-mono text-[10px] text-destructive">{error}</p>}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
              {t("Cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={loading || !password}>
              {loading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3 w-3" />}
              {t("Confirm")}
            </Button>
          </DialogFooter>
        </form>

        <p className="font-mono text-[9px] leading-relaxed text-muted-foreground/60">
          {t("Your password is used only for this confirmation and is not stored. Authorization expires in 5 minutes.")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
