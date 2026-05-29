import { createFileRoute } from "@tanstack/react-router";
import { Network, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiGetUtilityConnections } from "@/lib/api";
import { RequireRole } from "@/components/RequireRole";

export const Route = createFileRoute("/utility/connections")({
  component: () => (
    <RequireRole role="UTILITY">
      <UtilityConnectionsPage />
    </RequireRole>
  ),
});

const STATUS_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  DRAFT:    { border: "border-border",        bg: "bg-muted/10",     text: "text-muted-foreground" },
  ACTIVE:   { border: "border-sky-400/50",    bg: "bg-sky-400/10",   text: "text-sky-400" },
  SETTLED:  { border: "border-green-400/50",  bg: "bg-green-400/10", text: "text-green-400" },
  FAILED:   { border: "border-red-400/50",    bg: "bg-red-400/10",   text: "text-red-400" },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${s.border} ${s.bg} ${s.text}`}
    >
      {status}
    </span>
  );
}

function UtilityConnectionsPage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGetUtilityConnections();
        setContracts(res.contracts ?? []);
      } catch (err) {
        toast.error(`Failed to load grid connections: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const active = contracts.filter((c) => c.status === "ACTIVE").length;
  const settled = contracts.filter((c) => c.status === "SETTLED").length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Network className="h-5 w-5 text-orange-400" />
        <h1 className="font-mono text-sm uppercase tracking-widest text-orange-400">
          Grid Connections — UTL-02
        </h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-orange-400/20 bg-orange-400/5 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Total</p>
          <p className="mt-1 font-mono text-2xl text-orange-400">{loading ? "—" : contracts.length}</p>
        </Card>
        <Card className="border-sky-400/20 bg-sky-400/5 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Active</p>
          <p className="mt-1 font-mono text-2xl text-sky-400">{loading ? "—" : active}</p>
        </Card>
        <Card className="border-green-400/20 bg-green-400/5 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Settled</p>
          <p className="mt-1 font-mono text-2xl text-green-400">{loading ? "—" : settled}</p>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-border bg-background overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-mono text-xs uppercase tracking-widest">Loading…</span>
          </div>
        ) : contracts.length === 0 ? (
          <div className="flex items-center justify-center p-12">
            <p className="font-mono text-xs text-muted-foreground">
              No grid connections found. Energy delivery contracts involving UTILITY operators will appear here.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">Contract ID</th>
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">Buyer</th>
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">Seller</th>
                <th className="px-4 py-3 text-right font-mono text-xs uppercase tracking-widest text-muted-foreground">Volume (MWh)</th>
                <th className="px-4 py-3 text-right font-mono text-xs uppercase tracking-widest text-muted-foreground">Price (R$/MWh)</th>
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">Period</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c, i) => {
                const shortId = c.id
                  ? String(c.id).length > 12
                    ? `${String(c.id).slice(0, 8)}…`
                    : String(c.id)
                  : `#${i + 1}`;
                return (
                  <tr key={c.id ?? i} className="border-b border-border/50 hover:bg-orange-400/5">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{shortId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.buyer_label || c.buyer_organization || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.seller_label || c.seller_organization || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-foreground">
                      {c.volume_mwh != null ? Number(c.volume_mwh).toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-foreground">
                      {c.pld_brl != null ? Number(c.pld_brl).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={c.status || "DRAFT"} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {c.period || c.delivery_period || "—"}
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
