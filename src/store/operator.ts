import { create } from "zustand";
import { apiLogin, apiRegister, type ApiUser, type RegisterPayload } from "@/lib/api";
import { getSession, setSession, clearSession, type AuthSession } from "@/lib/session";
import { STELLAR_NETWORK } from "@/lib/stellar";

export type AccessLevel = "OPERATOR" | "SUPERVISOR" | "CLEARING_ADMIN";

export type ParticipantRole =
  | "GENERATOR"
  | "SELLER"
  | "INVESTOR"
  | "USER"
  | "UTILITY"
  | "REGULATORY_AUTHORITY"
  | "ADMIN";

// ─── Regulatory Authority sub-type ───────────────────────────────────────────
/**
 * Granular oversight category for REGULATORY_AUTHORITY operators.
 * Sent to the backend as `authority_type` on registration.
 *
 * INTERNAL / ADMIN-ONLY — not exposed in the public onboarding flow.
 * EnergyPay is regulator-ready, but not regulator-dependent.
 * These types are preserved for future enterprise/admin configuration,
 * audit exports, compliance reporting and eventual institutional integration.
 *
 * TODO: expose REGULATORY_AUTHORITY only via a private admin provisioning
 * endpoint (never via the public /register route). Enforce read-only
 * permissions and institutional certification in backend/API before use.
 */
export type AuthorityType =
  | "ENERGY_REGULATOR"
  | "MARKET_OPERATOR_CLEARING_HOUSE"
  | "GRID_SYSTEM_OPERATOR"
  | "SETTLEMENT_SUPERVISOR"
  | "AUDIT_COMPLIANCE_AUTHORITY"
  | "ENVIRONMENTAL_CERTIFICATE_AUTHORITY"
  | "FINANCIAL_PAYMENT_AUTHORITY"
  | "GOVERNMENT_POLICY_AGENCY";

export type AuthorityTypeMeta = {
  label: string;
  desc: string;
  examples?: string;
};

export const AUTHORITY_TYPE_META: Record<AuthorityType, AuthorityTypeMeta> = {
  ENERGY_REGULATOR: {
    label: "Energy Regulator",
    desc: "Formal energy sector regulator.",
    examples: "ANEEL, FERC, Ofgem, ACER",
  },
  MARKET_OPERATOR_CLEARING_HOUSE: {
    label: "Market Operator / Clearing House",
    desc: "Market operation, clearing, settlement and participant coordination.",
    examples: "CCEE, market operators, settlement chambers",
  },
  GRID_SYSTEM_OPERATOR: {
    label: "Grid / System Operator",
    desc: "Grid operation, dispatch, reliability and system supervision.",
    examples: "ONS, ISO, RTO, TSO, DSO",
  },
  SETTLEMENT_SUPERVISOR: {
    label: "Settlement Supervisor",
    desc: "Settlement, collateral, default and financial closing supervision.",
  },
  AUDIT_COMPLIANCE_AUTHORITY: {
    label: "Audit & Compliance Authority",
    desc: "External audit, compliance verification and certification access.",
  },
  ENVIRONMENTAL_CERTIFICATE_AUTHORITY: {
    label: "Environmental / Energy Certificate Authority",
    desc: "Renewable certificates, energy attributes, RECs/I-RECs and certificate lifecycle oversight.",
  },
  FINANCIAL_PAYMENT_AUTHORITY: {
    label: "Financial / Payment Authority",
    desc: "Payment, banking, financial settlement or central bank supervisory access.",
  },
  GOVERNMENT_POLICY_AGENCY: {
    label: "Government / Public Policy Agency",
    desc: "Aggregated market visibility for public policy and institutional reporting.",
  },
};

/**
 * Role color system — single source of truth for the entire platform.
 *   GENERATOR            → red     (#f87171 / red-400)
 *   SELLER               → blue    (#38bdf8 / sky-400)
 *   INVESTOR             → yellow  (#facc15 / yellow-400)
 *   USER                 → green   (#4ade80 / green-400)
 *   UTILITY              → orange  (#fb923c / orange-400)
 *   REGULATORY_AUTHORITY → violet  (#a78bfa / violet-400)
 */
export type RoleColor = {
  /** Tailwind border class fragment */
  border: string;
  /** Tailwind bg class fragment */
  bg: string;
  /** Tailwind text class fragment */
  text: string;
  /** Raw hex for SVG / inline styles */
  hex: string;
};

export const ROLE_COLORS: Record<ParticipantRole, RoleColor> = {
  GENERATOR:            { border: "border-red-400/50",    bg: "bg-red-400/10",    text: "text-red-400",    hex: "#f87171" },
  SELLER:               { border: "border-green-400/50",  bg: "bg-green-400/10",  text: "text-green-400",  hex: "#4ade80" },
  INVESTOR:             { border: "border-yellow-400/50", bg: "bg-yellow-400/10", text: "text-yellow-400", hex: "#facc15" },
  USER:                 { border: "border-sky-400/50",    bg: "bg-sky-400/10",    text: "text-sky-400",    hex: "#38bdf8" },
  UTILITY:              { border: "border-orange-400/50", bg: "bg-orange-400/10", text: "text-orange-400", hex: "#fb923c" },
  REGULATORY_AUTHORITY: { border: "border-violet-400/50", bg: "bg-violet-400/10", text: "text-violet-400", hex: "#a78bfa" },
  // Internal platform-administrator role — hidden from public signup (see register.tsx + backend ALLOWED_ROLES).
  ADMIN:                { border: "border-emerald-400/50", bg: "bg-emerald-400/10", text: "text-emerald-400", hex: "#34d399" },
};

export const ROLE_META: Record<
  ParticipantRole,
  { label: string; tagline: string; capabilities: string[]; color: RoleColor }
> = {
  GENERATOR: {
    label: "Generator",
    tagline: "Produces energy · sell-side only",
    capabilities: ["Issue energy certificates", "Create sell contracts", "Receive EPWR settlements"],
    color: ROLE_COLORS.GENERATOR,
  },
  SELLER: {
    label: "Trader",
    tagline: "Buys from generators · resells at market rate",
    capabilities: ["Buy from generators", "Resell to consumers", "Manage buy/sell spread"],
    color: ROLE_COLORS.SELLER,
  },
  INVESTOR: {
    label: "Investor",
    tagline: "Passive EPWR exposure · appreciates over time",
    capabilities: ["Track EPWR portfolio", "Monitor PLD price", "Yield & analytics"],
    color: ROLE_COLORS.INVESTOR,
  },
  USER: {
    label: "Consumer",
    tagline: "Purchases energy · pays per kWh consumed",
    capabilities: ["Buy energy contracts", "Track kWh consumption", "Direct payment"],
    color: ROLE_COLORS.USER,
  },
  UTILITY: {
    label: "Utility",
    tagline: "Concessionaire · distribution & grid operations",
    capabilities: ["Manage UC registry", "Collect TUSD settlements", "Grid connection certificates"],
    color: ROLE_COLORS.UTILITY,
  },
  REGULATORY_AUTHORITY: {
    label: "Regulatory Authority",
    tagline: "Certified read-only oversight · regulators & institutional auditors",
    capabilities: ["View audit trail", "Verify settlement receipts", "Monitor reconciliation", "Export compliance reports"],
    color: ROLE_COLORS.REGULATORY_AUTHORITY,
  },
  ADMIN: {
    label: "Platform Operator",
    tagline: "Operated by EnergyPay · may participate in the market",
    capabilities: [
      "Operates the EnergyPay platform",
      "May participate in the market — disclosed to counterparties",
      "All settlements publicly verifiable on Stellar Mainnet",
    ],
    color: ROLE_COLORS.ADMIN,
  },
};

export type WalletMode = "PLATFORM_MANAGED" | "USER_CONTROLLED";

/** Internal platform access tier — entirely separate from market-participant roles.
 *  Standard market users always have 'USER'. Admin tiers are assigned via seed script
 *  and the /api/admin/users/:id/set-platform-role endpoint (PLATFORM_OWNER only). */
export type PlatformRole = "PLATFORM_OWNER" | "PLATFORM_ADMIN" | "ACCOUNT_RECOVERY" | "USER";

// ─── Subscription ─────────────────────────────────────────────────────────────
export type SubscriptionPlan   = "FREE" | "OPERATOR" | "ENTERPRISE";
export type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "EXPIRED";

export type OperatorSubscription = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  /** ISO date of the current billing period end (next renewal or expiry). */
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  /** Settlement count used this period (FREE plan quota tracking). */
  settlementsUsed?: number;
  settlementsLimit?: number | null; // null = unlimited
};

export const SUBSCRIPTION_PLAN_META: Record<
  SubscriptionPlan,
  {
    label: string;
    priceBrl: number;
    interval: string;
    textColor: string;
    dotColor: string;
    borderColor: string;
    bgColor: string;
    settlementsLimit: number | null;
    features: string[];
  }
> = {
  FREE: {
    label: "Free",
    priceBrl: 0,
    interval: "year",
    textColor: "text-muted-foreground",
    dotColor: "bg-muted-foreground",
    borderColor: "border-border",
    bgColor: "bg-muted/10",
    settlementsLimit: 5,
    features: [
      "5 settlements / month",
      "Basic dashboard",
      "Market grid access",
      "Community support",
    ],
  },
  OPERATOR: {
    label: "Operator",
    priceBrl: 15000,
    interval: "year",
    textColor: "text-primary",
    dotColor: "bg-primary",
    borderColor: "border-primary/40",
    bgColor: "bg-primary/5",
    settlementsLimit: null,
    features: [
      "Unlimited settlements",
      "Full market analytics",
      "Active custody wallet",
      "Basic risk metrics",
      "Priority support",
      "P2P contract access",
    ],
  },
  ENTERPRISE: {
    label: "Enterprise",
    priceBrl: 30000,
    interval: "year",
    textColor: "text-violet-400",
    dotColor: "bg-violet-400",
    borderColor: "border-violet-400/40",
    bgColor: "bg-violet-400/5",
    settlementsLimit: null,
    features: [
      "Everything in Operator",
      "x402 API (50k calls / month)",
      "Multi-account",
      "Counterparty risk scoring (AI)",
      "Market price forecasting",
      "Advanced regulatory reports",
      "99.9% SLA",
      "Dedicated support",
    ],
  },
};

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  PLATFORM_OWNER:    "Platform Owner",
  PLATFORM_ADMIN:    "Platform Admin",
  ACCOUNT_RECOVERY:  "Account Recovery",
  USER:              "Standard User",
};

export type WalletStatus =
  | "PENDING"
  | "ACTIVE"
  | "ACCOUNT_NOT_FOUND"
  | "TRUSTLINE_REQUIRED"
  | "PENDING_SIGNATURE"
  | "SIGNATURE_REQUIRED"
  | "READY_FOR_SETTLEMENT"
  | "FUNDED"
  | "PROVISIONED"
  | "FAILED";

export type StellarKeypair = {
  publicKey: string;
  network: string;
  funded: boolean;
  status: WalletStatus;
  /** How this wallet's secret key is managed. Defaults to PLATFORM_MANAGED for
   *  existing users; USER_CONTROLLED wallets sign transactions locally. */
  walletMode: WalletMode;
  /** True when the account has a valid EPWR trustline on Stellar Mainnet. */
  hasEpwrTrustline: boolean;
};

export type OperatorCoords = { lat: number; lng: number; source: "GPS" | "MANUAL" };

export type OperatorIdentity = {
  operatorId: string;
  email: string;
  fullName: string;
  organization: string;
  country: string;
  state?: string;
  city: string;
  coords?: OperatorCoords;
  settlementAddress: string;
  wallet: StellarKeypair;
  roles: ParticipantRole[];
  pendingRoles: ParticipantRole[];
  accessLevel: AccessLevel;
  permissions: string[];
  network: string;
  networkStatus: "ACTIVE" | "DEGRADED" | "OFFLINE";
  funded: boolean;
  provisionedAt: string;
  token: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  phone: string | null;
  provisioningTxHash?: string | null;
  provisioningLedger?: number | null;
  settlementStatus?: string | null;
  /** Internal platform role — 'USER' for all standard participants. */
  platformRole: PlatformRole;
  /** Current platform subscription. Defaults to FREE when no subscription record exists. */
  subscription: OperatorSubscription;
};

type OperatorState = {
  operator: OperatorIdentity | null;
  isAuthenticated: boolean;
  hydrate: () => void;
  login: (input: {
    email: string;
    password: string;
    organization?: string;
  }) => Promise<OperatorIdentity>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    organization: string;
    country: string;
    state?: string;
    city: string;
    roles: ParticipantRole[];
    coords?: OperatorCoords;
    fund?: boolean;
    energyType?: "SOLAR" | "HYDRO" | "SMALL_HYDRO" | "WIND" | "BIOMASS" | "NATURAL_GAS" | "NUCLEAR" | "THERMAL" | "COGENERATION";
    walletMode?: "generate" | "link";
    existingPublicKey?: string;
    authorityType?: AuthorityType;
    documentType?: "INDIVIDUAL" | "COMPANY";
    cpfCnpj?: string;
  }) => Promise<OperatorIdentity>;
  setRoles: (roles: ParticipantRole[]) => void;
  setCoords: (coords: OperatorCoords | undefined) => void;
  setEmailVerified: (v: boolean) => void;
  setPhoneVerified: (v: boolean) => void;
  setPhone: (phone: string) => void;
  setProfile: (fields: Partial<Pick<OperatorIdentity, "fullName" | "organization" | "phone" | "country" | "state" | "city">>) => void;
  setSubscription: (sub: OperatorSubscription) => void;
  logout: () => void;
};

const ROLE_PERMISSIONS: Record<ParticipantRole, string[]> = {
  // Energy producers — may create (sell) contracts and execute settlement
  GENERATOR:            ["generation.issue", "assets.read", "contracts.create", "settlements.execute"],
  // Traders — full contract write + settlement execution
  SELLER:               ["settlements.execute", "contracts.write", "contracts.create"],
  // Passive holders — portfolio analytics only; no contract creation
  INVESTOR:             ["portfolio.read", "analytics.read"],
  // Consumers (Mercado Livre) — may create buy contracts; cannot execute settlement
  USER:                 ["billing.read", "consumption.read", "contracts.create"],
  // Distribution concessionaire — manages grid contracts and TUSD settlement flows
  UTILITY:              ["grid.manage", "tusd.collect", "uc.registry", "contracts.create", "settlements.execute"],
  // Read-only oversight — no execution, no write, no wallet, no secrets
  REGULATORY_AUTHORITY: ["audit.read", "settlement.verify", "reconciliation.monitor", "compliance.export"],
  // Platform administrator — internal role; real authority is enforced via platform_role.
  ADMIN:                ["platform.admin", "users.manage", "audit.read"],
};

const buildPermissions = (roles: ParticipantRole[]) => {
  const base = ["registry.read", "reconciliation.read"];
  const rolePerms = roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []);
  return Array.from(new Set([...base, ...rolePerms]));
};

/** Canonical display order for participant roles — single source of truth.
 *  Used for sorting role badges everywhere in the UI. */
export const ROLE_ORDER: ParticipantRole[] = [
  "GENERATOR",
  "UTILITY",
  "SELLER",
  "INVESTOR",
  "USER",
  "REGULATORY_AUTHORITY",
  "ADMIN",
];

/**
 * Sort any array of role strings into canonical display order.
 * Unknown roles are pushed to the end.
 */
export function sortRoles(roles: string[]): string[] {
  return [...roles].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a as ParticipantRole);
    const bi = ROLE_ORDER.indexOf(b as ParticipantRole);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
}

/**
 * Platform-operator disclosure — single source of truth.
 *
 * An "operator account" is one operated by EnergyPay that may ALSO participate
 * in the market. It is identified by the ADMIN role and MUST be disclosed to
 * counterparties (a "Platform Operator" tag) for transparency and conflict-of-
 * interest mitigation. All of its settlements are publicly verifiable on
 * Stellar Mainnet, and reference prices (PLD) come from an external oracle —
 * so the operator can neither hide its trades nor set prices.
 */
export const isOperatorAccount = (roles?: string[] | null): boolean =>
  Array.isArray(roles) && roles.includes("ADMIN");

const normalizeRoles = (roles: string[] | undefined): ParticipantRole[] => {
  if (!roles?.length) return ["SELLER"];
  return roles
    .map((r) => r.toUpperCase() as ParticipantRole)
    .filter((r): r is ParticipantRole => ROLE_ORDER.includes(r))
    .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
};

const identityFromSession = (session: AuthSession): OperatorIdentity => {
  const u: ApiUser = session.user;
  const roles = normalizeRoles(u.roles);
  const wallet: StellarKeypair = {
    publicKey: u.stellar_public_key,
    network: u.network ?? STELLAR_NETWORK,
    funded: !!u.funded,
    status: (u.wallet_status ?? (u.funded ? "FUNDED" : "PROVISIONED")) as WalletStatus,
    walletMode: (u.wallet_mode as WalletMode) ?? "PLATFORM_MANAGED",
    hasEpwrTrustline: !!u.has_epwr_trustline,
  };
  return {
    operatorId: u.id,
    email: u.email,
    fullName: u.full_name,
    organization: u.organization ?? "—",
    country: u.country ?? "—",
    state: u.state ?? undefined,
    city: u.city ?? "—",
    coords: u.coords
      ? { lat: u.coords.lat, lng: u.coords.lng, source: u.coords.source ?? "MANUAL" }
      : undefined,
    settlementAddress: u.stellar_public_key,
    wallet,
    roles,
    pendingRoles: normalizeRoles(u.pending_roles),
    accessLevel: "OPERATOR",
    permissions: buildPermissions(roles),
    network: u.network ?? STELLAR_NETWORK,
    networkStatus: "ACTIVE",
    funded: !!u.funded,
    emailVerified: !!u.email_verified,
    phoneVerified: !!u.phone_verified,
    phone: u.phone ?? null,
    provisionedAt: session.createdAt,
    token: session.token,
    provisioningTxHash: u.provisioning_tx_hash ?? null,
    provisioningLedger: u.provisioning_ledger ?? null,
    settlementStatus: u.settlement_status ?? (u.funded ? "FUNDED" : "PROVISIONED"),
    platformRole: (u.platform_role as PlatformRole | undefined) ?? "USER",
    subscription: u.subscription
      ? {
          plan: (u.subscription.plan as SubscriptionPlan) ?? "FREE",
          status: (u.subscription.status as SubscriptionStatus) ?? "ACTIVE",
          currentPeriodEnd: u.subscription.current_period_end ?? undefined,
          cancelAtPeriodEnd: !!u.subscription.cancel_at_period_end,
          settlementsUsed: u.subscription.settlements_used ?? 0,
          settlementsLimit: u.subscription.plan === "FREE" ? 5 : null,
        }
      : { plan: "FREE", status: "ACTIVE", settlementsUsed: 0, settlementsLimit: 5 },
  };
};

export const useOperator = create<OperatorState>()((set, get) => ({
  operator: null,
  isAuthenticated: false,

  hydrate: () => {
    const session = getSession();
    if (!session) {
      set({ operator: null, isAuthenticated: false });
      return;
    }
    set({ operator: identityFromSession(session), isAuthenticated: true });
  },

  login: async ({ email, password, organization }) => {
    if (!email || !password) {
      throw new Error("Operator email and password are required.");
    }
    const res = await apiLogin({ email, password, organization });
    const session: AuthSession = {
      token: res.token,
      user: res.user,
      createdAt: new Date().toISOString(),
    };
    setSession(session);
    const id = identityFromSession(session);
    set({ operator: id, isAuthenticated: true });
    return id;
  },

  register: async ({
    email,
    password,
    fullName,
    phone,
    organization,
    country,
    state,
    city,
    roles,
    coords,
    fund,
    energyType,
    walletMode,
    existingPublicKey,
    authorityType,
    documentType,
    cpfCnpj,
  }) => {
    if (!roles.length) throw new Error("Select at least one market participant role.");
    const payload: RegisterPayload = {
      email,
      password,
      full_name: fullName,
      phone: phone || undefined,
      organization,
      document_type: documentType,
      cpf_cnpj: cpfCnpj,
      country,
      state: state || undefined,
      city,
      roles,
      coords,
      fund: fund ?? true,
      energy_type: energyType,
      wallet_mode: walletMode,
      existing_public_key: walletMode === "link" ? existingPublicKey : undefined,
      authority_type: roles.includes("REGULATORY_AUTHORITY") ? authorityType : undefined,
    };
    const res = await apiRegister(payload);
    const session: AuthSession = {
      token: res.token,
      user: res.user,
      createdAt: new Date().toISOString(),
    };
    setSession(session);

    const id = identityFromSession(session);
    set({ operator: id, isAuthenticated: true });
    return id;
  },

  setRoles: (roles) => {
    const op = get().operator;
    if (!op) return;
    set({ operator: { ...op, roles, permissions: buildPermissions(roles) } });
  },

  setCoords: (coords) => {
    const op = get().operator;
    if (!op) return;
    set({ operator: { ...op, coords } });
  },

  setEmailVerified: (v) => {
    const op = get().operator;
    if (!op) return;
    set({ operator: { ...op, emailVerified: v } });
  },

  setPhoneVerified: (v) => {
    const op = get().operator;
    if (!op) return;
    set({ operator: { ...op, phoneVerified: v } });
  },

  setPhone: (phone) => {
    const op = get().operator;
    if (!op) return;
    set({ operator: { ...op, phone, phoneVerified: false } });
  },

  setProfile: (fields) => {
    const op = get().operator;
    if (!op) return;
    set({ operator: { ...op, ...fields } });
  },

  setSubscription: (sub) => {
    const op = get().operator;
    if (!op) return;
    set({ operator: { ...op, subscription: sub } });
  },

  logout: () => {
    clearSession();
    set({ operator: null, isAuthenticated: false });
  },
}));

// Hydrate from sessionStorage on first load (browser only).
if (typeof window !== "undefined") {
  useOperator.getState().hydrate();
}

export const maskAddress = (addr: string) =>
  addr && addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr || "—";

export const canExecuteSettlement = (op: OperatorIdentity | null) =>
  !!op &&
  (op.permissions.includes("settlements.execute") ||
    op.roles.includes("SELLER") ||
    op.accessLevel !== "OPERATOR" ||
    op.roles.includes("GENERATOR"));
