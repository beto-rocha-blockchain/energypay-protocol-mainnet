/**
 * /api/billing/cards — Saved payment cards.
 *
 * SECURITY MODEL
 *   · The full card number (PAN) and the CVV are NEVER stored or logged. They
 *     are forwarded once to Asaas for tokenisation and immediately discarded.
 *   · We persist only the opaque gateway token + masked metadata (brand,
 *     last4, holder, expiry). Deleting a card removes the only reference the
 *     platform holds — there is nothing else to erase.
 *   · Mutating routes (add / delete / set-default) require a fresh step-up
 *     identity confirmation (x-step-up-token).
 *
 * Limit: 5 cards per user.
 */

import express from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireStepUp } from "../middleware/auth.js";
import { asaasClient, gatewayConfigured, getOrCreateAsaasCustomer } from "../lib/asaas.js";

const router = express.Router();

const MAX_CARDS = 5;

/** Masked, safe-to-return shape — never includes token internals beyond ref. */
function serializeCard(card) {
  return {
    id: card.id,
    brand: card.brand ?? null,
    last4: card.last4 ?? null,
    holder_name: card.holder_name ?? null,
    exp_month: card.exp_month ?? null,
    exp_year: card.exp_year ?? null,
    is_default: !!card.is_default,
    created_at: card.created_at ?? null,
  };
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || req.ip || "0.0.0.0";
}

// ─── GET / — list the user's saved cards (masked) ─────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;
    const { data, error } = await supabase
      .from("user_payment_cards")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      cards: (data ?? []).map(serializeCard),
      count: data?.length ?? 0,
      max: MAX_CARDS,
    });
  } catch (err) {
    console.error("[cards/list]", err.message);
    return res.status(500).json({ success: false, error: "CARDS_FETCH_FAILED" });
  }
});

// ─── POST / — tokenise + save a new card (step-up required) ───────────────────

router.post("/", requireAuth, requireStepUp, async (req, res) => {
  try {
    if (!gatewayConfigured()) {
      return res.status(503).json({ success: false, error: "GATEWAY_NOT_CONFIGURED" });
    }

    const userId = req.operator.sub || req.operator.id;

    // Enforce the 5-card limit up front.
    const { count } = await supabase
      .from("user_payment_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) >= MAX_CARDS) {
      return res.status(409).json({ success: false, error: "CARD_LIMIT_REACHED", max: MAX_CARDS });
    }

    const {
      holder_name,
      number,
      expiry_month,
      expiry_year,
      ccv,
      postal_code,
      address_number,
      phone,
    } = req.body || {};

    if (!holder_name || !number || !expiry_month || !expiry_year || !ccv) {
      return res.status(400).json({ success: false, error: "INCOMPLETE_CARD_DATA" });
    }

    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id, email, full_name, phone, cpf_cnpj")
      .eq("id", userId)
      .single();
    if (userErr || !user) return res.status(404).json({ success: false, error: "USER_NOT_FOUND" });

    const client = asaasClient();
    const customerId = await getOrCreateAsaasCustomer(user);

    // Tokenise at the gateway. PAN + CVV exist only in this request scope.
    const tokenizeBody = {
      customer: customerId,
      creditCard: {
        holderName: holder_name,
        number: String(number).replace(/\s/g, ""),
        expiryMonth: String(expiry_month).padStart(2, "0"),
        expiryYear: String(expiry_year).length === 2 ? `20${expiry_year}` : String(expiry_year),
        ccv: String(ccv),
      },
      creditCardHolderInfo: {
        name: holder_name,
        email: user.email,
        cpfCnpj: user.cpf_cnpj ? String(user.cpf_cnpj).replace(/\D/g, "") : undefined,
        postalCode: postal_code ? String(postal_code).replace(/\D/g, "") : undefined,
        addressNumber: address_number ? String(address_number) : undefined,
        phone: (phone || user.phone) ? String(phone || user.phone).replace(/\D/g, "") : undefined,
      },
      remoteIp: clientIp(req),
    };

    let tokenized;
    try {
      tokenized = (await client.post("/creditCard/tokenize", tokenizeBody)).data;
    } catch (gwErr) {
      // Surface the gateway's human message but never echo the card payload.
      const msg = gwErr?.response?.data?.errors?.[0]?.description ?? "Card tokenisation failed.";
      return res.status(402).json({ success: false, error: "TOKENIZATION_FAILED", message: msg });
    }

    // First card becomes the default automatically.
    const isFirst = (count ?? 0) === 0;

    const { data: saved, error: insErr } = await supabase
      .from("user_payment_cards")
      .insert({
        user_id: userId,
        gateway: "asaas",
        gateway_token: tokenized.creditCardToken,
        gateway_customer_id: customerId,
        brand: tokenized.creditCardBrand ?? null,
        last4: tokenized.creditCardNumber ?? null, // Asaas returns the last 4 digits here
        holder_name,
        exp_month: String(expiry_month).padStart(2, "0"),
        exp_year: String(expiry_year).length === 2 ? `20${expiry_year}` : String(expiry_year),
        is_default: isFirst,
      })
      .select()
      .single();

    if (insErr || !saved) {
      console.error("[cards/add]", insErr?.message);
      return res.status(500).json({ success: false, error: "CARD_SAVE_FAILED" });
    }

    return res.json({ success: true, card: serializeCard(saved) });
  } catch (err) {
    console.error("[cards/add]", err.message);
    return res.status(500).json({ success: false, error: "CARD_SAVE_FAILED" });
  }
});

// ─── DELETE /:id — remove a card (step-up required) ───────────────────────────

router.delete("/:id", requireAuth, requireStepUp, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;

    const { data: card, error } = await supabase
      .from("user_payment_cards")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !card) return res.status(404).json({ success: false, error: "CARD_NOT_FOUND" });
    if (card.user_id !== userId) return res.status(403).json({ success: false, error: "FORBIDDEN" });

    // Delete our stored token + masked metadata — the only card data the
    // platform holds. (PAN/CVV were never stored.)
    const { error: delErr } = await supabase
      .from("user_payment_cards")
      .delete()
      .eq("id", card.id);
    if (delErr) throw delErr;

    // If we removed the default, promote the next-oldest remaining card.
    if (card.is_default) {
      const { data: next } = await supabase
        .from("user_payment_cards")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (next) {
        await supabase
          .from("user_payment_cards")
          .update({ is_default: true, updated_at: new Date().toISOString() })
          .eq("id", next.id);
      }
    }

    return res.json({
      success: true,
      deleted: true,
      message: "Card removed. EnergyPay no longer holds any data for this card.",
    });
  } catch (err) {
    console.error("[cards/delete]", err.message);
    return res.status(500).json({ success: false, error: "CARD_DELETE_FAILED" });
  }
});

// ─── PUT /:id/default — set the default card (step-up required) ───────────────

router.put("/:id/default", requireAuth, requireStepUp, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;

    const { data: card, error } = await supabase
      .from("user_payment_cards")
      .select("id, user_id")
      .eq("id", req.params.id)
      .single();

    if (error || !card) return res.status(404).json({ success: false, error: "CARD_NOT_FOUND" });
    if (card.user_id !== userId) return res.status(403).json({ success: false, error: "FORBIDDEN" });

    // Clear existing default, then set the chosen one (avoids the one-default
    // partial unique index colliding mid-update).
    await supabase
      .from("user_payment_cards")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    await supabase
      .from("user_payment_cards")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", card.id);

    return res.json({ success: true, default_card_id: card.id });
  } catch (err) {
    console.error("[cards/default]", err.message);
    return res.status(500).json({ success: false, error: "CARD_DEFAULT_FAILED" });
  }
});

export default router;
