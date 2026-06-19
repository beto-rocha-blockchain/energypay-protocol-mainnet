/**
 * Backend API client — talks to the EnergyPay settlement backend.
 *
 * Default base URL: http://localhost:3000
 * Override with VITE_API_URL at build time.
 *
 * The backend is the only authority for:
 *   - wallet creation and mainnet account funding
 *   - password validation
 *   - Stellar signing
 *   - transaction submission
 *   - settlement execution
 *
 * The frontend never generates wallets or hashes — it only renders backend data.
 */

import { getSession } from "@/lib/session";

const API_ORIGIN =
  (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "");

export const API_BASE_URL = API_ORIGIN;

export type ApiError = Error & {
  status?: number;
  payload?: unknown;
};

const buildError = (status: number, message: string, payload?: unknown): ApiError => {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.payload = payload;
  return err;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
  /** Extra headers to merge (e.g. x-step-up-token for maximum-security routes). */
  headers?: Record<string, string>;
};

export async function apiRequest<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, signal, headers: extraHeaders } = opts;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const session = getSession();
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  }

  if (extraHeaders) Object.assign(headers, extraHeaders);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    throw buildError(
      0,
      `Network error reaching backend (${API_BASE_URL}). ${(err as Error).message}`,
    );
  }

  const ctype = res.headers.get("content-type") || "";
  const data = ctype.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (!res.ok) {
    const message =
      (data &&
        typeof data === "object" &&
        "error" in (data as Record<string, unknown>) &&
        String((data as Record<string, unknown>).error)) ||
      (data &&
        typeof data === "object" &&
        "message" in (data as Record<string, unknown>) &&
        String((data as Record<string, unknown>).message)) ||
      `Request failed with ${res.status}`;
    throw buildError(res.status, message, data);
  }

  return data as T;
}

/* ------------------------------------------------------------------ */
/*  Network status                                                    */
/* ------------------------------------------------------------------ */

export type StellarStatus = {
  online: boolean;
  network?: string;
  latencyMs?: number;
  ledger?: number | null;
  reason?: string;
};

/** Read-only Stellar Mainnet reachability (backend pings Horizon). Public — no auth. */
export async function apiStellarStatus(signal?: AbortSignal): Promise<StellarStatus> {
  return apiRequest<StellarStatus>("/api/health/stellar", { auth: false, signal });
}

/* ------------------------------------------------------------------ */
/*  Auth                                                              */
/* ------------------------------------------------------------------ */

export type ApiUser = {
  id: string;
  email: string;
  full_name: string;
  organization?: string;
  country?: string;
  /** Brazilian state abbreviation (e.g. "SP", "MG", "RS"). Used for submercado ANEEL mapping. */
  state?: string | null;
  city?: string;
  roles: string[];
  pending_roles?: string[];
  stellar_public_key: string;
  wallet_status?: string;
  funded?: boolean;
  network?: string;
  coords?: { lat: number; lng: number; source?: "GPS" | "MANUAL" } | null;
  email_verified?: boolean;
  phone_verified?: boolean;
  phone?: string | null;
  provisioning_tx_hash?: string | null;
  provisioning_ledger?: number | null;
  settlement_status?: string | null;
  wallet_mode?: "PLATFORM_MANAGED" | "USER_CONTROLLED";
  has_epwr_trustline?: boolean;
  /** Internal platform role — separate from market-participant roles.
   *  'USER' = standard participant; 'PLATFORM_OWNER' / 'PLATFORM_ADMIN' / 'ACCOUNT_RECOVERY' = internal admin tiers. */
  platform_role?: "PLATFORM_OWNER" | "PLATFORM_ADMIN" | "ACCOUNT_RECOVERY" | "USER";
  /** Current subscription — returned by login/register/me endpoints once the billing
   *  system is active. Absent for users with no subscription record (treated as FREE). */
  subscription?: {
    plan: string;
    status: string;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
    settlements_used?: number;
    settlements_limit?: number | null;
  } | null;
};

export type AuthResponse = {
  token: string;
  user: ApiUser;
};

export type RegisterPayload = {
  email: string;
  password: string;
  document_type?: "INDIVIDUAL" | "COMPANY";
  cpf_cnpj?: string;
  full_name: string;
  phone?: string;
  organization: string;
  country: string;
  state?: string;
  city: string;
  roles: string[];
  coords?: { lat: number; lng: number; source: "GPS" | "MANUAL" };
  fund?: boolean;
  wallet_mode?: "generate" | "link";
  existing_public_key?: string;
  /** Energy generation sources — one or more, when roles includes GENERATOR */
  energy_types?: ("SOLAR" | "HYDRO" | "SMALL_HYDRO" | "WIND" | "BIOMASS" | "NATURAL_GAS" | "NUCLEAR" | "THERMAL" | "COGENERATION")[];
  /** Primary generation source (first of energy_types) — kept for backward compatibility. */
  energy_type?: "SOLAR" | "HYDRO" | "SMALL_HYDRO" | "WIND" | "BIOMASS" | "NATURAL_GAS" | "NUCLEAR" | "THERMAL" | "COGENERATION";
  /** Granular oversight sub-category — internal/admin-only, not used in public signup.
   * TODO: block REGULATORY_AUTHORITY in the backend /api/auth/register route for
   * public signups. This field should only be accepted via an admin provisioning endpoint. */
  authority_type?: string;
};

export type LoginPayload = {
  email: string;
  password: string;
  organization?: string;
};

export const apiRegister = (payload: RegisterPayload) =>
  apiRequest<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: payload,
    auth: false,
  });

export const apiLogin = (payload: LoginPayload) =>
  apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: payload,
    auth: false,
  });

/* ------------------------------------------------------------------ */
/*  Settlement engine                                                 */
/* ------------------------------------------------------------------ */

export type SettlementExecutePayload = {
  contract_id: string;
  settlement_id?: string;
  counterparty: string;
  amount_brl: number;
  pld: number;
  window: string;
  memo?: string;
};

export type SettlementResult = {
  settlement_id: string;
  contract_id: string;
  txHash: string;
  ledger: number;
  finality_ms: number;
  status: "SETTLED" | "FAILED" | "PENDING";
  signer_public_key?: string;
  source_public_key?: string;
  error?: string;
};

export const apiExecuteSettlement = (payload: SettlementExecutePayload) =>
  apiRequest<SettlementResult>("/api/settlement/execute", {
    method: "POST",
    body: payload,
  });

/* ------------------------------------------------------------------ */
/*  Dual-mode settlement (PLATFORM_MANAGED / USER_CONTROLLED)         */
/* ------------------------------------------------------------------ */

export type PrepareSettlementPayload = {
  recipient_public_key: string;
  asset?: "EPWR" | "XLM";
  amount: number;
  memo?: string;
  contract_id?: string;
  settlement_id?: string;
};

export type PrepareSettlementResponse = {
  success: boolean;
  settlement_id: string;
  unsigned_xdr: string;
  expires_at: string;
  network: "PUBLIC";
};

export type SubmitSignedPayload = {
  settlement_id: string;
  signed_xdr: string;
  recipient_public_key?: string;
  amount_brl?: number;
  pld?: number;
  contract_id?: string;
};

export type SettlementReceipt2 = {
  success: boolean;
  tx_hash: string;
  ledger: number;
  finality_ms: number;
  explorer_url: string;
  status: "SETTLED";
};

/** Prepare an unsigned XDR for USER_CONTROLLED wallets to sign locally. */
export const apiPrepareSettlement = (payload: PrepareSettlementPayload) =>
  apiRequest<PrepareSettlementResponse>("/api/settlement/prepare", {
    method: "POST",
    body: payload,
  });

/** Submit a pre-signed XDR (USER_CONTROLLED flow). */
export const apiSubmitSignedSettlement = (payload: SubmitSignedPayload) =>
  apiRequest<SettlementReceipt2>("/api/settlement/submit-signed", {
    method: "POST",
    body: payload,
  });

/** Full server-side settlement for PLATFORM_MANAGED wallets. */
export const apiExecuteManagedSettlement = (payload: SettlementExecutePayload & { recipient_public_key?: string; amount?: number }) =>
  apiRequest<SettlementReceipt2>("/api/settlement/execute-managed", {
    method: "POST",
    body: payload,
  });

/* ------------------------------------------------------------------ */
/*  Direct settlement / P2P transfer                                  */
/* ------------------------------------------------------------------ */

export type P2PTransferPayload = {
  sender_user_id: string;
  recipient_public_key: string;
  asset: "EPWR" | "XLM";
  amount: number;
  memo?: string;
};

export type P2PLifecycleStatus =
  | "IDLE"
  | "PREPARING"
  | "SIGNING"
  | "BROADCASTING"
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "FINALIZED"
  | "FAILED";

/**
 * Canonical settlement receipt — the only shape the frontend renders.
 * Sourced 1:1 from the backend adapter, which derives every field from a
 * real Horizon submission.
 */
export type SettlementReceipt = {
  transfer_id: string;
  tx_hash: string;
  ledger: number;
  sender: string;
  recipient: string;
  asset: "EPWR" | "XLM";
  amount: number;
  memo: string;
  submitted_at: string;
  finalized_at: string;
  latency_ms: number;
  explorer_url: string;
  status: P2PLifecycleStatus;
  idempotent_replay?: boolean;
  error?: string;
};

/** Backwards-compatible alias used by older call sites. */
export type P2PTransferResult = SettlementReceipt & {
  // mirrored fields kept for transition compatibility
  source_public_key?: string;
  destination_public_key?: string;
  finality_ms?: number;
  explorer_link?: string;
  timestamp?: string;
};

export const apiSubmitP2PTransfer = (payload: P2PTransferPayload) =>
  apiRequest<P2PTransferResult>("/api/p2p/transfer", {
    method: "POST",
    body: payload,
  });

// ─── Pre-Settlement Risk Verification ──────────────────────────────────────

export type RiskStatus =
  | "PENDING"
  | "CLEARED"
  | "INSUFFICIENT_COLLATERAL"
  | "NO_EPWR_TRUSTLINE"
  | "ACCOUNT_NOT_FOUND"
  | "VERIFICATION_FAILED"
  | "BYPASSED";

export interface RiskVerificationResult {
  authorized: boolean;
  riskStatus: RiskStatus;
  reason: string;
  financialExposureBrl: number;
  requiredCollateralBrl: number;
  requiredCollateralEpwr: number;
  availableEpwr: number;
  coverageRatio: number;
  marginPct: number;
}

export const apiPreVerifyRisk = (payload: {
  buyer_public_key: string;
  volume_mwh: number;
  pld_brl: number;
  contract_id?: string;
}): Promise<{ success: boolean } & RiskVerificationResult> =>
  apiRequest("/api/settlement/pre-verify", { method: "POST", body: payload });

// ─── Utility API ────────────────────────────────────────────────────────────

export const apiGetUtilityUC = () =>
  apiRequest<{ success: boolean; users: any[] }>("/api/utility/uc");

export const apiGetUtilityConnections = () =>
  apiRequest<{ success: boolean; contracts: any[] }>("/api/utility/connections");

export const apiGetUtilityTusd = () =>
  apiRequest<{ success: boolean; settlements: any[] }>("/api/utility/tusd");

export const apiGetUtilityParticipants = () =>
  apiRequest<{ success: boolean; participants: any[] }>("/api/utility/participants");

/**
 * Server-side validated submission. Hits the local TanStack gateway
 * `/api/p2p/validate` (same origin), which validates the payload against the
 * canonical Zod schema and proxies to the settlement backend on success.
 * Returns 422 with `{ code, field, message }` for invalid payloads — the UI
 * uses this to surface field-level errors.
 */
export type P2PValidationError = {
  code: string;
  field: string;
  message: string;
};

export async function apiValidatedP2PTransfer(
  payload: P2PTransferPayload & { transfer_id?: string },
): Promise<P2PTransferResult> {
  const session = getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(`${API_BASE_URL}/api/p2p/transfer`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Backend returns { error, code } — fall back to message/error in that order.
    const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const errMsg =
      (raw?.["message"] as string | undefined) ||
      (raw?.["error"] as string | undefined) ||
      `Settlement rejected (${res.status})`;
    const err = buildError(res.status, errMsg, data);
    throw err;
  }
  return data as P2PTransferResult;
}

/* ------------------------------------------------------------------ */
/*  Registry (best-effort) — counterparties & grid nodes              */
/* ------------------------------------------------------------------ */

export type CounterpartyDTO = {
  organization: string;
  role: "GENERATOR" | "SELLER" | "INVESTOR" | "USER";
  jurisdiction: string;
  settlement_address: string;
};

export const apiListCounterparties = () =>
  apiRequest<CounterpartyDTO[]>("/api/counterparties", { method: "GET" });

/* ------------------------------------------------------------------ */
/*  Email verification                                                */
/* ------------------------------------------------------------------ */

export const apiResendVerification = () =>
  apiRequest<{ success: boolean; message: string; already_verified?: boolean; dev_verify_url?: string }>(
    "/api/auth/resend-verification",
    { method: "POST" },
  );

export const apiUpdatePhone = (phone: string) =>
  apiRequest<{ success: boolean; phone: string }>(
    "/api/auth/update-phone",
    { method: "POST", body: { phone } },
  );

export const apiUpdateProfile = (fields: {
  full_name?: string;
  organization?: string;
  phone?: string;
  country?: string;
  state?: string;
  city?: string;
}) =>
  apiRequest<{ success: boolean; user: Record<string, unknown> }>(
    "/api/auth/profile",
    { method: "PATCH", body: fields },
  );

export const apiSendPhoneCode = () =>
  apiRequest<{ success: boolean; message: string; already_verified?: boolean; dev_code?: string }>(
    "/api/auth/send-phone-code",
    { method: "POST" },
  );

export const apiVerifyPhoneCode = (code: string) =>
  apiRequest<{ success: boolean; message: string }>(
    "/api/auth/verify-phone-code",
    { method: "POST", body: { code } },
  );

/* ------------------------------------------------------------------ */
/*  Grid participants (verified users with coords)                    */
/* ------------------------------------------------------------------ */

export type GridParticipantDTO = {
  id: string;
  organization: string;
  /** Primary role (first in the roles array). */
  role: "GENERATOR" | "SELLER" | "INVESTOR" | "USER" | "UTILITY" | "REGULATORY_AUTHORITY";
  /** All roles assigned to this participant. Falls back to [role] when absent (older API). */
  roles?: string[];
  energyType: string;
  /** All generation sources for this participant (Generators may operate several). */
  energyTypes?: string[];
  settlementAddress: string;
  region: string;
  jurisdiction: string;
  coords: { lat: number; lng: number; source?: string };
  email_verified: boolean;
  /** true when coordinates are city-level approximations, not GPS */
  approximate_location?: boolean;
};

export const apiGridParticipants = () =>
  apiRequest<{ success: boolean; participants: GridParticipantDTO[] }>(
    "/api/auth/grid-participants",
    { method: "GET" },
  );

/* ------------------------------------------------------------------ */
/*  Contracts                                                          */
/* ------------------------------------------------------------------ */

export type DbContract = {
  id: string;
  contract_number: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  buyer_public_key: string;
  seller_public_key: string | null;
  buyer_label: string | null;
  seller_label: string | null;
  buyer_is_operator?: boolean;
  seller_is_operator?: boolean;
  volume_mwh: number;
  price_brl: number;
  pld_brl: number | null;
  start_date: string | null;
  end_date: string | null;
  settlement_date: string | null;
  status: "DRAFT" | "ACTIVE" | "PENDING" | "SETTLED" | "FAILED";
  state: "CREATED" | "VALIDATED" | "PENDING_SIGNATURE" | "BROADCASTING" | "CONFIRMED" | "SETTLED" | "FAILED";
  tx_hash: string | null;
  ledger: number | null;
  finality_ms: number | null;
  // PLD oracle + supply cap + informative risk (settlement engine controls)
  settled_mwh?: number | null;
  submarket?: string | null;
  settlement_hour?: number | null;
  pld_snapshot_id?: string | null;
  exposure_brl?: number | null;
  risk_band?: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  risk_status?: string | null;
  coverage_ratio?: number | null;
  collateral_available_epwr?: number | null;
  settlement_window: string;
  memo: string | null;
  document_path: string | null;
  document_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractMovement = {
  id: string;
  contract_id: string;
  from_state: string | null;
  to_state: string;
  actor_user_id: string | null;
  notes: string | null;
  tx_hash: string | null;
  ledger: number | null;
  created_at: string;
};

export type ContractReconciliation = {
  contract_id: string;
  internal_tx_hash: string | null;
  internal_ledger: number | null;
  internal_status: string;
  horizon_verified: boolean;
  horizon_ledger: number | null;
  horizon_created_at: string | null;
  horizon_successful: boolean | null;
  discrepancy: string | null;
  checked_at: string;
};

export const apiListContracts = () =>
  apiRequest<{ success: boolean; contracts: DbContract[] }>("/api/contracts", { method: "GET" });

export const apiGetContract = (id: string) =>
  apiRequest<{ success: boolean; contract: DbContract & { movements: ContractMovement[] } }>(
    `/api/contracts/${id}`,
    { method: "GET" },
  );

export const apiCreateContract = (payload: {
  contract_number?: string;
  buyer_public_key: string;
  seller_public_key?: string;
  buyer_label?: string;
  seller_label?: string;
  volume_mwh: number;
  price_brl: number;
  pld_brl?: number;
  start_date?: string;
  end_date?: string;
  settlement_date?: string;
  memo?: string;
  tx_hash?: string;
  ledger?: number;
  finality_ms?: number;
  /** Multi-party approval list. Each entry maps a wallet address to its role. */
  parties?: Array<{
    publicKey: string;
    userId?: string;
    role: "BUYER" | "SELLER" | "GUARANTOR" | "BROKER" | "WITNESS";
    label?: string;
  }>;
}) =>
  apiRequest<{ success: boolean; contract: DbContract }>("/api/contracts", {
    method: "POST",
    body: payload,
  });

export const apiActivateContract = (id: string) =>
  apiRequest<{ success: boolean; contract: DbContract }>(`/api/contracts/${id}/activate`, {
    method: "POST",
  });

export const apiRequestSettlement = (id: string) =>
  apiRequest<{ success: boolean; contract: DbContract; idempotency_key: string }>(
    `/api/contracts/${id}/request-settlement`,
    { method: "POST" },
  );

export const apiExecuteContractSettlement = (id: string, idempotencyKey?: string) =>
  apiRequest<{
    success: boolean;
    contract: DbContract;
    tx_hash: string;
    ledger: number;
    finality_ms: number;
    explorer_url: string;
  }>(`/api/contracts/${id}/execute-settlement`, {
    method: "POST",
    body: { confirmed: true, idempotency_key: idempotencyKey },
  });

export const apiGetMovements = (id: string) =>
  apiRequest<{ success: boolean; movements: ContractMovement[] }>(
    `/api/contracts/${id}/movements`,
    { method: "GET" },
  );

export const apiReconcileContract = (id: string) =>
  apiRequest<{ success: boolean; reconciliation: ContractReconciliation }>(
    `/api/contracts/${id}/reconcile`,
    { method: "GET" },
  );

/* ------------------------------------------------------------------ */
/*  Notifications                                                       */
/* ------------------------------------------------------------------ */

export type Notification = {
  id: string;
  user_id: string;
  contract_id: string | null;
  type: "APPROVAL_REQUIRED" | "APPROVED" | "REJECTED" | "SETTLED" | "INFO" | "ADMIN_ACTION";
  title: string;
  message: string;
  action_label: string | null;
  action_url: string | null;
  read: boolean;
  created_at: string;
};

export type ContractApproval = {
  id: string;
  contract_id: string;
  party_role: "BUYER" | "SELLER" | "GUARANTOR" | "BROKER" | "WITNESS";
  party_user_id: string | null;
  party_public_key: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export const apiGetNotifications = () =>
  apiRequest<{ success: boolean; notifications: Notification[]; unread_count: number }>(
    "/api/notifications",
    { method: "GET" },
  );

export const apiMarkNotificationRead = (id: string) =>
  apiRequest<{ success: boolean }>(`/api/notifications/${id}/read`, { method: "POST" });

export const apiMarkAllNotificationsRead = () =>
  apiRequest<{ success: boolean }>("/api/notifications/read-all", { method: "POST" });

export const apiDeleteNotification = (id: string) =>
  apiRequest<{ success: boolean }>(`/api/notifications/${id}`, { method: "DELETE" });

export const apiGetContractApprovals = (id: string) =>
  apiRequest<{ success: boolean; approvals: ContractApproval[] }>(
    `/api/contracts/${id}/approvals`,
    { method: "GET" },
  );

export const apiApproveContract = (id: string) =>
  apiRequest<{ success: boolean; approved: boolean; activated: boolean }>(
    `/api/contracts/${id}/approve`,
    { method: "POST" },
  );

export const apiRejectContract = (id: string, reason?: string) =>
  apiRequest<{ success: boolean; rejected: boolean }>(
    `/api/contracts/${id}/reject`,
    { method: "POST", body: { reason } },
  );

/**
 * Upload the physical contract document (PDF, Word, image, etc.)
 * Uses raw fetch so the file Buffer is sent as the body — no FormData / multer needed.
 */
export async function apiUploadIdentityDocument(
  file: File,
): Promise<{ success: boolean; document_name: string }> {
  const session = getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "x-file-name": encodeURIComponent(file.name),
  };
  if (session?.token) headers["Authorization"] = `Bearer ${session.token}`;
  const res = await fetch(`${API_BASE_URL}/api/auth/identity-document`, {
    method: "POST",
    headers,
    body: file,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as Record<string, unknown>).error)
        : `Upload failed (${res.status})`;
    throw new Error(msg);
  }
  return data as { success: boolean; document_name: string };
}

export async function apiUploadContractDocument(
  contractId: string,
  file: File,
): Promise<{ success: boolean; document_path: string; document_name: string; signed_url: string | null }> {
  const session = getSession();
  const headers: Record<string, string> = {
    "Content-Type": file.type || "application/octet-stream",
  };
  if (session?.token) headers["Authorization"] = `Bearer ${session.token}`;

  const url = `${API_BASE_URL}/api/contracts/${contractId}/document?filename=${encodeURIComponent(file.name)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: file });
  } catch (err) {
    throw new Error(`Network error uploading document: ${(err as Error).message}`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).error)
        : null) || `Upload failed with ${res.status}`;
    throw new Error(msg);
  }
  return data as { success: boolean; document_path: string; document_name: string; signed_url: string | null };
}

/** Fetch a fresh 1-hour signed URL for the document attached to a contract. */
export const apiGetContractDocumentUrl = (contractId: string) =>
  apiRequest<{ success: boolean; document_name: string; signed_url: string }>(
    `/api/contracts/${contractId}/document`,
    { method: "GET" },
  );

/* ------------------------------------------------------------------ */
/*  Platform Admin                                                     */
/* ------------------------------------------------------------------ */

export type PlatformRole = "PLATFORM_OWNER" | "PLATFORM_ADMIN" | "ACCOUNT_RECOVERY" | "USER";

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  organization: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  phone: string | null;
  roles: string[];
  pending_roles: string[];
  platform_role: PlatformRole;
  account_status: "ACTIVE" | "BLOCKED" | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  wallet_mode: string | null;
  wallet_status: string | null;
  stellar_public_key: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  funded: boolean;
  created_at: string;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  actor: { id: string; email: string; full_name: string | null; platform_role?: PlatformRole } | null;
  target: { id: string; email: string; full_name: string | null } | null;
};

export type RecoveryLink = {
  id: string;
  created_at: string;
  account: { id: string; email: string; full_name: string | null; platform_role: PlatformRole };
  recovery: { id: string; email: string; full_name: string | null; platform_role: PlatformRole };
};

export const apiAdminListUsers = (params?: { search?: string; page?: number; limit?: number; platform_role?: PlatformRole }) => {
  const qs = new URLSearchParams();
  if (params?.search)          qs.set("search", params.search);
  if (params?.page)            qs.set("page", String(params.page));
  if (params?.limit)           qs.set("limit", String(params.limit));
  if (params?.platform_role)   qs.set("platform_role", params.platform_role);
  return apiRequest<{ success: boolean; users: AdminUser[]; total: number; page: number; limit: number }>(
    `/api/admin/users${qs.toString() ? `?${qs}` : ""}`,
  );
};

export const apiAdminGetUser = (id: string) =>
  apiRequest<{ success: boolean; user: AdminUser }>(`/api/admin/users/${id}`);

export const apiAdminUpdateUser = (id: string, payload: Partial<Pick<AdminUser, "full_name" | "organization" | "phone" | "country" | "state" | "city">>) =>
  apiRequest<{ success: boolean; user: AdminUser }>(`/api/admin/users/${id}`, { method: "PATCH", body: payload });

export const apiAdminSetPassword = (id: string, newPassword: string, reason?: string) =>
  apiRequest<{ success: boolean; message: string }>(`/api/admin/users/${id}/set-password`, {
    method: "POST",
    body: { new_password: newPassword, reason },
  });

export const apiAdminSetPlatformRole = (id: string, platformRole: PlatformRole) =>
  apiRequest<{ success: boolean; platform_role: PlatformRole }>(`/api/admin/users/${id}/set-platform-role`, {
    method: "POST",
    body: { platform_role: platformRole },
  });

export const apiAdminSetRoles = (id: string, roles: string[]) =>
  apiRequest<{ success: boolean; roles: string[] }>(`/api/admin/users/${id}/set-roles`, {
    method: "POST",
    body: { roles },
  });

export const apiAdminApproveRoles = (id: string, roles: string[], approve: boolean) =>
  apiRequest<{ success: boolean; roles: string[]; pending_roles: string[] }>(
    `/api/admin/users/${id}/approve-roles`,
    { method: "POST", body: { roles, approve } },
  );

export const apiAdminSetEmail = (id: string, email: string) =>
  apiRequest<{ success: boolean; email: string }>(`/api/admin/users/${id}/set-email`, {
    method: "POST",
    body: { email },
  });

// Manually approve a user's email and/or phone verification (OWNER or ADMIN), so
// they become visible to other participants without the email/OTP round-trip.
export const apiAdminVerifyUser = (id: string, fields: { email?: boolean; phone?: boolean }) =>
  apiRequest<{ success: boolean; email_verified: boolean; phone_verified: boolean }>(
    `/api/admin/users/${id}/verify`,
    { method: "POST", body: fields },
  );

export const apiAdminBlockUser = (id: string, reason?: string) =>
  apiRequest<{ success: boolean }>(`/api/admin/users/${id}/block`, {
    method: "POST",
    body: { reason },
  });

export const apiAdminUnblockUser = (id: string) =>
  apiRequest<{ success: boolean }>(`/api/admin/users/${id}/unblock`, { method: "POST" });

export const apiAdminAuditLog = (params?: { page?: number; limit?: number; action?: string; target_id?: string }) => {
  const qs = new URLSearchParams();
  if (params?.page)      qs.set("page", String(params.page));
  if (params?.limit)     qs.set("limit", String(params.limit));
  if (params?.action)    qs.set("action", params.action);
  if (params?.target_id) qs.set("target_id", params.target_id);
  return apiRequest<{ success: boolean; entries: AuditLogEntry[]; total: number }>(
    `/api/admin/audit-log${qs.toString() ? `?${qs}` : ""}`,
  );
};

// Owner-only feed of actions performed by OTHER admins ("Deus" activity feed).
export const apiAdminActivity = (params?: { page?: number; limit?: number }) => {
  const qs = new URLSearchParams();
  if (params?.page)  qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiRequest<{ success: boolean; entries: AuditLogEntry[]; total: number }>(
    `/api/admin/activity${qs.toString() ? `?${qs}` : ""}`,
  );
};

export const apiAdminGetRecoveryLinks = () =>
  apiRequest<{ success: boolean; links: RecoveryLink[] }>("/api/admin/recovery-links");

export const apiAdminAddRecoveryLink = (accountId: string, recoveryAccountId: string) =>
  apiRequest<{ success: boolean }>("/api/admin/recovery-links", {
    method: "POST",
    body: { account_id: accountId, recovery_account_id: recoveryAccountId },
  });

export const apiAdminRemoveRecoveryLink = (linkId: string) =>
  apiRequest<{ success: boolean }>(`/api/admin/recovery-links/${linkId}`, { method: "DELETE" });

// ── Subscriptions ─────────────────────────────────────────────────────────────

export type SubscriptionCheckoutPixResponse = {
  success: true;
  payment_method: "pix";
  pix_qr_code?: string;
  pix_qr_code_text?: string;
  pix_expires_at?: string;
  payment_id?: string;
  subscription_id?: string;
  pix_pending?: boolean;
  message?: string;
};

export type SubscriptionCheckoutCardResponse = {
  success: true;
  payment_method: "credit_card";
  payment_url: string;
  subscription_id?: string;
};

export type SubscriptionCheckoutResponse =
  | SubscriptionCheckoutPixResponse
  | SubscriptionCheckoutCardResponse;

export type SubscriptionMeResponse = {
  success: boolean;
  subscription: {
    plan: string;
    status: string;
    current_period_start?: string;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
    settlements_used: number;
    settlements_limit: number | null;
    gateway?: string | null;
  };
};

export const apiSubscriptionPlans = () =>
  apiRequest<{ success: boolean; plans: Array<{ id: string; name: string; price_brl: number; settlements_limit: number | null; features: string[] }> }>(
    "/api/subscriptions/plans"
  );

export const apiSubscriptionMe = () =>
  apiRequest<SubscriptionMeResponse>("/api/subscriptions/me");

export const apiSubscriptionCheckout = (
  plan_id: "operator" | "enterprise",
  payment_method: "pix" | "credit_card",
  cpf_cnpj?: string
) =>
  apiRequest<SubscriptionCheckoutResponse>("/api/subscriptions/checkout", {
    method: "POST",
    body: { plan_id, payment_method, ...(cpf_cnpj ? { cpf_cnpj } : {}) },
  });

export const apiSubscriptionCancel = () =>
  apiRequest<{ success: boolean; message: string }>("/api/subscriptions/cancel", {
    method: "POST",
  });

export const apiSubscriptionPaymentStatus = (paymentId: string) =>
  apiRequest<{ success: boolean; payment_id: string; status: string; confirmed: boolean }>(
    `/api/subscriptions/payment-status/${paymentId}`
  );

/* ------------------------------------------------------------------ */
/*  Step-up authentication (maximum-security re-confirmation)         */
/* ------------------------------------------------------------------ */

export type StepUpResponse = {
  success: boolean;
  step_up_token: string;
  scope: "step-up";
  expires_in: number;
};

/** Re-confirm the account password → short-lived step-up token (5 min). */
export const apiStepUp = (password: string) =>
  apiRequest<StepUpResponse>("/api/auth/step-up", {
    method: "POST",
    body: { password },
  });

/* ------------------------------------------------------------------ */
/*  Crypto billing — isolated XLM / USDC subscription payments        */
/* ------------------------------------------------------------------ */

export type CryptoBillingAsset = "XLM" | "USDC";

export type CryptoInvoice = {
  id: string;
  plan_id: string;
  asset: CryptoBillingAsset;
  asset_code: string;
  asset_issuer: string | null;
  expected_amount: string;
  amount_brl: number;
  exchange_rate: string | null;
  rate_source: string | null;
  treasury_public_key: string;
  payment_reference: string;
  memo: string;
  status: "PENDING_PAYMENT" | "PAID" | "EXPIRED" | "FAILED";
  tx_hash?: string | null;
  ledger?: number | null;
  amount_received?: string | null;
  confirmed_at?: string | null;
  explorer_url?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  treasury_explorer_url?: string;
};

/** Create a crypto payment invoice (no wallet is debited — external transfer). */
export const apiCreateCryptoInvoice = (plan_id: "operator" | "enterprise", asset: CryptoBillingAsset) =>
  apiRequest<{ success: boolean; invoice: CryptoInvoice }>("/api/billing/crypto/invoice", {
    method: "POST",
    body: { plan_id, asset },
  });

export const apiGetCryptoInvoice = (id: string) =>
  apiRequest<{ success: boolean; invoice: CryptoInvoice }>(`/api/billing/crypto/invoice/${id}`);

/** Read-only Horizon verification — confirms the on-chain payment, if any. */
export const apiVerifyCryptoInvoice = (id: string) =>
  apiRequest<{ success: boolean; status: CryptoInvoice["status"]; invoice: CryptoInvoice; note?: string }>(
    `/api/billing/crypto/invoice/${id}/verify`,
    { method: "POST" },
  );

/* ------------------------------------------------------------------ */
/*  Payment cards (tokenised — max 5, step-up gated)                  */
/* ------------------------------------------------------------------ */

export type PaymentCard = {
  id: string;
  brand: string | null;
  last4: string | null;
  holder_name: string | null;
  exp_month: string | null;
  exp_year: string | null;
  is_default: boolean;
  created_at: string | null;
};

export type AddCardPayload = {
  holder_name: string;
  number: string;
  expiry_month: string;
  expiry_year: string;
  ccv: string;
  postal_code?: string;
  address_number?: string;
  phone?: string;
};

export const apiListCards = () =>
  apiRequest<{ success: boolean; cards: PaymentCard[]; count: number; max: number }>(
    "/api/billing/cards",
  );

/** Tokenise + save a card. Requires a step-up token. PAN/CVV never persisted. */
export const apiAddCard = (payload: AddCardPayload, stepUpToken: string) =>
  apiRequest<{ success: boolean; card: PaymentCard }>("/api/billing/cards", {
    method: "POST",
    body: payload,
    headers: { "x-step-up-token": stepUpToken },
  });

export const apiDeleteCard = (id: string, stepUpToken: string) =>
  apiRequest<{ success: boolean; deleted: boolean; message: string }>(`/api/billing/cards/${id}`, {
    method: "DELETE",
    headers: { "x-step-up-token": stepUpToken },
  });

export const apiSetDefaultCard = (id: string, stepUpToken: string) =>
  apiRequest<{ success: boolean; default_card_id: string }>(`/api/billing/cards/${id}/default`, {
    method: "PUT",
    headers: { "x-step-up-token": stepUpToken },
  });

/* ------------------------------------------------------------------ */
/*  Billing documents — paid invoices, fiscal docs & receipts         */
/* ------------------------------------------------------------------ */

export type BillingInvoice = {
  id: string;
  source: "subscription_payment" | "crypto_invoice";
  plan_id: string;
  plan_name: string;
  amount_brl: number;
  currency: "BRL";
  asset?: string;
  asset_code?: string;
  amount_received?: string | null;
  method: string;
  status: "paid";
  paid_at: string | null;
  gateway?: string | null;
  gateway_invoice_url?: string | null;
  tx_hash?: string | null;
  ledger?: number | null;
  explorer_url?: string | null;
  receipt_url: string;
};

export type FiscalReadiness = {
  provider: string;
  can_issue_official: boolean;
  company_profile_status: string;
  certificate_status: string;
  document_status: string;
  message_en: string;
  message_pt: string;
};

export type ReceiptDocument = {
  source: "subscription_payment" | "crypto_invoice";
  payment_id: string;
  type: "RECEIPT";
  status: "RECEIPT_AVAILABLE";
  provider: "NONE";
  plan_id: string;
  amount_brl: number;
  issued_at: string | null;
  receipt_url: string;
};

export type FiscalDocumentRecord = {
  id: string;
  user_id: string;
  payment_id: string;
  payment_source: "subscription_payment" | "crypto_invoice";
  type: "RECEIPT" | "NFE" | "NFSE";
  status: string;
  provider: string;
  document_number: string | null;
  verification_code: string | null;
  access_key: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  signed_xml_url: string | null;
  issued_at: string | null;
  error_message: string | null;
  created_at: string;
};

export const apiListPaidInvoices = () =>
  apiRequest<{ success: boolean; invoices: BillingInvoice[]; count: number }>(
    "/api/billing/documents/invoices",
  );

export const apiListBillingDocuments = () =>
  apiRequest<{
    success: boolean;
    fiscal: FiscalReadiness;
    receipts: ReceiptDocument[];
    fiscal_documents: FiscalDocumentRecord[];
  }>("/api/billing/documents/documents");

/**
 * Download a payment-receipt PDF. Requires a fresh step-up token. Returns a
 * Blob the caller can turn into an object URL / trigger a browser download.
 */
export async function apiDownloadReceipt(
  source: "subscription_payment" | "crypto_invoice",
  id: string,
  stepUpToken: string,
): Promise<Blob> {
  const session = getSession();
  const headers: Record<string, string> = {
    Accept: "application/pdf",
    "x-step-up-token": stepUpToken,
  };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  const url = `${API_BASE_URL}/api/billing/documents/receipt/${source}/${id}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers });
  } catch (err) {
    throw buildError(0, `Network error downloading receipt. ${(err as Error).message}`);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const msg =
      (data && typeof data === "object" && "error" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).error)
        : null) || `Receipt download failed with ${res.status}`;
    throw buildError(res.status, msg, data);
  }

  return res.blob();
}
