/**
 * Settlement routes — dual-mode execution.
 *
 * POST /api/settlement/prepare
 *   Returns an unsigned XDR for USER_CONTROLLED wallets to sign locally.
 *
 * POST /api/settlement/submit-signed
 *   Accepts a signed XDR from the frontend (USER_CONTROLLED flow) and
 *   submits it to Stellar Mainnet.
 *
 * POST /api/settlement/execute-managed
 *   Full server-side execution for PLATFORM_MANAGED wallets (existing behaviour).
 *
 * Security:
 *   - Secret keys are NEVER accepted by any of these endpoints.
 *   - USER_CONTROLLED wallets sign locally; only the signed XDR is sent here.
 *   - Signed XDR is submitted to Horizon and immediately discarded.
 */

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  executeSettlement,
  prepareUnsignedXdr,
  submitSignedXdr,
} from "../services/stellarSettlementService.js";
import { supabase } from "../lib/supabase.js";
import { explorerTxUrl } from "../lib/stellar-network.js";

const router = express.Router();

// ─── Prepare unsigned XDR (USER_CONTROLLED) ───────────────────────────────────

router.post("/prepare", requireAuth, async (req, res) => {
  try {
    const {
      recipient_public_key,
      asset = "XLM",
      amount,
      memo,
    } = req.body;

    const senderPublicKey = req.operator?.publicKey;
    if (!senderPublicKey) {
      return res.status(401).json({ success: false, error: "No wallet public key in session." });
    }

    if (!recipient_public_key || !amount) {
      return res.status(400).json({ success: false, error: "recipient_public_key and amount are required." });
    }

    const unsignedXdr = await prepareUnsignedXdr({
      senderPublicKey,
      recipientPublicKey: recipient_public_key,
      asset,
      amount: String(amount),
      memo,
    });

    const settlementId = `STL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    return res.json({
      success: true,
      settlement_id: settlementId,
      unsigned_xdr: unsignedXdr,
      expires_at: expiresAt,
      network: "PUBLIC",
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});

// ─── Submit signed XDR (USER_CONTROLLED) ──────────────────────────────────────

router.post("/submit-signed", requireAuth, async (req, res) => {
  try {
    const { settlement_id, signed_xdr } = req.body;

    if (!signed_xdr) {
      return res.status(400).json({ success: false, error: "signed_xdr is required." });
    }

    // SECURITY: signed_xdr is submitted to Horizon and never stored or logged.
    const result = await submitSignedXdr(signed_xdr);

    // Persist settlement audit record
    try {
      await supabase.from("settlements").insert({
        settlement_id: settlement_id ?? `STL-${result.txHash.slice(0, 8)}`,
        contract_id: req.body.contract_id ?? "USER_CONTROLLED_P2P",
        buyer: req.operator?.sub ?? "unknown",
        seller: req.body.recipient_public_key ?? "unknown",
        amount_brl: Number(req.body.amount_brl ?? 0),
        pld: Number(req.body.pld ?? 0),
        tx_hash: result.txHash,
        ledger: result.ledger,
        status: "SETTLED",
      });
    } catch (auditErr) {
      console.warn("[Settlement] Audit insert failed (non-fatal):", auditErr.message);
    }

    return res.json({
      success: true,
      tx_hash: result.txHash,
      ledger: result.ledger,
      finality_ms: result.finalityMs,
      explorer_url: result.explorerUrl,
      status: "SETTLED",
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});

// ─── Execute managed settlement (PLATFORM_MANAGED) ────────────────────────────

router.post("/execute-managed", requireAuth, async (req, res) => {
  try {
    const payload = {
      ...req.body,
      sender_user_id: req.operator?.sub ?? req.operator?.id,
    };

    // Non-blocking risk check — enriches audit record but does NOT block P2P settlements
    let riskResult = null;
    const { volume_mwh, pld_brl, recipient_public_key } = req.body;
    if (volume_mwh != null && pld_brl != null && recipient_public_key) {
      try {
        const { verifyCounterpartyRisk } = await import("../services/riskVerificationService.js");
        riskResult = await verifyCounterpartyRisk(recipient_public_key, volume_mwh, pld_brl);
        if (!riskResult.authorized) {
          console.warn(
            `[Settlement] execute-managed risk warning: ${riskResult.riskStatus} — ${riskResult.reason}`,
          );
        }
      } catch (riskErr) {
        console.warn("[Settlement] execute-managed risk check non-fatal:", riskErr.message);
      }
    }

    const result = await executeSettlement(payload, { operator: req.operator });

    return res.json({
      success: true,
      tx_hash: result.txHash,
      ledger: result.ledger,
      finality_ms: result.finalityMs,
      explorer_url: explorerTxUrl(result.txHash),
      status: "SETTLED",
      counterparty_risk_verified: riskResult != null,
      risk_status: riskResult?.riskStatus ?? "BYPASSED",
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});

// ─── Pre-verify counterparty risk ─────────────────────────────────────────────
// Advisory check — does NOT execute any transaction.
// Call this before activating or settling a contract to assess collateral.

router.post("/pre-verify", requireAuth, async (req, res) => {
  try {
    const { buyer_public_key, volume_mwh, pld_brl, contract_id } = req.body;

    if (!buyer_public_key || volume_mwh == null || pld_brl == null) {
      return res.status(400).json({
        success: false,
        error: "buyer_public_key, volume_mwh and pld_brl are required.",
      });
    }

    const { verifyCounterpartyRisk } = await import("../services/riskVerificationService.js");
    const result = await verifyCounterpartyRisk(buyer_public_key, volume_mwh, pld_brl);

    // Optionally persist result to contract if contract_id provided
    if (contract_id) {
      await supabase.from("contracts").update({
        risk_status: result.riskStatus,
        collateral_required_brl: result.requiredCollateralBrl,
        collateral_available_epwr: result.availableEpwr,
        coverage_ratio: result.coverageRatio,
        risk_verified_at: new Date().toISOString(),
      }).eq("id", contract_id);
    }

    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
