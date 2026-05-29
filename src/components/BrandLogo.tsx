/**
 * BrandLogo — EnergyPay visual identity components.
 *
 * Pure-SVG badge: solid disc (via --brand-disc CSS var) · open white ring
 * (two arcs with gaps aligned to bolt tips, via --brand-ring-color) ·
 * vivid lime-green → cyan lightning bolt (hardcoded brand gradient).
 *
 * The disc and ring colors are controlled by CSS custom properties so the
 * badge adapts cleanly to dark and light mode without any grey/silver gradients.
 *
 * Exports
 *   BrandBadge    — badge only (used in sidebar, auth pages, splash)
 *   BrandName     — colored wordmark text only
 *   BrandWordmark — badge + name + tagline stacked
 */

/** @deprecated — use CSS var(--brand-bolt-start/end) instead. */
export const BRAND_LIME = "#66E619";
export const BRAND_CYAN = "#00C8EE";

type Size = "sm" | "md" | "lg";

const BADGE_PX: Record<Size, number> = { sm: 28, md: 36, lg: 140 };
const FONT_SIZE: Record<Size, number> = { sm: 12, md: 14, lg: 28 };

// ─── Badge ────────────────────────────────────────────────────────────────────
//
// All geometry is in a 100 × 100 viewBox; the SVG scales to any pixel size.
//
// Three layered gradients — all vertical (top → bottom):
//
//   Disc   #050c09 (black) → #ffffff (white)
//          Black where the bolt is green (top) → white where the bolt is cyan
//          (bottom). This makes the badge coherent in both dark and light mode:
//          dark pages match the black top; light pages match the white bottom.
//
//   Ring   rgba(255,255,255,0.92) (white) → rgba(15,30,65,0.75) (dark navy)
//          White ring is visible on the black disc top; dark ring is visible on
//          the white disc bottom. Both halves remain clearly defined.
//
//   Bolt   #6AE619 (vivid lime-green) → #00CCEE (vivid cyan)
//          Original brand gradient, colours unchanged from the reference logo.
//
// Ring arc endpoints (angle θ clockwise from 12:00, r=42):
//   x = 50 + 42·sin(θ),  y = 50 − 42·cos(θ)
//   36°  → (74.7, 16.0)  |  179° → (50.7, 92.0)
//   209° → (29.6, 86.7)  |  6°   → (54.4,  8.2)
//
// Bolt tips exit through the ring gaps:
//   Tip (64,11)  ≈ 21°  — gap 1 ✓
//   Tip (42,89)  ≈ 194° — gap 2 ✓

/**
 * SVG brand badge — scales perfectly at every size, coherent in dark & light.
 * Pass `className` to attach glow animations (e.g. `ep-splash-logo`).
 * Pass `style` to override dimensions (e.g. responsive splash sizing).
 *
 * Disc color   → var(--brand-disc)        dark: #060c0a   light: transparent
 * Ring color   → var(--brand-ring-color)  dark: white/90  light: dark-navy/82
 * Ring width   → var(--brand-ring-width)  default: 5 viewBox units (≈ 10px @ 200px)
 * Bolt colors  → var(--brand-bolt-start/end) — blue in app dark, green→cyan in splash
 */
export function BrandBadge({
  size = "md",
  className,
  style,
}: {
  size?: Size;
  className?: string;
  style?: React.CSSProperties;
}) {
  const w = BADGE_PX[size];
  const boltId = `ep-bolt-${size}`;

  return (
    <svg
      width={w}
      height={w}
      viewBox="0 0 100 100"
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <defs>
        {/* Bolt: colors driven by CSS vars — blue in dark mode, green in light mode */}
        <linearGradient id={boltId} x1="50" y1="10" x2="50" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   style={{ stopColor: "var(--brand-bolt-start, #66E619)" }} />
          <stop offset="100%" style={{ stopColor: "var(--brand-bolt-end,   #00C8EE)" }} />
        </linearGradient>
      </defs>

      {/* Background disc — solid color via CSS var (no grey gradient) */}
      <circle cx="50" cy="50" r="49.5" fill="var(--brand-disc, #060c0a)" />

      {/* Ring arc 1 — 36° → 179° (clockwise, 143°) */}
      <path
        d="M 74.7 16 A 42 42 0 0 1 50.7 92"
        fill="none"
        stroke="var(--brand-ring-color, rgba(255,255,255,0.90))"
        strokeWidth="var(--brand-ring-width, 5)"
        strokeLinecap="round"
      />

      {/* Ring arc 2 — 209° → 6° (clockwise, 157°) */}
      <path
        d="M 29.6 86.7 A 42 42 0 0 1 54.4 8.2"
        fill="none"
        stroke="var(--brand-ring-color, rgba(255,255,255,0.90))"
        strokeWidth="var(--brand-ring-width, 5)"
        strokeLinecap="round"
      />

      {/* Lightning bolt — vivid lime-green → vivid cyan */}
      <path
        d="M 64 11 L 27 52 H 46 L 42 89 L 73 48 H 54 Z"
        fill={`url(#${boltId})`}
      />
    </svg>
  );
}

// ─── Name ─────────────────────────────────────────────────────────────────────

/**
 * "ENERGY" in white + "PAY" in lime. Inline — no wrapping layout.
 */
export function BrandName({ size = "md" }: { size?: Size }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-brand)",
        fontSize: FONT_SIZE[size],
        fontWeight: 700,
        letterSpacing: size === "lg" ? "0.04em" : "0.06em",
        lineHeight: 1,
      }}
    >
      <span style={{ color: "var(--brand-energy-color, #F2F2F2)" }}>ENERGY</span>
      <span style={{ color: "var(--brand-pay-color, #66E619)" }}>PAY</span>
    </span>
  );
}

// ─── Wordmark (badge + name + tagline stacked) ────────────────────────────────

/**
 * Full stacked identity for splash and large-format contexts.
 * Pass `badgeClassName` to attach the `ep-splash-logo` glow animation.
 */
export function BrandWordmark({
  size = "lg",
  badgeClassName,
}: {
  size?: Size;
  badgeClassName?: string;
}) {
  const isLg = size === "lg";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: isLg ? "1.25rem" : "0.5rem",
      }}
    >
      <BrandBadge size={size} className={badgeClassName} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: isLg ? "0.35rem" : "0.2rem",
        }}
      >
        <BrandName size={size} />
        <span
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: isLg ? "clamp(15px, 2vw, 22px)" : "9px",
            fontWeight: isLg ? 500 : 400,
            letterSpacing: isLg ? "0.30em" : "0.24em",
            textTransform: "uppercase",
            color: isLg ? "oklch(0.68 0.028 240)" : "oklch(0.50 0.018 240)",
            lineHeight: 1,
          }}
        >
          Clearing &amp; Settlement OS
        </span>
      </div>
    </div>
  );
}
