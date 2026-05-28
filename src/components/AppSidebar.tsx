import { useState } from "react";
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
  ShieldCheck,
  Network,
  BookLock,
  Banknote,
  PlugZap,
  Building2,
  Cable,
  MapPinned,
  FileCheck2,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { useOperator } from "@/store/operator";
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

function Group({ label, items, path }: { label: string; items: Item[]; path: string }) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const [open, setOpen] = useState(true);

  if (items.length === 0) return null;

  // In icon-only mode the group label (and its collapse trigger) is hidden, so a
  // collapsed section would strand its items with no way to reopen — force open there.
  const isIconMode = state === "collapsed";

  return (
    <Collapsible
      open={isIconMode ? true : open}
      onOpenChange={setOpen}
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

export function AppSidebar() {
  const path = useRouterState({
    select: (s) => s.location.pathname,
  });

  const operator = useOperator((s) => s.operator);
  const roles = (operator?.roles ?? []) as Role[];

  const marketOps = filterItemsByRole(MARKET_OPS, roles);
  const riskData = filterItemsByRole(RISK_DATA, roles);
  const settlement = filterItemsByRole(SETTLEMENT, roles);
  const terminals = filterItemsByRole(TERMINALS, roles);
  const utilityOps = filterItemsByRole(UTILITY_OPS, roles);

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
              Clearing &amp; Settlement OS
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* group-data-[collapsible=icon]:overflow-hidden prevents a vertical
          scrollbar from appearing in icon-only mode when there are many items. */}
      <SidebarContent className="gap-0 overflow-hidden">
        <Group label="Executive Layer" items={marketOps} path={path} />

        <Group label="Risk & Clearing" items={riskData} path={path} />

        <Group label="Settlement Infrastructure" items={settlement} path={path} />

        <Group label="Market Infrastructure" items={terminals} path={path} />

        <Group label="Utility Operations" items={utilityOps} path={path} />
      </SidebarContent>

    </Sidebar>
  );
}