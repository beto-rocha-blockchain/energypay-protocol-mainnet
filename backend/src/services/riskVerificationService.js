/**
 * Counterparty Risk Assessment — EnergyPay Pre-Settlement Layer (INFORMATIVE).
 *
 * EPWR represents ENERGY (1 EPWR = 1 MWh), NOT money — so this layer no longer
 * treats EPWR as financial collateral and NEVER blocks settlement. It produces
 * an informative assessment for the UI / audit / risk panels:
 *
 *   exposure_brl    = volume_mwh × pld_brl         (financial exposure of the position)
 *   energy coverage = counterparty EPWR holdings (MWh) ÷ volume_mwh   (informational)
 *   risk_band       = LOW | MEDIUM | HIGH | UNKNOWN (from coverage + data availability)
 *
 * Settlement is blocked ONLY by objective violations (missing/invalid PLD
 * snapshot, supply cap exceeded, invalid contract) enforced in the settlement
 * routes — never here. Real financial collateral (a BRL-stable / USDC escrow)
 * is a future layer, pending product/legal (Eduardo).
 */

import { horizon } from "../lib/stellar-network.js";

const MARGIN_PCT = 10;
const SAFETY_MARGIN = 1.1; // reference over-coverage margin (informational)
const round2 = (n) => Math.round(n * 100) / 100;

function riskBand(status, coverageRatio) {
  if (status !== "ASSESSED") return "UNKNOWN";
  if (coverageRatio >= 1) return "LOW";
  if (coverageRatio >= 0.5) return "MEDIUM";
  return "HIGH";
}

/**
 * Informative counterparty assessment. Never throws to block; on any issue it
 * returns a status the caller can display. `authorized` is always true (kept for
 * backward compatibility — risk no longer gates settlement).
 *
 * @param {string} counterpartyPublicKey
 * @param {number} volumeMwh
 * @param {number} pldBrl
 */
export async function verifyCounterpartyRisk(counterpartyPublicKey, volumeMwh, pldBrl) {
  const exposureBrl = round2(Number(volumeMwh) * Number(pldBrl));
  const base = {
    authorized: true, // risk is informative — objective gates block, not this
    volumeMwh: Number(volumeMwh),
    pldBrl: Number(pldBrl),
    exposureBrl,
    exposureWithMarginBrl: round2(exposureBrl * SAFETY_MARGIN),
    marginPct: MARGIN_PCT,
    availableEpwr: 0,
    coverageRatio: 0,
  };

  const epwrIssuer = process.env.EPWR_ISSUER_PUBLIC_KEY;
  if (!epwrIssuer) {
    return {
      ...base,
      riskStatus: "ISSUER_NOT_CONFIGURED",
      riskBand: "UNKNOWN",
      reason: "EPWR issuer not configured — energy coverage not read; exposure reported for information only.",
    };
  }
  if (!counterpartyPublicKey) {
    return { ...base, riskStatus: "ACCOUNT_NOT_FOUND", riskBand: "UNKNOWN", reason: "No counterparty public key provided." };
  }

  try {
    const account = await horizon.loadAccount(counterpartyPublicKey);
    const epwr = account.balances.find(
      (b) => b.asset_type !== "native" && b.asset_code === "EPWR" && b.asset_issuer === epwrIssuer,
    );
    if (!epwr) {
      return {
        ...base,
        riskStatus: "NO_EPWR_TRUSTLINE",
        riskBand: "UNKNOWN",
        reason: `Counterparty ${counterpartyPublicKey.slice(0, 8)}… has no EPWR trustline (informational).`,
      };
    }
    const availableEpwr = Number(epwr.balance);
    const coverageRatio = Number(volumeMwh) > 0 ? availableEpwr / Number(volumeMwh) : 0;
    return {
      ...base,
      availableEpwr,
      coverageRatio: Math.round(coverageRatio * 10000) / 10000,
      riskStatus: "ASSESSED",
      riskBand: riskBand("ASSESSED", coverageRatio),
      reason: `Exposure R$ ${exposureBrl.toFixed(2)} · counterparty holds ${availableEpwr.toFixed(2)} EPWR (energy) = ${(coverageRatio * 100).toFixed(0)}% of volume (informational).`,
    };
  } catch (err) {
    if (err?.response?.status === 404 || err?.status === 404) {
      return {
        ...base,
        riskStatus: "ACCOUNT_NOT_FOUND",
        riskBand: "UNKNOWN",
        reason: `Counterparty ${counterpartyPublicKey.slice(0, 8)}… not found on Stellar Mainnet (informational).`,
      };
    }
    return { ...base, riskStatus: "VERIFICATION_FAILED", riskBand: "UNKNOWN", reason: `Assessment failed: ${err.message}` };
  }
}

/** @deprecated Risk no longer gates settlement — always returns true. */
export async function canSettle() {
  return true;
}
