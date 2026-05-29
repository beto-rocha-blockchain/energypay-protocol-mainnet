/**
 * RequireRole — client-side route guard for role-restricted areas.
 *
 * Renders its children only if the authenticated operator holds at least one of
 * the required participant roles. The matching sidebar section is already hidden
 * for users without the role (see AppSidebar `filterItemsByRole`); this guard
 * additionally blocks DIRECT URL access to the route.
 *
 *   · Not authenticated      → redirect to /login.
 *   · Missing required role  → a clear "access restricted" panel.
 */

import { Navigate, Link } from "@tanstack/react-router";
import { ShieldAlert, ArrowLeft } from "lucide-react";

import { useOperator, type ParticipantRole } from "@/store/operator";
import { Card } from "@/components/ui/card";

export function RequireRole({
  role,
  children,
}: {
  role: ParticipantRole | ParticipantRole[];
  children: React.ReactNode;
}) {
  const isAuthenticated = useOperator((s) => s.isAuthenticated);
  const operator = useOperator((s) => s.operator);

  if (!isAuthenticated || !operator) return <Navigate to="/login" />;

  const required = Array.isArray(role) ? role : [role];
  const allowed = (operator.roles ?? []).some((r) => required.includes(r as ParticipantRole));

  if (!allowed) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-md border-border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-7 w-7 text-warning" />
          <h1 className="font-display text-lg font-semibold">Access restricted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This area is available only to operators holding the{" "}
            <span className="font-mono text-foreground">{required.join(" / ")}</span> role.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-foreground transition hover:border-primary/40 hover:bg-primary/5"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
          </Link>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
