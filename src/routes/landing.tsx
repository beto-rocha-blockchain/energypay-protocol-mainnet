/**
 * /landing — public institutional landing page for EnergyPay (Desafio 2).
 *
 * PUBLIC: no authentication required. Registered in the root `isPublicRoute`
 * allow-list so it renders full-screen (no operator sidebar/chrome) and is not
 * redirected to /login.
 *
 * This page is purely presentational — it makes NO authenticated API calls and
 * does NOT touch wallet, settlement, custody, billing or mainnet flows. The CTA
 * links to the main mainnet application ("/"), which the root guard bounces to
 * /login for logged-out visitors.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Activity,
  Zap,
  ShieldCheck,
  ShieldOff,
  AlertTriangle,
  Clock,
  Layers,
  Landmark,
  Terminal,
  Send,
  Code2,
  Wallet,
  Scale,
  Radio,
  FileSearch,
  Globe,
  Coins,
  Link2,
  Factory,
  ShoppingCart,
  Building2,
  LineChart,
  Plug,
  Hash,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BrandBadge, BrandName } from "@/components/BrandLogo";
import { STELLAR_NETWORK_LABEL } from "@/lib/stellar";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "EnergyPay — Programmable financial rail for electricity markets" },
      {
        name: "description",
        content:
          "EnergyPay is a programmable settlement and reconciliation infrastructure for electricity markets, executing auditable settlements on Stellar Mainnet.",
      },
      { property: "og:title", content: "EnergyPay — Programmable financial rail for electricity markets" },
      {
        property: "og:description",
        content:
          "Programmable settlement and reconciliation infrastructure for electricity markets on Stellar Mainnet.",
      },
    ],
  }),
  component: LandingPage,
});

/** Main mainnet app. Auth-gated at the root → logged-out visitors land on /login. */
const PLATFORM_URL = "/";
const EXPLORER_PUBLIC = "https://stellar.expert/explorer/public";

const PRIMARY_CTA =
  "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 font-mono text-xs font-medium uppercase tracking-widest text-primary-foreground transition hover:bg-primary/90";
const OUTLINE_CTA =
  "inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card/40 px-5 py-2.5 font-mono text-xs uppercase tracking-widest text-foreground transition hover:border-primary/40 hover:bg-primary/5";

// ── small building blocks ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/80">{children}</p>;
}

function FeatureCard({
  icon: Icon,
  title,
  children,
  tag,
  roadmap,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  tag?: string;
  roadmap?: boolean;
}) {
  return (
    <Card className="flex h-full flex-col border-border bg-card/60 p-5 transition-colors hover:border-primary/30">
      <div className="mb-3 flex items-center justify-between">
        <div className="rounded-md border border-border bg-background/60 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        {roadmap ? (
          <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground/70">
            Roadmap
          </span>
        ) : tag ? (
          <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground/60">{tag}</span>
        ) : null}
      </div>
      <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{children}</p>
    </Card>
  );
}

// ── page ───────────────────────────────────────────────────────────────────────

function LandingPage() {
  return (
    <div className="min-h-screen w-full text-foreground">
      {/* Fixed background image — stays behind the page while the content scrolls over it */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: "url(/grid-bg.jpg)" }}
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-background/70" />
      {/* ── Top nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <BrandBadge size="md" />
            <div className="leading-tight">
              <BrandName size="md" />
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                Programmable Pre-Clearing &amp; Settlement Infrastructure
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {STELLAR_NETWORK_LABEL}
              </span>
            </span>
            <Link to={PLATFORM_URL} className={PRIMARY_CTA}>
              Launch Mainnet Platform <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── 1 · Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 60% at 50% -10%, oklch(0.78 0.14 215 / 0.10), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 py-20 text-center md:py-28">
          <Badge
            variant="outline"
            className="mb-6 border-success/40 bg-success/10 font-mono text-[10px] uppercase tracking-widest text-success"
          >
            <Activity className="mr-1.5 h-3 w-3" /> Live on {STELLAR_NETWORK_LABEL}
          </Badge>

          <h1 className="mx-auto max-w-4xl font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            Programmable financial rail
            <br />
            <span className="text-primary">for electricity markets</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            EnergyPay is a programmable settlement and reconciliation infrastructure for electricity
            markets. It helps generators, sellers, utilities, investors and consumers register
            bilateral energy obligations, manage counterparty risk, and execute auditable settlements
            on {STELLAR_NETWORK_LABEL}.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to={PLATFORM_URL} className={PRIMARY_CTA}>
              Launch Mainnet Platform <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/register" className={OUTLINE_CTA}>
              Provision settlement identity
            </Link>
          </div>

          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
            {[
              { k: "Finality", v: "~5s", s: "Stellar ledger close" },
              { k: "Network", v: "PUBLIC", s: "Mainnet · Horizon" },
              { k: "Settlement asset", v: "EPWR", s: "Tokenized energy" },
              { k: "Audit", v: "txHash", s: "Publicly verifiable" },
            ].map((m) => (
              <div key={m.k} className="bg-card px-4 py-5">
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{m.k}</p>
                <p className="mt-1 font-display text-lg font-semibold text-foreground">{m.v}</p>
                <p className="font-mono text-[9px] text-muted-foreground/70">{m.s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product video ───────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-card/20">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <div className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground/70">
              Demo
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold md:text-3xl">
              See EnergyPay in action
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              A walkthrough of programmable pre-clearing and settlement of bilateral
              energy contracts on {STELLAR_NETWORK_LABEL}.
            </p>
          </div>
          <div className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-xl border border-border bg-background/40 shadow-lg">
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                src="https://drive.google.com/file/d/1LT8rV_N1KavR8iABE1BbxantPwqP-DHv/preview"
                title="EnergyPay — Product Video"
                allow="autoplay; fullscreen"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2 · Problem ─────────────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <SectionLabel>The Problem</SectionLabel>
            <h2 className="mt-2 font-display text-2xl font-semibold md:text-3xl">
              Energy settlement is fragmented, manual and hard to audit.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Bilateral power contracts are reconciled across disconnected systems, with no shared,
              verifiable source of truth between counterparties and regulators.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={Layers} title="Fragmented reconciliation">
              Obligations live across spreadsheets, ERPs and bank statements that rarely agree.
            </FeatureCard>
            <FeatureCard icon={ShieldOff} title="Counterparty risk">
              Bilateral exposure and default risk with no common ledger between parties.
            </FeatureCard>
            <FeatureCard icon={Clock} title="Slow, manual settlement">
              Clearing cycles take days, with manual transfers and opaque status.
            </FeatureCard>
            <FeatureCard icon={AlertTriangle} title="No verifiable audit trail">
              Auditors and regulators cannot independently confirm who settled what, and when.
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* ── 3 · Solution ────────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-card/20">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <SectionLabel>The Solution</SectionLabel>
            <h2 className="mt-2 font-display text-2xl font-semibold md:text-3xl">
              One programmable rail from obligation to on-chain finality.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              EnergyPay turns bilateral energy obligations into programmable settlement instructions,
              executes them on {STELLAR_NETWORK_LABEL}, and reconciles automatically against the
              resulting on-chain receipts — giving every counterparty the same verifiable truth.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={PLATFORM_URL} className={PRIMARY_CTA}>
                Launch Mainnet Platform <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Layers, t: "Register obligations", d: "Capture bilateral energy contracts as structured, programmable settlement terms." },
              { icon: Scale, t: "Manage counterparty risk", d: "Netting, clearing and exposure supervision across market roles." },
              { icon: Send, t: "Execute on Stellar", d: "Deterministic settlement with ~5s finality on the public network." },
              { icon: ShieldCheck, t: "Reconcile & audit", d: "Auto-match settlements to on-chain receipts with an immutable trail." },
            ].map((x) => (
              <Card key={x.t} className="border-border bg-card/60 p-4">
                <x.icon className="h-4 w-4 text-primary" />
                <h3 className="mt-2.5 font-display text-sm font-semibold">{x.t}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{x.d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4 · Product Modules ─────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <SectionLabel>Product Modules</SectionLabel>
            <h2 className="mt-2 font-display text-2xl font-semibold md:text-3xl">
              A full clearing &amp; settlement operating system.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Composable modules covering treasury, settlement execution, custody, clearing,
              market data and audit.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={Landmark} title="Treasury & Rails" tag="STL-01">
              Treasury balances, settlement rails and liquidity routing.
            </FeatureCard>
            <FeatureCard icon={Terminal} title="Settlement Console" tag="STL-02">
              Operate, monitor and reconcile settlement batches in real time.
            </FeatureCard>
            <FeatureCard icon={Send} title="Direct Settlement" tag="STL-03">
              Execute bilateral transfers with ~5s Stellar finality.
            </FeatureCard>
            <FeatureCard icon={Code2} title="x402 API Access" tag="STL-04">
              Machine-to-machine payments (x402) for metered, pay-per-call access to market-data and oracle APIs.
            </FeatureCard>
            <FeatureCard icon={Wallet} title="Custody Wallet" tag="STL-05">
              Platform-managed or user-controlled Stellar settlement accounts.
            </FeatureCard>
            <FeatureCard icon={Scale} title="Clearing & Risk" roadmap>
              Counterparty netting, exposure limits and clearing supervision.
            </FeatureCard>
            <FeatureCard icon={Radio} title="Oracle & Market Data" tag="RSK-02">
              Reference price feeds (PLD / market rates) for settlement.
            </FeatureCard>
            <FeatureCard icon={FileSearch} title="Audit & Compliance" tag="EXE-02">
              Immutable audit trail and regulatory reporting readiness.
            </FeatureCard>
            <FeatureCard icon={Coins} title="Billing & Subscriptions">
              Plan billing via PIX, card and crypto (XLM / USDC), isolated from settlement.
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* ── 5 · Stellar Mainnet Integration ─────────────────────────────────── */}
      <section className="border-b border-border bg-card/20">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <SectionLabel>Stellar Mainnet Integration</SectionLabel>
            <h2 className="mt-2 font-display text-2xl font-semibold md:text-3xl">
              Anchored to the public Stellar network.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Settlement is executed on {STELLAR_NETWORK_LABEL} (PUBLIC) through Horizon. Energy
              obligations settle in <span className="font-mono text-foreground">EPWR</span>, a tokenized
              settlement asset secured by trustlines, while{" "}
              <span className="font-mono text-foreground">XLM</span> covers network reserve and
              operational gas. Each settlement closes with deterministic finality and a public receipt.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                { icon: Globe, k: "Network", v: "STELLAR_MAINNET" },
                { icon: Link2, k: "Horizon", v: "horizon.stellar.org" },
                { icon: Zap, k: "Finality", v: "~5 seconds" },
                { icon: Coins, k: "Assets", v: "EPWR · XLM" },
              ].map((x) => (
                <div key={x.k} className="flex items-center gap-2.5 rounded-md border border-border bg-card/60 px-3 py-2.5">
                  <x.icon className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">{x.k}</p>
                    <p className="truncate font-mono text-[11px] text-foreground">{x.v}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Network status panel */}
          <Card className="overflow-hidden border-border bg-card/70">
            <div className="flex items-center justify-between border-b border-border bg-background/40 px-4 py-2.5">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> Settlement Rail · Connected
              </div>
              <span className="font-mono text-[10px] text-success">ONLINE</span>
            </div>
            <div className="space-y-3 p-5">
              {[
                { k: "Active network", v: STELLAR_NETWORK_LABEL },
                { k: "Settlement asset", v: "EPWR · tokenized energy receivable" },
                { k: "Network reserve / gas", v: "XLM" },
                { k: "Machine payments", v: "x402 (pay-per-call API)" },
                { k: "Receipt", v: "txHash + ledger + Stellar Expert" },
              ].map((r) => (
                <div key={r.k} className="flex items-center justify-between gap-4 border-b border-border/50 pb-2.5 last:border-0 last:pb-0">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{r.k}</span>
                  <span className="text-right font-mono text-[11px] text-foreground">{r.v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* ── 6 · Target Users ────────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <SectionLabel>Target Users</SectionLabel>
            <h2 className="mt-2 font-display text-2xl font-semibold md:text-3xl">
              Built for every role in the power market.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <FeatureCard icon={Factory} title="Generators">
              Distribute generated energy assets and settle production obligations.
            </FeatureCard>
            <FeatureCard icon={ShoppingCart} title="Sellers / Traders">
              Register sell-side contracts and clear positions with auditable finality.
            </FeatureCard>
            <FeatureCard icon={Building2} title="Utilities">
              Reconcile distribution obligations, connections and consumption units.
            </FeatureCard>
            <FeatureCard icon={LineChart} title="Investors">
              Track tokenized energy receivables and settlement-backed positions.
            </FeatureCard>
            <FeatureCard icon={Plug} title="Consumers">
              Settle consumption obligations against transparent on-chain receipts.
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* ── 7 · Auditability ────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-card/20">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <SectionLabel>Auditability</SectionLabel>
            <h2 className="mt-2 font-display text-2xl font-semibold md:text-3xl">
              Every settlement is independently verifiable.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              EnergyPay does not ask anyone to trust its books. Each settlement produces a Stellar{" "}
              <span className="font-mono text-foreground">transaction hash</span> and{" "}
              <span className="font-mono text-foreground">ledger</span> number that any counterparty,
              auditor or regulator can verify on the public explorer — no EnergyPay account required.
            </p>

            <ul className="mt-6 space-y-2.5">
              {[
                "Deterministic txHash for each executed settlement",
                "Confirmed ledger sequence on the public network",
                "Source / destination accounts and asset amounts",
                "One-click verification on Stellar Expert (public / mainnet)",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Example settlement receipt */}
          <Card className="overflow-hidden border-border bg-card/70">
            <div className="flex items-center justify-between border-b border-border bg-background/40 px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Settlement Receipt · Example
              </span>
              <Badge
                variant="outline"
                className="border-success/40 bg-success/10 font-mono text-[8px] uppercase tracking-widest text-success"
              >
                Settled
              </Badge>
            </div>
            <div className="space-y-3 p-5 font-mono">
              {[
                { icon: Coins, k: "Asset", v: "EPWR" },
                { icon: Hash, k: "Tx Hash", v: "a1b2c3…e9f0 (example)" },
                { icon: Layers, k: "Ledger", v: "#54,210,887" },
                { icon: Globe, k: "Network", v: STELLAR_NETWORK_LABEL },
              ].map((r) => (
                <div key={r.k} className="flex items-center justify-between gap-4 border-b border-border/50 pb-2.5 last:border-0 last:pb-0">
                  <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <r.icon className="h-3.5 w-3.5 text-primary" /> {r.k}
                  </span>
                  <span className="text-right text-[11px] text-foreground">{r.v}</span>
                </div>
              ))}
              <a
                href={EXPLORER_PUBLIC}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-background/40 py-2 text-[10px] uppercase tracking-widest text-primary transition hover:border-primary/40 hover:bg-primary/5"
              >
                Verify on Stellar Expert <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </Card>
        </div>
      </section>

      {/* ── 8 · Call to Action ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 80% at 50% 120%, oklch(0.78 0.14 215 / 0.12), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 py-24 text-center">
          <BrandBadge size="lg" style={{ width: 72, height: 72, margin: "0 auto" }} />
          <h2 className="mt-6 font-display text-3xl font-bold leading-tight md:text-4xl">
            Settle energy markets on a rail you can audit.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
            Launch the live EnergyPay platform running on {STELLAR_NETWORK_LABEL} and execute your
            first auditable settlement.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to={PLATFORM_URL} className={PRIMARY_CTA}>
              Launch Mainnet Platform <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/register" className={OUTLINE_CTA}>
              Provision settlement identity
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <BrandBadge size="sm" />
            <div className="leading-tight">
              <BrandName size="sm" />
              <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-muted-foreground">
                Programmable financial rail for electricity markets
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1.5 text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> {STELLAR_NETWORK_LABEL}
            </span>
            <Separator orientation="vertical" className="h-3 bg-border" />
            <Link to={PLATFORM_URL} className="transition hover:text-primary">
              Platform
            </Link>
            <a href={EXPLORER_PUBLIC} target="_blank" rel="noopener noreferrer" className="transition hover:text-primary">
              Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
