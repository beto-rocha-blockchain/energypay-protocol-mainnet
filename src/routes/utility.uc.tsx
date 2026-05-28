import { createFileRoute } from "@tanstack/react-router";
import { MapPinned, CheckCircle, Clock, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiGetUtilityUC } from "@/lib/api";
import { maskAddress, ROLE_COLORS, sortRoles, type ParticipantRole } from "@/store/operator";

export const Route = createFileRoute("/utility/uc")({
  component: UtilityUCPage,
});

function UtilityUCPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await apiGetUtilityUC();
        setUsers(res.users ?? []);
      } catch (err) {
        toast.error(`Failed to load UC registry: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const verified = users.filter((u) => u.emailVerified || u.email_verified).length;
  const pending = users.length - verified;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MapPinned className="h-5 w-5 text-orange-400" />
        <h1 className="font-mono text-sm uppercase tracking-widest text-orange-400">
          Consumer Registry — UTL-01
        </h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-orange-400/20 bg-orange-400/5 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Total UCs</p>
          <p className="mt-1 font-mono text-2xl text-orange-400">{loading ? "—" : users.length}</p>
        </Card>
        <Card className="border-green-400/20 bg-green-400/5 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Verified</p>
          <p className="mt-1 font-mono text-2xl text-green-400">{loading ? "—" : verified}</p>
        </Card>
        <Card className="border-yellow-400/20 bg-yellow-400/5 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Pending</p>
          <p className="mt-1 font-mono text-2xl text-yellow-400">{loading ? "—" : pending}</p>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-border bg-background overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-mono text-xs uppercase tracking-widest">Loading…</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center p-12">
            <p className="font-mono text-xs text-muted-foreground">
              No UCs registered. Consumer and Utility operators will appear here.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">Organization</th>
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">City</th>
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">Country</th>
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">Roles</th>
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => {
                const roles: ParticipantRole[] = sortRoles(Array.isArray(user.roles) ? user.roles : []) as ParticipantRole[];
                const isVerified = user.emailVerified || user.email_verified || user.phoneVerified || user.phone_verified;
                return (
                  <tr key={user.id ?? i} className="border-b border-border/50 hover:bg-orange-400/5">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{user.organization || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{user.city || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{user.country || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {roles.length === 0 ? (
                          <span className="font-mono text-xs text-muted-foreground">—</span>
                        ) : (
                          roles.map((role) => {
                            const c = ROLE_COLORS[role];
                            return (
                              <span
                                key={role}
                                className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${c?.border ?? "border-border"} ${c?.bg ?? "bg-muted/10"} ${c?.text ?? "text-muted-foreground"}`}
                              >
                                {role}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isVerified ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-green-400">
                          <CheckCircle className="h-3 w-3" /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-yellow-400">
                          <Clock className="h-3 w-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {maskAddress(user.stellar_public_key || user.settlementAddress || "")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
