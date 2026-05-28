/**
 * TransactionSigningModal — USER_CONTROLLED wallet local signing.
 *
 * Security guarantees:
 * - Secret key is kept only in component-local state (React `useState`).
 * - It is NEVER sent to any API, stored in Zustand, localStorage or sessionStorage.
 * - On sign: key is used to sign the XDR in memory, then the state is cleared immediately.
 * - On cancel: state is cleared immediately.
 * - The signed XDR (not the secret) is forwarded to the parent via `onSigned`.
 */

import { useState } from "react";
import { Keypair, TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, KeyRound, Lock, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

export type TransactionSigningModalProps = {
  open: boolean;
  /** Unsigned XDR string received from /api/settlement/prepare */
  unsignedXdr: string;
  settlementId: string;
  /** Called with the signed XDR once the user confirms — secret already cleared */
  onSigned: (signedXdr: string) => void;
  onCancel: () => void;
};

export function TransactionSigningModal({
  open,
  unsignedXdr,
  settlementId,
  onSigned,
  onCancel,
}: TransactionSigningModalProps) {
  const [secretInput, setSecretInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const secretValid =
    secretInput.trim().startsWith("S") && secretInput.trim().length === 56;

  const clearAndCancel = () => {
    setSecretInput("");
    setShowSecret(false);
    setError(null);
    onCancel();
  };

  const handleSign = async () => {
    if (!secretValid) {
      setError("Enter a valid 56-character Stellar secret key (starts with S).");
      return;
    }
    setSigning(true);
    setError(null);
    try {
      // Parse the unsigned XDR with the Stellar SDK
      const keypair = Keypair.fromSecret(secretInput.trim());
      const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.PUBLIC);

      // Sign locally — secret key never leaves this function scope
      tx.sign(keypair);
      const signedXdr = tx.toXDR();

      // Clear secret immediately — before any async work
      setSecretInput("");
      setShowSecret(false);

      onSigned(signedXdr);
    } catch (err) {
      setSecretInput("");
      setShowSecret(false);
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to sign transaction. Check your secret key.";
      setError(msg);
      toast.error("Signing failed — secret key cleared.");
    } finally {
      setSigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) clearAndCancel(); }}>
      <DialogContent className="max-w-md border-border bg-card">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
              <KeyRound className="h-3.5 w-3.5" />
            </div>
            <DialogTitle className="font-mono text-sm uppercase tracking-widest">
              Sign Transaction
            </DialogTitle>
          </div>
          <DialogDescription className="text-[11px] text-muted-foreground">
            This wallet requires local signing. Enter your Stellar secret key to sign and broadcast
            the transaction. Your secret is never transmitted or stored.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Settlement ID reference */}
          <div className="rounded-md border border-border bg-background/40 px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Settlement Reference
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-foreground">{settlementId}</div>
          </div>

          {/* Security notice */}
          <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-2.5">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="font-mono text-[10px] text-muted-foreground">
              Your secret key is used only to sign the transaction in memory. It is cleared
              immediately after signing and is never sent to the EnergyPay backend or stored anywhere.
            </p>
          </div>

          {/* Secret key input */}
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Secret Key (S…)
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
              </span>
              <Input
                type={showSecret ? "text" : "password"}
                value={secretInput}
                onChange={(e) => {
                  setSecretInput(e.target.value.trim());
                  setError(null);
                }}
                placeholder="SABC… · 56 characters"
                className="h-9 pl-8 pr-9 font-mono text-xs tracking-widest"
                maxLength={58}
                autoComplete="off"
                autoFocus
                spellCheck={false}
                disabled={signing}
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showSecret ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            {secretInput && !secretValid && (
              <p className="font-mono text-[10px] text-destructive">
                Must be a 56-character Stellar secret key starting with S
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
              <p className="font-mono text-[10px] text-destructive">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={clearAndCancel}
              disabled={signing}
              className="flex-1 font-mono text-[10px] uppercase tracking-widest"
            >
              <X className="h-3 w-3" />
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSign}
              disabled={!secretValid || signing}
              className="flex-1 font-mono text-[10px] uppercase tracking-widest"
            >
              {signing ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Signing…
                </>
              ) : (
                <>
                  <KeyRound className="h-3 w-3" />
                  Sign &amp; Broadcast
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
