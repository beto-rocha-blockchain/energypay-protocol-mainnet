/**
 * SplashScreen — EnergyPay institutional entry + page-transition animation.
 *
 * Two distinct behaviours, one overlay:
 *
 *   1. Entry (every full page load / reload)
 *      The overlay is born fully opaque on the very first render (including the
 *      SSR HTML), covering the page underneath. The previous route is therefore
 *      NEVER visible — no flash of stale content. Shows the pulsing logo + the
 *      ENERGYPAY wordmark, holds, then fades out to reveal the app.
 *
 *   2. Navigation (in-app route changes, normal use)
 *      On every pathname change the overlay returns with ONLY the pulsing logo
 *      (no words), fading smoothly in and out so the page swap feels seamless.
 *
 * No sessionStorage gate: the entry animation plays on every load/reload by
 * design. prefers-reduced-motion shortens timings and disables the glow pulse
 * (handled in styles.css → .ep-splash-logo).
 */

import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { BrandBadge } from "@/components/BrandLogo";

type Phase = "enter" | "hold" | "exit" | "idle";
type Variant = "full" | "logo";

// Entry splash (full load / reload) — logo + wordmark
const ENTRY_HOLD_MS = 1700; // time fully visible before fading out
const ENTRY_OUT_MS = 700; // fade-out duration

// In-app page transition — pulsing logo only, no words
const NAV_IN_MS = 160; // fade-in
const NAV_HOLD_MS = 180; // fully visible
const NAV_OUT_MS = 420; // fade-out

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function SplashScreen({ children }: { children: React.ReactNode }) {
  // Born "hold" + "full": the first paint (incl. SSR) is the opaque splash
  // overlay covering the page → the previous route never shows (no flash).
  const [phase, setPhase] = useState<Phase>("hold");
  const [variant, setVariant] = useState<Variant>("full");
  const [fadeInMs, setFadeInMs] = useState(0); // entry is born opaque → no fade-in
  const [fadeOutMs, setFadeOutMs] = useState(ENTRY_OUT_MS);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastPathRef = useRef(pathname);
  const entryActiveRef = useRef(true); // true until the entry splash finishes

  // ── Entry splash — plays once per full load / reload ─────────────────────────
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const hold = reduced ? 500 : ENTRY_HOLD_MS;
    const out = reduced ? 200 : ENTRY_OUT_MS;
    setFadeOutMs(out);

    const t1 = setTimeout(() => setPhase("exit"), hold);
    const t2 = setTimeout(() => {
      setPhase("idle");
      entryActiveRef.current = false;
    }, hold + out);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // ── In-app navigation — pulsing logo only, smooth fade in/out ────────────────
  useEffect(() => {
    if (lastPathRef.current === pathname) return; // no real change
    lastPathRef.current = pathname;
    if (entryActiveRef.current) return; // never interrupt / downgrade the entry splash

    const reduced = prefersReducedMotion();
    const inMs = reduced ? 0 : NAV_IN_MS;
    const holdMs = reduced ? 160 : NAV_HOLD_MS;
    const outMs = reduced ? 200 : NAV_OUT_MS;

    setVariant("logo");
    setFadeInMs(inMs);
    setFadeOutMs(outMs);

    let raf = 0;
    if (inMs === 0) {
      setPhase("hold");
    } else {
      setPhase("enter"); // mount at opacity 0…
      raf = requestAnimationFrame(() => setPhase("hold")); // …then fade in next frame
    }

    const t1 = setTimeout(() => setPhase("exit"), inMs + holdMs);
    const t2 = setTimeout(() => setPhase("idle"), inMs + holdMs + outMs);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname]);

  return (
    <>
      {/* App content renders normally underneath — routing/auth/hydration proceed. */}
      {children}

      {phase !== "idle" && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "oklch(0.10 0.018 252)",
            opacity: phase === "hold" ? 1 : 0,
            transition:
              (phase === "exit" ? fadeOutMs : phase === "hold" ? fadeInMs : 0)
                ? `opacity ${phase === "exit" ? fadeOutMs : fadeInMs}ms cubic-bezier(0.2, 0.7, 0.2, 1)`
                : "none",
            pointerEvents: phase === "exit" ? "none" : "all",
            // The splash background is always dark — pin brand vars to dark-mode
            // values so colors are correct regardless of the user's selected theme.
            ["--brand-energy-color" as string]: "#F2F2F2", // near-white "ENERGY"
            ["--brand-pay-color" as string]: "#66E619", // brand lime-green "PAY"
            ["--brand-bolt-start" as string]: "#66E619", // lime-green — bolt top
            ["--brand-bolt-end" as string]: "#00C8EE", // cyan — bolt bottom
            ["--brand-ring-color" as string]: "rgba(255,255,255,0.95)", // bold white ring
            ["--brand-ring-width" as string]: "7", // thicker ring at splash scale
            ["--brand-disc" as string]: "#070d1a", // dark navy disc
            ["--brand-badge-glow" as string]: "rgba(102,230,25,0.20)", // green glow
          }}
        >
          <SplashLogoContent showWords={variant === "full"} />
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure-SVG splash content. The pulsing badge always renders; the ENERGYPAY
 * wordmark + taglines only render for the entry splash (`showWords`), never
 * during in-app page transitions.
 */
function SplashLogoContent({ showWords }: { showWords: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: showWords ? "2.5rem" : "0",
      }}
    >
      {/* Pulsing badge — responsive size; CSS overrides the SVG width/height */}
      <BrandBadge
        size="lg"
        className="ep-splash-logo"
        style={{
          width: "min(200px, 50vw)",
          height: "min(200px, 50vw)",
        }}
      />

      {showWords && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.65rem",
          }}
        >
          {/* Name — larger than BrandName lg so it reads at splash scale */}
          <span
            style={{
              fontFamily: "var(--font-brand)",
              fontSize: "clamp(32px, 5vw, 52px)",
              fontWeight: 700,
              letterSpacing: "0.06em",
              lineHeight: 1,
            }}
          >
            <span style={{ color: "var(--brand-energy-color, #F2F2F2)" }}>ENERGY</span>
            <span style={{ color: "var(--brand-pay-color, #66E619)" }}>PAY</span>
          </span>

          <span
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: "clamp(15px, 2vw, 22px)",
              fontWeight: 500,
              letterSpacing: "0.30em",
              textTransform: "uppercase",
              color: "oklch(0.68 0.028 240)",
              lineHeight: 1,
            }}
          >
            Clearing &amp; Settlement OS
          </span>

          <span
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: "clamp(10px, 1.2vw, 14px)",
              fontWeight: 400,
              letterSpacing: "0.20em",
              textTransform: "uppercase",
              color: "oklch(0.44 0.018 240)",
              lineHeight: 1,
            }}
          >
            Programmable Settlement for Energy Markets
          </span>
        </div>
      )}
    </div>
  );
}
