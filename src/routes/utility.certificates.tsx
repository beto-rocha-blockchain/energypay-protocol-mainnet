import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/utility/certificates")({
  component: UtilityCertificatesPage,
});

function UtilityCertificatesPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-orange-400" />
        <h1 className="font-mono text-sm uppercase tracking-widest text-orange-400">
          Connection Certificates — UTL-04
        </h1>
      </div>

      {/* Future module banner */}
      <Card className="border-amber-400/40 bg-amber-400/10 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div className="flex flex-col gap-1">
            <p className="font-mono text-sm font-semibold uppercase tracking-widest text-amber-400">
              MÓDULO FUTURO
            </p>
            <p className="font-mono text-xs text-amber-300/80">
              Este módulo faz parte da integração IoT planejada para uma fase futura do EnergyPay.
            </p>
          </div>
        </div>
      </Card>

      {/* Architecture preview */}
      <Card className="border-border bg-background p-6">
        <p className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Architecture Preview
        </p>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="font-mono text-xs text-orange-400">Smart Meter Integration</p>
            <p className="font-mono text-xs text-muted-foreground">
              On-chain certificates proving physical grid connection, issued when a smart meter reports
              successful commissioning.
            </p>
          </div>

          <div className="h-px bg-border" />

          <div className="flex flex-col gap-1">
            <p className="font-mono text-xs text-orange-400">On-Chain Certificate Registry</p>
            <p className="font-mono text-xs text-muted-foreground">
              Each connection certificate is anchored to Stellar Mainnet as an immutable proof of grid
              participation.
            </p>
          </div>

          <div className="h-px bg-border" />

          <div className="flex flex-col gap-1">
            <p className="font-mono text-xs text-orange-400">Automated TUSD Trigger</p>
            <p className="font-mono text-xs text-muted-foreground">
              Smart meter data triggers automatic TUSD settlement when energy delivery is confirmed.
            </p>
          </div>
        </div>
      </Card>

      {/* Footer note */}
      <p className="font-mono text-xs text-muted-foreground/60 text-center">
        Planned for Sprint 6+ · No IoT or WebAssembly dependencies in current sprint
      </p>
    </div>
  );
}
