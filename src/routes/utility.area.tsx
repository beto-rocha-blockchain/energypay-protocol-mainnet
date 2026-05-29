import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiGetUtilityParticipants } from "@/lib/api";
import { maskAddress, ROLE_COLORS } from "@/store/operator";
import { RequireRole } from "@/components/RequireRole";

export const Route = createFileRoute("/utility/area")({
  component: () => (
    <RequireRole role="UTILITY">
      <UtilityAreaPage />
    </RequireRole>
  ),
});

function UtilityAreaPage() {
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGetUtilityParticipants();
        setParticipants(res.participants ?? []);
      } catch (err) {
        toast.error(`Failed to load concession area data: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const utilityColor = ROLE_COLORS.UTILITY;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MapPin className="h-5 w-5 text-orange-400" />
        <h1 className="font-mono text-sm uppercase tracking-widest text-orange-400">
          Concession Area — UTL-05
        </h1>
      </div>

      {/* Description */}
      <Card className="border-orange-400/20 bg-orange-400/5 p-4">
        <p className="font-mono text-xs text-muted-foreground">
          Distribution concession areas registered on the EnergyPay platform.
          Each operator with role{" "}
          <span className="text-orange-400">UTILITY</span> represents a licensed distribution concessionaire.
        </p>
      </Card>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-mono text-xs uppercase tracking-widest">Loading…</span>
        </div>
      ) : participants.length === 0 ? (
        <Card className="flex flex-1 items-center justify-center border-orange-400/20 bg-orange-400/5 p-12">
          <p className="font-mono text-xs text-muted-foreground text-center max-w-md">
            Nenhum operador de distribuição registrado. Operadores com role UTILITY aparecem aqui.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {participants.map((p, i) => (
            <Card
              key={p.id ?? i}
              className="border-orange-400/20 bg-background p-4 hover:bg-orange-400/5 transition-colors"
            >
              <div className="flex flex-col gap-3">
                {/* Organization name */}
                <p className="font-mono text-sm text-foreground truncate">
                  {p.organization || p.fullName || p.full_name || "—"}
                </p>

                {/* Location */}
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <p className="font-mono text-xs truncate">
                    {[p.city, p.country].filter(Boolean).join(", ") || "—"}
                  </p>
                </div>

                {/* Wallet */}
                <p className="font-mono text-xs text-muted-foreground">
                  {maskAddress(p.stellar_public_key || p.settlementAddress || p.wallet?.publicKey || "")}
                </p>

                {/* Role chip */}
                <span
                  className={`self-start inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${utilityColor.border} ${utilityColor.bg} ${utilityColor.text}`}
                >
                  UTILITY
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
