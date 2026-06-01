import { useState, useEffect } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  LayoutDashboard,
  Calculator,
  ListChecks,
  Send,
  Radio,
  Wallet,
  GitBranch,
  BookLock,
  Banknote,
  PlugZap,
  Building2,
  Cable,
  MapPinned,
  FileCheck2,
  Shield,
  CreditCard,
  Zap,
  Crown,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

import { useOperator, SUBSCRIPTION_PLAN_META, type SubscriptionPlan } from "@/store/operator";
import { BrandBadge, BrandName } from "@/components/BrandLogo";

type Role = "GENERATOR" | "SELLER" | "INVESTOR" | "USER" | "UTILITY" | "REGULATORY_AUTHORITY";

type Item = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  code: string;
  roles: Role[];
};

// --------------------------------------------------
// ACCESS HELPERS
// --------------------------------------------------

const canAccessItem = (item: Item, roles: Role[]) => {
  if (roles.length === 0) return false;

  return item.roles.some((role) => roles.includes(role));
};

const filterItemsByRole = (items: Item[], roles: Role[]) => {
  return items.filter((item) => canAccessItem(item, roles));
};

// --------------------------------------------------
// EXECUTIVE & OPERATIONS
// --------------------------------------------------

const MARKET_OPS: Item[] = [
  {
    title: "Operations Dashboard",
    url: "/",
    icon: LayoutDashboard,
    code: "EXE-01",
    roles: ["GENERATOR", "SELLER", "INVESTOR", "USER", "UTILITY", "REGULATORY_AUTHORITY"],
  },
  {
    title: "Audit & Compliance",
    url: "/audit",
    icon: BookLock,
    code: "EXE-02",
    roles: ["GENERATOR", "SELLER", "INVESTOR", "UTILITY", "REGULATORY_AUTHORITY"],
  },
];

// --------------------------------------------------
// RISK & CLEARING
// --------------------------------------------------

const RISK_DATA: Item[] = [
  {
    title: "Clearing House",
    url: "/clearing",
    icon: GitBranch,
    code: "RSK-01",
    roles: ["GENERATOR", "SELLER", "INVESTOR", "UTILITY"],
  },
  {
    title: "Oracle & Market Data",
    url: "/oracle",
    icon: Radio,
    code: "RSK-02",
    roles: ["GENERATOR", "SELLER", "INVESTOR", "USER", "UTILITY", "REGULATORY_AUTHORITY"],
  },
];

// --------------------------------------------------
// SETTLEMENT INFRASTRUCTURE
// --------------------------------------------------

const SETTLEMENT: Item[] = [
  {
    title: "Treasury & Rails",
    url: "/treasury",
    icon: Banknote,
    code: "STL-01",
    roles: ["GENERATOR", "SELLER", "INVESTOR", "UTILITY"],
  },
  {
    title: "Settlement Console",
    url: "/settlement",
    icon: Calculator,
    code: "STL-02",
    roles: ["GENERATOR", "SELLER", "INVESTOR", "USER", "UTILITY", "REGULATORY_AUTHORITY"],
  },
  {
    title: "Direct Settlement",
    url: "/p2p",
    icon: Send,
    code: "STL-03",
    // P2P livre — todos os participantes são agentes do mercado livre
    roles: ["GENERATOR", "SELLER", "INVESTOR", "USER", "UTILITY"],
  },
  {
    title: "x402 API Access",
    url: "/x402",
    icon: PlugZap,
    code: "STL-04",
    roles: ["SELLER", "INVESTOR", "USER", "UTILITY"],
  },
  {
    title: "Custody Wallet",
    url: "/wallet",
    icon: Wallet,
    code: "STL-05",
    roles: ["GENERATOR", "SELLER", "INVESTOR", "USER", "UTILITY"],
  },
];

// --------------------------------------------------
// MARKET INFRASTRUCTURE
// --------------------------------------------------

const TERMINALS: Item[] = [
  {
    title: "Contract Registry",
    url: "/contracts",
    icon: ListChecks,
    code: "MKT-01",
    roles: ["GENERATOR", "SELLER", "INVESTOR", "USER", "UTILITY", "REGULATORY_AUTHORITY"],
  },
  {
    title: "Operational Grid",
    url: "/grid",
    icon: Radio,
    code: "MKT-02",
    roles: ["GENERATOR", "SELLER", "INVESTOR", "USER", "UTILITY", "REGULATORY_AUTHORITY"],
  },
];

// --------------------------------------------------
// UTILITY OPERATIONS (concessionária exclusiva)
// --------------------------------------------------

const UTILITY_OPS: Item[] = [
  {
    title: "Consumer Registry",
    url: "/utility/uc",
    icon: MapPinned,
    code: "UTL-01",
    roles: ["UTILITY"],
  },
  {
    title: "Grid Connections",
    url: "/utility/connections",
    icon: Cable,
    code: "UTL-02",
    roles: ["UTILITY"],
  },
  {
    title: "TUSD Settlement",
    url: "/utility/tusd",
    icon: Banknote,
    code: "UTL-03",
    roles: ["UTILITY"],
  },
  {
    title: "Connection Certificates",
    url: "/utility/certificates",
    icon: FileCheck2,
    code: "UTL-04",
    roles: ["UTILITY"],
  },
  {
    title: "Concession Area",
    url: "/utility/area",
    icon: Building2,
    code: "UTL-05",
    roles: ["UTILITY"],
  },
];

function Group({ label, items, path, open, onOpenChange }: {
  label: string;
  items: Item[];
  path: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { state } = useSidebar();

  if (items.length === 0) return null;

  // In icon-only mode the group label (and its collapse trigger) is hidden, so a
  // collapsed section would strand its items with no way to reopen — force open there.
  const isIconMode = state === "collapsed";

  return (
    <Collapsible
      open={isIconMode ? true : open}
      onOpenChange={onOpenChange}
      className="group/collapsible"
    >
      <SidebarGroup className="py-0.5">
        <SidebarGroupLabel
          asChild
          className="px-2 font-mono text-[9.5px] font-medium tracking-[0.22em] text-muted-foreground/75"
        >
          <CollapsibleTrigger className="w-full cursor-pointer transition-colors hover:text-muted-foreground">
            {label}
            <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/55 transition-transform duration-200 group-data-[state=closed]/collapsible:-rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>

        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-[2px]">
              {items.map((item) => {
                // Exact match only — child routes (e.g. /contracts/new) should NOT
                // highlight a parent entry (/contracts) when both are in the sidebar.
                const active = path === item.url;

                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={{ children: item.title, className: "font-mono text-[11px]" }}
                      className="relative h-6 cursor-pointer select-none rounded-sm pl-2 pr-1 data-[active=true]:bg-sidebar-accent/70"
                      onClick={() => navigate({ to: item.url })}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r-sm bg-primary"
                        />
                      )}

                      <item.icon className="h-3.5 w-3.5 shrink-0" />

                      <span className="truncate text-[12px] leading-none">{item.title}</span>

                      <span className="ml-auto font-mono text-[9px] tracking-widest text-muted-foreground/55">
                        {item.code}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

// ── Subscription footer panel ───────────────────────────────────────────────

const PLAN_ICONS: Record<SubscriptionPlan, React.ComponentType<{ className?: string }>> = {
  FREE:       CreditCard,
  OPERATOR:   Zap,
  ENTERPRISE: Crown,
};

function SubscriptionPanel() {
  const navigate  = useNavigate();
  const { state } = useSidebar();
  const isIconMode = state === "collapsed";
  const operator  = useOperator((s) => s.operator);

  const sub  = operator?.subscription ?? { plan: "FREE" as SubscriptionPlan, status: "ACTIVE" as const, settlementsUsed: 0, settlementsLimit: 5 };
  const meta = SUBSCRIPTION_PLAN_META[sub.plan as SubscriptionPlan];
  const PlanIcon = PLAN_ICONS[sub.plan as SubscriptionPlan];

  const statusLabel: Record<string, string> = {
    ACTIVE:    "ACTIVE",
    TRIALING:  "TRIAL",
    PAST_DUE:  "PAST DUE",
    CANCELLED: "CANCELLED",
    EXPIRED:   "EXPIRED",
  };

  // Icon-only mode: show just a small icon button
  if (isIconMode) {
    return (
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <button
          onClick={() => navigate({ to: "/subscription" })}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar hover:bg-sidebar-accent"
          title={`${meta.label} plan`}
        >
          <PlanIcon className={`h-3.5 w-3.5 ${meta.textColor}`} />
        </button>
      </SidebarFooter>
    );
  }

  const usedPct = sub.settlementsLimit
    ? Math.min(100, Math.round(((sub.settlementsUsed ?? 0) / sub.settlementsLimit) * 100))
    : 0;

  const periodEndLabel = sub.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : null;

  return (
    <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
      <div className={`rounded-md border ${meta.borderColor} ${meta.bgColor} p-2.5`}>
        {/* Header row */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
            <span className={`font-mono text-[10px] font-semibold uppercase tracking-widest ${meta.textColor}`}>
              {meta.label}
            </span>
          </div>
          <span className={`rounded-sm px-1 py-0.5 font-mono text-[8px] uppercase tracking-widest ${
            sub.status === "ACTIVE" || sub.status === "TRIALING"
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive"
          }`}>
            {statusLabel[sub.status] ?? sub.status}
          </span>
        </div>

        {/* FREE plan: settlement usage bar */}
        {sub.plan === "FREE" && sub.settlementsLimit && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between">
              <span className="font-mono text-[9px] text-muted-foreground">Settlements</span>
              <span className="font-mono text-[9px] text-muted-foreground">
                {sub.settlementsUsed ?? 0}/{sub.settlementsLimit}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-sidebar-border">
              <div
                className={`h-full rounded-full transition-all ${usedPct >= 80 ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Paid plan: renewal date or cancellation notice */}
        {sub.plan !== "FREE" && periodEndLabel && (
          <p className="mt-1.5 font-mono text-[9px] text-muted-foreground">
            {sub.cancelAtPeriodEnd ? "Expires" : "Renews"} {periodEndLabel}
          </p>
        )}

        <Button
          size="sm"
          variant="outline"
          className={`mt-2 h-6 w-full border font-mono text-[9px] uppercase tracking-widest ${meta.borderColor} ${meta.textColor} hover:${meta.bgColor}`}
          onClick={() => navigate({ to: "/subscription" })}
        >
          {sub.plan === "FREE" ? "Upgrade →" : "Manage Subscription →"}
        </Button>
      </div>
    </SidebarFooter>
  );
}

export function AppSidebar() {
  const path = useRouterState({
    select: (s) => s.location.pathname,
  });
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();

  const operator = useOperator((s) => s.operator);
  const roles = (operator?.roles ?? []) as Role[];
  const platformRole = operator?.platformRole ?? "USER";
  const isAdmin = platformRole !== "USER";

  const marketOps = filterItemsByRole(MARKET_OPS, roles);
  const riskData = filterItemsByRole(RISK_DATA, roles);
  const settlement = filterItemsByRole(SETTLEMENT, roles);
  const terminals = filterItemsByRole(TERMINALS, roles);
  const utilityOps = filterItemsByRole(UTILITY_OPS, roles);

  // Accordion: only one nav section is expanded at a time. Opening one collapses
  // the others; the section of the current route stays open after navigation.
  const navGroups = [
    { label: "Executive Layer",           items: marketOps },
    { label: "Risk & Clearing",           items: riskData },
    { label: "Settlement Infrastructure", items: settlement },
    { label: "Market Infrastructure",     items: terminals },
    { label: "Utility Operations",        items: utilityOps },
  ];
  const groupForPath = (p: string) =>
    navGroups.find((g) =>
      g.items.some((item) => (item.url === "/" ? p === "/" : p.startsWith(item.url))),
    )?.label ?? null;
  const [openGroup, setOpenGroup] = useState<string | null>(() => groupForPath(path));
  useEffect(() => {
    const g = groupForPath(path);
    if (g) setOpenGroup(g);
    // Mobile: auto-close the overlay sidebar on navigation so the chosen page is
    // fully visible (no manual collapse needed after picking a route).
    setOpenMobile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const buildHash = "b9f4c2e";

  // Width is controlled via the --sidebar-width CSS variable (18rem) set on
  // SidebarProvider in __root.tsx — do NOT add a w-* class here, it would
  // desync the fixed overlay from the gap-holder div inside <Sidebar>.
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="!p-0 border-b border-sidebar-border">
        <div className="flex h-12 items-center gap-2.5 px-3">
          <BrandBadge size="sm" />
          <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden" style={{ gap: "5px" }}>
            <BrandName size="sm" />
            <span className="font-mono text-[9px] uppercase leading-none tracking-[0.22em] text-muted-foreground">
              Programmable Pre-Clearing &amp; Settlement Infrastructure
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* group-data-[collapsible=icon]:overflow-hidden prevents a vertical
          scrollbar from appearing in icon-only mode when there are many items. */}
      <SidebarContent className="gap-0 overflow-hidden">
        {navGroups.map((g) => (
          <Group
            key={g.label}
            label={g.label}
            items={g.items}
            path={path}
            open={openGroup === g.label}
            onOpenChange={(o) => setOpenGroup(o ? g.label : null)}
          />
        ))}

        {/* Platform Admin — visible only to PLATFORM_OWNER, PLATFORM_ADMIN, ACCOUNT_RECOVERY */}
        {isAdmin && (
          <Collapsible open className="group/collapsible">
            <SidebarGroup className="py-0.5">
              <SidebarGroupLabel
                className="px-2 font-mono text-[9.5px] font-medium tracking-[0.22em] text-violet-400/70"
              >
                Platform Admin
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-[2px]">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={path === "/admin"}
                      tooltip={{ children: "Platform Admin", className: "font-mono text-[11px]" }}
                      className="relative h-6 cursor-pointer select-none rounded-sm pl-2 pr-1 data-[active=true]:bg-violet-500/10"
                      onClick={() => navigate({ to: "/admin" })}
                    >
                      {path === "/admin" && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r-sm bg-violet-400"
                        />
                      )}
                      <Shield className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                      <span className="truncate text-[12px] leading-none">Platform Admin</span>
                      <span className="ml-auto font-mono text-[9px] tracking-widest text-violet-400/50">ADM-01</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </Collapsible>
        )}
      </SidebarContent>

      <SubscriptionPanel />
    </Sidebar>
  );
}