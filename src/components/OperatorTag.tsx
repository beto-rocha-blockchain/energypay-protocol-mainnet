/**
 * OperatorTag — transparency disclosure badge for platform-operator accounts.
 *
 * Render this next to ANY counterparty / participant identity (P2P, contracts,
 * grid, audit, receipts). It shows nothing for normal accounts and a clear
 * "Platform Operator" tag for operator accounts (identified by the ADMIN role
 * via isOperatorAccount), disclosing that the account is operated by EnergyPay
 * and may participate in the market.
 *
 * This is a governance / conflict-of-interest safeguard: operator participation
 * is allowed but always disclosed, and every operator settlement is publicly
 * verifiable on Stellar Mainnet.
 */

import { ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { isOperatorAccount } from "@/store/operator";

const DISCLOSURE =
  "Account operated by EnergyPay. It may participate in the market; all of its " +
  "settlements are publicly verifiable on Stellar Mainnet and reference prices " +
  "(PLD) come from an external oracle.";

export function OperatorTag({
  roles,
  operator,
  className = "",
}: {
  roles?: string[] | null;
  /** Explicit override when the operator status is already known (e.g. a server flag). */
  operator?: boolean;
  className?: string;
}) {
  if (!(operator ?? isOperatorAccount(roles))) return null;

  return (
    <Badge
      variant="outline"
      title={DISCLOSURE}
      className={`border-emerald-400/40 bg-emerald-400/10 font-mono text-[8px] uppercase tracking-widest text-emerald-400 ${className}`}
    >
      <ShieldAlert className="mr-1 h-2.5 w-2.5" /> Platform Operator
    </Badge>
  );
}
