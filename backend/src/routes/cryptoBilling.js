/**
 * Crypto billing — ISOLATED subscription payment via XLM / USDC.
 *
 * This module is intentionally self-contained. It NEVER imports or touches:
 *   · the settlement engine / stellarSettlementService
 *   · custody / managed wallets / trustlines
 *   · any signing path or secret keys
 *
 * The flow is external + read-only:
 *   1. POST /invoice          → create a PENDING_PAYMENT invoice with the
 *                               treasury address, accepted asset, expected
 *                               amount and a unique memo (payment reference).
 *   2. The user pays from ANY external Stellar wallet to the treasury.
 *   3. POST /invoice/:id/verify → read Horizon (Mainnet) and confirm the
 *                               payment matches destination / asset / amount /
 *                               memo / success. On match → mark PAID + activate
 *                               the plan. No wallet is ever debited here.
 *   4. GET  /invoice/:id      → poll status.
 *
 * Asset config is env-driven (no issuer hardcoded):
 *   · ENERGY_PAY_TREASURY_PUBLIC_KEY  — destination treasury account (required)
 *   · USDC_ASSET_CODE                 — default "USDC"
 *   · USDC_ISSUER                     — USDC issuer public key (required for USDC)
 *
 * Live FX (BRL → asset) comes from CoinGecko, the same source the StatusBar
 * ticker uses. If the rate is unavailable the invoice is NOT created (we never
 * guess a price for real money).
 */

import express from "express";
import crypto from "crypto";
import { StrKey } from "@stellar/stellar-sdk";

import { supabase } from "../lib/supabase.js";
import { HORIZON_URL, explorerTxUrl, explorerAccountUrl } from "../lib/stellar-network.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// ─── Config helpers ──────────────────────────────────────────────────────────

const INVOICE_TTL_MS = 30 * 60 * 1000; // 30 min — rate snapshot validity window
const AMOUNT_EPSILON = 1e-7; // Stellar precision tolerance for >= comparisons

function treasuryPublicKey() {
  const key = process.env.ENERGY_PAY_TREASURY_PUBLIC_KEY;
  if (!key || !StrKey.isValidEd25519PublicKey(key)) return null;
  return key;
}

/** Resolve the on-chain asset descriptor for the chosen billing asset. */
function resolveAsset(asset) {
  if (asset === "XLM") {
    return { asset: "XLM", assetCode: "XLM", assetIssuer: null, isNative: true };
  }
  if (asset === "USDC") {
    const assetCode = process.env.USDC_ASSET_CODE || "USDC";
    const assetIssuer = process.env.USDC_ISSUER || null;
    if (!assetIssuer || !StrKey.isValidEd25519PublicKey(assetIssuer)) return null;
    return { asset: "USDC", assetCode, assetIssuer, isNative: false };
  }
  return null;
}

/** CoinGecko BRL rate for the asset (BRL per 1 unit). */
async function fetchBrlRate(asset) {
  const id = asset === "XLM" ? "stellar" : "usd-coin";
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=brl&precision=6`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const d = await res.json();
    const rate = d?.[id]?.brl;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } finally {
    clearTimeout(timer);
  }
}

/** Unique, memo-safe (≤ 28 bytes) payment reference. */
function newPaymentReference() {
  return `EPY-${crypto.randomBytes(8).toString("hex").toUpperCase()}`; // 4 + 16 = 20 chars
}

/** 7-decimal string for Stellar amounts. */
function toStellarAmount(n) {
  return Number(n).toFixed(7);
}

/**
 * Activate / renew the plan after a confirmed crypto payment.
 * Mirrors the subscription DB shape used by the Asaas flow, WITHOUT touching
 * the payment gateway. Manual find-or-insert avoids the partial-index upsert.
 */
async function activatePlan(userId, planId) {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { data: existing } = await supabase
    .from("user_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due"])
    .maybeSingle();

  if (existing) {
    await supabase
      .from("user_subscriptions")
      .update({
        plan_id: planId,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        updated_at: now.toISOString(),
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: inserted } = await supabase
    .from("user_subscriptions")
    .insert({
      user_id: userId,
      plan_id: planId,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
    })
    .select("id")
    .single();

  return inserted?.id ?? null;
}

// ─── POST /invoice — create a crypto payment invoice ──────────────────────────

router.post("/invoice", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;
    const { plan_id, asset } = req.body;

    if (!["operator", "enterprise"].includes(plan_id)) {
      return res.status(400).json({ success: false, error: "plan_id must be 'operator' or 'enterprise'" });
    }
    if (!["XLM", "USDC"].includes(asset)) {
      return res.status(400).json({ success: false, error: "asset must be 'XLM' or 'USDC'" });
    }

    const treasury = treasuryPublicKey();
    if (!treasury) {
      return res.status(503).json({
        success: false,
        error: "TREASURY_NOT_CONFIGURED",
        message: "Defina ENERGY_PAY_TREASURY_PUBLIC_KEY nas variáveis de ambiente para habilitar pagamentos em cripto.",
      });
    }

    const assetDesc = resolveAsset(asset);
    if (!assetDesc) {
      return res.status(503).json({
        success: false,
        error: "USDC_NOT_CONFIGURED",
        message: "Defina USDC_ISSUER (e opcionalmente USDC_ASSET_CODE) para aceitar pagamentos em USDC.",
      });
    }

    const { data: plan, error: planErr } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .single();
    if (planErr || !plan) return res.status(404).json({ success: false, error: "Plan not found" });

    const amountBrl = Number(plan.price_brl);
    if (!(amountBrl > 0)) {
      return res.status(400).json({ success: false, error: "Plan is not payable in crypto" });
    }

    const rate = await fetchBrlRate(asset);
    if (!rate) {
      return res.status(503).json({
        success: false,
        error: "RATE_UNAVAILABLE",
        message: "Cotação indisponível no momento. Tente novamente em instantes.",
      });
    }

    const expectedAmount = toStellarAmount(amountBrl / rate);
    const paymentReference = newPaymentReference();
    const expiresAt = new Date(Date.now() + INVOICE_TTL_MS).toISOString();

    const { data: invoice, error: insErr } = await supabase
      .from("crypto_payment_invoices")
      .insert({
        user_id: userId,
        plan_id,
        asset: assetDesc.asset,
        asset_code: assetDesc.assetCode,
        asset_issuer: assetDesc.assetIssuer,
        expected_amount: expectedAmount,
        amount_brl: amountBrl,
        exchange_rate: toStellarAmount(rate),
        rate_source: "coingecko",
        treasury_public_key: treasury,
        payment_reference: paymentReference,
        status: "PENDING_PAYMENT",
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (insErr || !invoice) {
      console.error("[crypto-billing/invoice]", insErr?.message);
      return res.status(500).json({ success: false, error: "INVOICE_CREATE_FAILED" });
    }

    return res.json({
      success: true,
      invoice: {
        id: invoice.id,
        plan_id: invoice.plan_id,
        asset: invoice.asset,
        asset_code: invoice.asset_code,
        asset_issuer: invoice.asset_issuer,
        expected_amount: invoice.expected_amount,
        amount_brl: invoice.amount_brl,
        exchange_rate: invoice.exchange_rate,
        rate_source: invoice.rate_source,
        treasury_public_key: invoice.treasury_public_key,
        payment_reference: invoice.payment_reference,
        memo: invoice.payment_reference,
        status: invoice.status,
        expires_at: invoice.expires_at,
        treasury_explorer_url: explorerAccountUrl(treasury),
      },
    });
  } catch (err) {
    console.error("[crypto-billing/invoice]", err.message);
    return res.status(500).json({ success: false, error: "INVOICE_CREATE_FAILED" });
  }
});

// ─── GET /invoice/:id — poll invoice status (ownership enforced) ──────────────

router.get("/invoice/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;
    const { data: invoice, error } = await supabase
      .from("crypto_payment_invoices")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !invoice) return res.status(404).json({ success: false, error: "INVOICE_NOT_FOUND" });
    if (invoice.user_id !== userId) return res.status(403).json({ success: false, error: "FORBIDDEN" });

    return res.json({ success: true, invoice: serializeInvoice(invoice) });
  } catch (err) {
    console.error("[crypto-billing/invoice/:id]", err.message);
    return res.status(500).json({ success: false, error: "INVOICE_FETCH_FAILED" });
  }
});

// ─── POST /invoice/:id/verify — read-only Horizon confirmation ────────────────

router.post("/invoice/:id/verify", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;
    const { data: invoice, error } = await supabase
      .from("crypto_payment_invoices")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !invoice) return res.status(404).json({ success: false, error: "INVOICE_NOT_FOUND" });
    if (invoice.user_id !== userId) return res.status(403).json({ success: false, error: "FORBIDDEN" });

    // Already settled — short-circuit.
    if (invoice.status === "PAID") {
      return res.json({ success: true, status: "PAID", invoice: serializeInvoice(invoice) });
    }

    // Expired and still unpaid → mark EXPIRED.
    if (invoice.expires_at && Date.now() > new Date(invoice.expires_at).getTime()) {
      await supabase
        .from("crypto_payment_invoices")
        .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
        .eq("id", invoice.id);
      return res.json({ success: true, status: "EXPIRED", invoice: { ...serializeInvoice(invoice), status: "EXPIRED" } });
    }

    // Read recent payments to the treasury, joined with their transactions
    // (memo lives on the transaction, not the payment operation).
    const url =
      `${HORIZON_URL}/accounts/${invoice.treasury_public_key}/payments` +
      `?order=desc&limit=100&join=transactions`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    let horizonRes;
    try {
      horizonRes = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    } finally {
      clearTimeout(timer);
    }

    if (horizonRes.status === 404) {
      return res.json({ success: true, status: "PENDING_PAYMENT", invoice: serializeInvoice(invoice), note: "Treasury account not yet on ledger." });
    }
    if (!horizonRes.ok) {
      return res.status(502).json({ success: false, error: `HORIZON_HTTP_${horizonRes.status}` });
    }

    const body = await horizonRes.json();
    const records = body?._embedded?.records ?? [];

    const expected = Number(invoice.expected_amount);
    const match = records.find((op) => {
      if (op.type !== "payment") return false;
      if (op.to !== invoice.treasury_public_key) return false;
      if (op.transaction_successful === false) return false;

      // Asset match
      if (invoice.asset === "XLM") {
        if (op.asset_type !== "native") return false;
      } else {
        if (op.asset_type === "native") return false;
        if (op.asset_code !== invoice.asset_code) return false;
        if (op.asset_issuer !== invoice.asset_issuer) return false;
      }

      // Amount match (received >= expected, with Stellar precision tolerance)
      if (!(Number(op.amount) + AMOUNT_EPSILON >= expected)) return false;

      // Memo match — must be a text memo equal to the payment reference
      const tx = op.transaction;
      const memo = tx?.memo;
      const memoType = tx?.memo_type;
      return memoType === "text" && memo === invoice.payment_reference;
    });

    if (!match) {
      return res.json({ success: true, status: "PENDING_PAYMENT", invoice: serializeInvoice(invoice) });
    }

    const tx = match.transaction;
    const confirmedAt = new Date().toISOString();

    const { data: updated } = await supabase
      .from("crypto_payment_invoices")
      .update({
        status: "PAID",
        tx_hash: match.transaction_hash,
        ledger: tx?.ledger ?? null,
        source_account: match.from ?? tx?.source_account ?? null,
        destination_account: match.to,
        amount_received: toStellarAmount(match.amount),
        memo: invoice.payment_reference,
        confirmed_at: confirmedAt,
        explorer_url: explorerTxUrl(match.transaction_hash),
        updated_at: confirmedAt,
      })
      .eq("id", invoice.id)
      .select()
      .single();

    // Activate the plan (billing DB only — no settlement/custody involved).
    const subscriptionId = await activatePlan(userId, invoice.plan_id);
    if (subscriptionId) {
      await supabase
        .from("crypto_payment_invoices")
        .update({ subscription_id: subscriptionId })
        .eq("id", invoice.id);
    }

    return res.json({
      success: true,
      status: "PAID",
      invoice: serializeInvoice(updated ?? { ...invoice, status: "PAID" }),
    });
  } catch (err) {
    console.error("[crypto-billing/verify]", err.message);
    return res.status(504).json({ success: false, error: "HORIZON_UNREACHABLE", message: err.message });
  }
});

// ─── Serializer (never leak internal-only columns) ────────────────────────────

function serializeInvoice(inv) {
  return {
    id: inv.id,
    plan_id: inv.plan_id,
    asset: inv.asset,
    asset_code: inv.asset_code,
    asset_issuer: inv.asset_issuer,
    expected_amount: inv.expected_amount,
    amount_brl: inv.amount_brl,
    exchange_rate: inv.exchange_rate,
    rate_source: inv.rate_source,
    treasury_public_key: inv.treasury_public_key,
    payment_reference: inv.payment_reference,
    memo: inv.payment_reference,
    status: inv.status,
    tx_hash: inv.tx_hash ?? null,
    ledger: inv.ledger ?? null,
    amount_received: inv.amount_received ?? null,
    confirmed_at: inv.confirmed_at ?? null,
    explorer_url: inv.explorer_url ?? null,
    expires_at: inv.expires_at ?? null,
    created_at: inv.created_at ?? null,
  };
}

export default router;
