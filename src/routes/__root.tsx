import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { isChunkLoadError, reloadForFreshBundle } from "@/lib/chunk-reload";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { OperatorBadge } from "@/components/OperatorBadge";
import { StatusRail } from "@/components/ops/StatusRail";
import { StatusBar } from "@/components/StatusBar";
import { Toaster } from "@/components/ui/sonner";
import { useOperator, maskAddress, ROLE_COLORS, ROLE_META } from "@/store/operator";
import { useUiStore } from "@/store/ui";
import { STELLAR_NETWORK_LABEL } from "@/lib/stellar";
import { useNetworkStore, useNetworkPolling } from "@/store/network";
import { SplashScreen } from "@/components/SplashScreen";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Route not found in settlement registry.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  // A stale bundle after a deploy (Vite rotated the hashed chunks) surfaces here
  // as a failed dynamic import. Auto-reload to fetch the fresh build instead of
  // stranding the operator on this screen.
  const staleBundle = isChunkLoadError(error);
  useEffect(() => {
    if (staleBundle) reloadForFreshBundle();
  }, [staleBundle]);
  const isProd = import.meta.env?.PROD;
  const safeMessage = staleBundle
    ? "Updating to the latest version…"
    : isProd
      ? "An unexpected error occurred. Please retry or return home."
      : error.message;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{staleBundle ? "Updating…" : "Something went wrong"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{safeMessage}</p>
        <button
          onClick={() => {
            if (staleBundle) {
              reloadForFreshBundle();
              return;
            }
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          {staleBundle ? "Reload" : "Retry"}
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "EnergyPay — Programmable Pre-Clearing & Settlement Infrastructure" },
      {
        name: "description",
        content: "Programmable Settlement for Energy Markets — bilateral energy contracts settled and reconciled on Stellar Mainnet.",
      },
      { property: "og:title", content: "EnergyPay — Programmable Pre-Clearing & Settlement Infrastructure" },
      { name: "twitter:title", content: "EnergyPay — Programmable Pre-Clearing & Settlement Infrastructure" },
      {
        property: "og:description",
        content: "Programmable Settlement for Energy Markets — bilateral energy contracts settled and reconciled on Stellar Mainnet.",
      },
      {
        name: "twitter:description",
        content: "Programmable Settlement for Energy Markets — bilateral energy contracts settled and reconciled on Stellar Mainnet.",
      },
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Montserrat:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Syncs the Zustand theme to the <html> className on mount and changes. */
function ThemeSync() {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("dark", "light");
    html.classList.add(theme);
  }, [theme]);
  return null;
}

/**
 * AppHeader — sticky top bar.
 *
 * Layout:
 *   [SidebarTrigger] | [operator info chips — ID · ROLES · NETWORK · VERSION]  →  [OperatorBadge]
 *
 * When the sidebar is collapsed, the info chips are replaced by the brand tagline.
 * Must live inside <SidebarProvider> so useSidebar() resolves correctly.
 */
const BUILD_VERSION = "v0.5 · b9f4c2e";

function AppHeader() {
  const operator = useOperator((s) => s.operator);

  // Single app-wide connection-status poller — updates in real time, independent
  // of any page's data. null = checking, true = online (pulse), false = offline.
  useNetworkPolling();
  const online = useNetworkStore((s) => s.stellar.online);

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center border-b border-border bg-background/90 backdrop-blur">
      {/* LEFT — collapse toggle */}
      <SidebarTrigger className="h-12 w-12 shrink-0 rounded-none border-r border-border text-muted-foreground hover:bg-accent hover:text-foreground" />

      {/* CENTER — operator info chips (NETWORK · ROLES · VERSION) */}
      <div className="flex min-w-0 flex-1 items-center overflow-hidden px-3">
        {operator ? (
          <div className="flex min-w-0 items-center">
            {/* Network — Stellar Mainnet live status bound to the wave icon */}
            <div className="flex shrink-0 items-center gap-1.5 pl-1 pr-3">
              <div className="flex flex-col justify-center leading-none">
                <span className="font-mono text-[9px] text-foreground/85">
                  {STELLAR_NETWORK_LABEL}
                </span>
                <span
                  className={`mt-0.5 flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.18em] ${
                    online === null
                      ? "text-muted-foreground/70"
                      : online
                        ? "text-success"
                        : "text-destructive"
                  }`}
                >
                  {online === false ? (
                    /* Offline — solid red dot, no pulse. */
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-destructive text-destructive" />
                  ) : (
                    /* Online (or checking) — pulse synced to the wave graph. */
                    <span className="ep-status-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success text-success" />
                  )}
                  {online === null ? "Checking" : online ? "Status Online" : "Status Offline"}
                </span>
              </div>
              <svg
                viewBox="0 0 36 24"
                className={`h-6 w-9 shrink-0 ${online === false ? "text-destructive" : "text-success"}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {online === false ? (
                  /* Offline — static red wave, no pulse. */
                  <path d="M2 12h16l3-9 6 18 3-9h4" />
                ) : (
                  /* Online (or checking) — traveling current pulse + glowing head. */
                  <>
                    <path d="M2 12h16l3-9 6 18 3-9h4" className="ep-current-base" />
                    <path d="M2 12h16l3-9 6 18 3-9h4" pathLength={100} className="ep-current-pulse" />
                    <path d="M2 12h16l3-9 6 18 3-9h4" pathLength={100} className="ep-current-dot" />
                  </>
                )}
              </svg>
            </div>
            <HDivider />
            {/* Roles — individual colored dot + readable label per role */}
            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden px-3">
              <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground/70">
                Roles
              </span>
              <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                {operator.roles.map((r) => {
                  const color = ROLE_COLORS[r]?.hex;
                  const label = ROLE_META[r]?.label ?? r;
                  return (
                    <span key={r} className="flex shrink-0 items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="font-mono text-[9px] text-foreground/90">{label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
            <HDivider />
            {/* Version */}
            <div className="shrink-0 px-3">
              <span className="font-mono text-[8.5px] text-muted-foreground/65">
                {BUILD_VERSION}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* RIGHT — operator ID + profile (with notifications inside) */}
      <div className="flex shrink-0 items-center border-l border-border pl-1 pr-2">
        {operator && (
          <>
            <HeaderChip label="ID" value={maskAddress(operator.operatorId)} />
            <HDivider />
          </>
        )}
        <div className="pl-2">
          <OperatorBadge />
        </div>
      </div>
    </header>
  );
}

function HeaderChip({
  label,
  value,
  truncate,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline gap-1.5 px-3 ${truncate ? "min-w-0 overflow-hidden" : "shrink-0"}`}
    >
      <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground/70">
        {label}
      </span>
      <span
        className={`font-mono text-[9px] text-foreground/90 ${truncate ? "truncate" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function HDivider() {
  return <div className="h-3 w-px shrink-0 bg-border/60" />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const isAuthenticated = useOperator((s) => s.isAuthenticated);
  const operator = useOperator((s) => s.operator);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    // Disabled for production demo stability.
    // The operational ticker is visual-only and should not block routing/rendering.
  }, []);

  const isPublicRoute =
    pathname === "/landing" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";

  // institutional access gate — redirect to /login when no operator session
  useEffect(() => {
    if (!isAuthenticated && !isPublicRoute) {
      navigate({ to: "/login" });
    }
  }, [isAuthenticated, isPublicRoute, navigate]);

  // public auth routes render without the chrome
  if (isPublicRoute) {
    return (
      <SplashScreen>
        <QueryClientProvider client={queryClient}>
          <ThemeSync />
          <div key={pathname} className="ep-page-in-fade min-h-screen w-full bg-background">
            <Outlet />
          </div>
          <Toaster />
        </QueryClientProvider>
      </SplashScreen>
    );
  }

  return (
    <SplashScreen>
      <QueryClientProvider client={queryClient}>
        <ThemeSync />
        {/* --sidebar-width controls both the fixed overlay and the gap-holder.
            Keep this in sync with any w-* override on <Sidebar> to prevent
            the 32px overlap that hides the StatusBar "Live" LED in expanded mode.
            15.5rem = 248px — minimum width where all item labels render without truncation. */}
        <SidebarProvider style={{ "--sidebar-width": "15.5rem" } as React.CSSProperties}>
          <div className="flex h-screen w-full overflow-hidden bg-background">
            <AppSidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <AppHeader />
              <main className="flex-1 overflow-y-auto space-y-4 p-4 pl-8 md:p-6 md:pl-10 lg:p-8 lg:pl-12">
                <div key={pathname} className="ep-page-in">
                  <Outlet />
                </div>
              </main>
              <StatusBar />
            </div>
          </div>
          <Toaster />
        </SidebarProvider>
      </QueryClientProvider>
    </SplashScreen>
  );
}
