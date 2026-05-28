/**
 * Counterparty Risk Verification Service — EnergyPay Pre-Settlement Layer
 *
 * Problem: In CCEE, counterparty default is discovered at D+30–D+60.
 * Solution: Verify EPWR collateral on Stellar Mainnet BEFORE settlement,
 *   enabling instant risk assessment and settlement blocking.
 *
 * Formula:
 *   financial_exposure_brl = volume_mwh × pld_brl
 *   required_collateral_epwr = financial_exposure_brl × 1.1  (10% margin)
 *   authorized = buyer.epwr_balance >= required_collateral_epwr
 *
 * 1 EPWR = 1 BRL (platform settlement unit — adjustable via oracle)
 */

import { horizon } from "../lib/stellar-network.js";

const SAFETY_MARGIN = 1.1; // 10% overcollateralization
const MARGIN_PCT = 10;

/**
 * Verify counterparty collateral sufficiency on Stellar Mainnet.
 *
 * @param {string} buyerPublicKey  - Stellar G-address of the buyer
 * @param {number} volumeMwh       - Contract volume in MWh
 * @param {number} pldBrl          - PLD settlement price in BRL/MWh
 * @returns {Promise<object>}      - Full risk assessment object
 */
export async function verifyCounterpartyRisk(buyerPublicKey, volumeMwh, pldBrl) {
  const epwrIssuer = process.env.EPWR_ISSUER_PUBLIC_KEY;

  const financialExposureBrl = Number(volumeMwh) * Number(pldBrl);
  const requiredCollateralBrl = financialExposureBrl * SAFETY_MARGIN;
  const requiredCollateralEpwr = requiredCollateralBrl; // 1 EPWR = 1 BRL

  // If EPWR issuer is not configured, skip verification (bypass mode)
  if (!epwrIssuer) {
    console.warn("[RiskVerification] EPWR_ISSUER_PUBLIC_KEY not set — bypassing risk check.");
    return {
      authorized: true,
      riskStatus: "BYPASSED",
      reason: "EPWR_ISSUER_PUBLIC_KEY not configured — risk check bypassed.",
      financialExposureBrl,
      requiredCollateralBrl,
      requiredCollateralEpwr,
      availableEpwr: 0,
      coverageRatio: 0,
      marginPct: MARGIN_PCT,
    };
  }

  try {
    const account = await horizon.loadAccount(buyerPublicKey);

    // Find EPWR balance in the account's trustlines
    const epwrBalance = account.balances.find(
      (b) => b.asset_type !== "native" && b.asset_code === "EPWR" && b.asset_issuer === epwrIssuer,
    );

    // Account exists but has no EPWR trustline
    if (!epwrBalance) {
      return {
        authorized: false,
        riskStatus: "NO_EPWR_TRUSTLINE",
        reason: `Buyer account ${buyerPublicKey.slice(0, 8)}… has no EPWR trustline with issuer ${epwrIssuer.slice(0, 8)}….`,
        financialExposureBrl,
        requiredCollateralBrl,
        requiredCollateralEpwr,
        availableEpwr: 0,
        coverageRatio: 0,
        marginPct: MARGIN_PCT,
      };
    }

    const availableEpwr = Number(epwrBalance.balance);
    const coverageRatio =
      requiredCollateralEpwr > 0 ? availableEpwr / requiredCollateralEpwr : 0;
    const authorized = availableEpwr >= requiredCollateralEpwr;

    return {
      authorized,
      riskStatus: authorized ? "CLEARED" : "INSUFFICIENT_COLLATERAL",
      reason: authorized
        ? `Collateral sufficient. Buyer holds ${availableEpwr.toFixed(7)} EPWR; required ${requiredCollateralEpwr.toFixed(7)} EPWR (coverage ${(coverageRatio * 100).toFixed(1)}%).`
        : `Insufficient collateral. Buyer holds ${availableEpwr.toFixed(7)} EPWR; required ${requiredCollateralEpwr.toFixed(7)} EPWR (coverage ${(coverageRatio * 100).toFixed(1)}%, shortfall ${(requiredCollateralEpwr - availableEpwr).toFixed(7)} EPWR).`,
      financialExposureBrl,
      requiredCollateralBrl,
      requiredCollateralEpwr,
      availableEpwr,
      coverageRatio,
      marginPct: MARGIN_PCT,
    };
  } catch (err) {
    // Horizon 404 — account does not exist on Stellar Mainnet
    if (err?.response?.status === 404 || err?.status === 404) {
      return {
        authorized: false,
        riskStatus: "ACCOUNT_NOT_FOUND",
        reason: `Buyer account ${buyerPublicKey.slice(0, 8)}… not found on Stellar Mainnet.`,
        financialExposureBrl,
        requiredCollateralBrl,
        requiredCollateralEpwr,
        availableEpwr: 0,
        coverageRatio: 0,
        marginPct: MARGIN_PCT,
      };
    }

    console.error("[RiskVerification] Horizon error:", err.message);
    return {
      authorized: false,
      riskStatus: "VERIFICATION_FAILED",
      reason: `Risk verification failed: ${err.message}`,
      financialExposureBrl,
      requiredCollateralBrl,
      requiredCollateralEpwr,
      availableEpwr: 0,
      coverageRatio: 0,
      marginPct: MARGIN_PCT,
    };
  }
}

/**
 * Convenience helper — returns true only when collateral is sufficient.
 *
 * @param {string} buyerPublicKey
 * @param {number} volumeMwh
 * @param {number} pldBrl
 * @returns {Promise<boolean>}
 */
export async function canSettle(buyerPublicKey, volumeMwh, pldBrl) {
  const result = await verifyCounterpartyRisk(buyerPublicKey, volumeMwh, pldBrl);
  return result.authorized;
}
