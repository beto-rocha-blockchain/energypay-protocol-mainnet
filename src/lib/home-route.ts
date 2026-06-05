/**
 * Resolve the post-authentication landing page for an operator.
 *
 * Most users land on `/contracts` (the registry where they create and manage
 * bilateral energy contracts) — that's the primary flow on the platform and
 * the page real users will actually need from the moment they sign in.
 * Operators without a contract-creation role (e.g. INVESTOR or
 * REGULATORY_AUTHORITY only) land on `/wallet` instead, because there's no
 * obvious "first action" for them in the contracts view.
 *
 * Used by /login (after a successful sign-in) and by /register (after the
 * "Enter Settlement Control Room" CTA on the success screen).
 */

const CONTRACT_CREATE_ROLES = new Set(["GENERATOR", "SELLER", "USER", "UTILITY"]);

export type HomeRoute = "/contracts" | "/wallet";

export function homeRouteFor(operator?: { roles?: readonly string[] } | null): HomeRoute {
  const roles = operator?.roles ?? [];
  return roles.some((r) => CONTRACT_CREATE_ROLES.has(String(r).toUpperCase()))
    ? "/contracts"
    : "/wallet";
}
