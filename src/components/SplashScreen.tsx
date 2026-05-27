/**
 * SplashScreen — EnergyPay institutional entry animation.
 *
 * Displays once per browser session (keyed via sessionStorage).
 * Children are rendered immediately so routing and auth work normally;
 * the overlay sits on top (z-9999) and fades out after the animation.
 *
 * Timing (normal motion):
 *   0 → 3 600 ms  logo glow pulse (≈ 1.5 animation cycles at 2.4 s each)
 *   3 600 → 4 500 ms  overlay fades out
 *   4 500 ms  overlay removed from DOM
 *
 * prefers-reduced-motion: glow animation disabled, overlay removed in 600 ms.
 */

import { useEffect, useState } from "react";
import { BrandBadge, BrandName } from "@/components/BrandLogo";

const SESSION_KEY = "ep.splash.v4"; // bumped so existing sessions see the SVG logo
const GLOW_MS = 3600; // how long logo glows before fade begins
const FADE_MS = 900;  // overlay opacity transition

type Phase = "done" | "showing" | "fading";

// ─────────────────────────────────────────────────────────────────────────────

export function SplashScreen({ children }: { children: React.ReactNode }) {
  // Start "done" to be SSR-safe — effect upgrades to "showing" on the client.
  const [phase, setPhase] = useState<Phase>("done");

  useEffect(() => {
    // Already shown this session → skip immediately.
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, "1");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const glowTime = reduced ? 500 : GLOW_MS;
    const fadeTime = reduced ? 100 : FADE_MS;

    setPhase("showing");
    const t1 = setTimeout(() => setPhase("fading"), glowTime);
    const t2 = setTimeout(() => setPhase("done"), glowTime + fadeTime);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <>
      {/* App content renders immediately — auth, routing, hydration proceed normally. */}
      {children}

      {/* Fixed overlay — sits on top, removed from DOM once done. */}
      {phase !== "done" && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0",
            backgroundColor: "oklch(0.10 0.018 252)",
            opacity: phase === "fading" ? 0 : 1,
            transition:
              phase === "fading" ? `opacity ${FADE_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1)` : "none",
            pointerEvents: phase === "fading" ? "none" : "all",
            // The splash background is always dark — pin brand vars to dark-mode
            // values so colors are correct regardless of the user's selected theme.
            ["--brand-energy-color" as string]: "#F2F2F2",
            ["--brand-pay-color"    as string]: "oklch(0.78 0.14 215)",
            ["--brand-bolt-start"   as string]: "#6AE619",   // vivid lime-green — original brand
            ["--brand-bolt-end"     as string]: "#00CCEE",   // vivid cyan — original brand
            ["--brand-ring-color"   as string]: "rgba(255,255,255,0.95)", // bold white ring
            ["--brand-ring-width"   as string]: "7",                      // thicker ring at splash scale
            ["--brand-disc"         as string]: "#070d1a",                // dark navy disc — matches reference
            ["--brand-badge-glow"   as string]: "rgba(106,230,25,0.20)",  // green glow — matches bolt
          }}
        >
          <SplashLogoContent />
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure-SVG splash content — no PNG dependency.
 * The badge renders at a large responsive size with the vivid
 * lime-green → cyan bolt gradient and the theme-appropriate disc color.
 */
function SplashLogoContent() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2.5rem",
      }}
    >
      {/* Badge — responsive size; CSS overrides the SVG width/height attributes */}
      <BrandBadge
        size="lg"
        className="ep-splash-logo"
        style={{
          width: "min(200px, 50vw)",
          height: "min(200px, 50vw)",
        }}
      />

      {/* Name + taglines */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.65rem",
        }}
      >
        {/* Name — larger than BrandName lg (28px) so it reads at splash scale */}
        <span
          style={{
            fontFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            lineHeight: 1,
          }}
        >
          <span style={{ color: "var(--brand-energy-color, #F2F2F2)" }}>ENERGY</span>
          <span style={{ color: "var(--brand-pay-color,    oklch(0.78 0.14 215))" }}>PAY</span>
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
          Programmable Settlement for Power Markets
        </span>
      </div>
    </div>
  );
}
