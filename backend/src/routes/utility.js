/**
 * /api/utility — Utility operator endpoints
 *
 * GET /api/utility/uc           — List verified end-consumers and utility users
 * GET /api/utility/connections  — Grid connection agreements (active contracts)
 * GET /api/utility/tusd         — Distribution tariff (TUSD) settlement flows
 * GET /api/utility/participants — Verified UTILITY-role participants
 */

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

// ─── GET /api/utility/uc ──────────────────────────────────────────────────────
// Returns all email-verified users with USER or UTILITY role.

router.get("/uc", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select(
        "id, full_name, organization, city, country, roles, stellar_public_key, email_verified, phone_verified, created_at",
      )
      .eq("email_verified", true)
      .eq("phone_verified", true)
      .or("roles.cs.{USER},roles.cs.{UTILITY}")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ success: true, users: data ?? [] });
  } catch (err) {
    console.error("GET /api/utility/uc error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/utility/connections ─────────────────────────────────────────────
// Returns bilateral grid connection agreements (ACTIVE, SETTLED, or DRAFT contracts).

router.get("/connections", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("contracts")
      .select(
        "id, buyer_label, seller_label, volume_mwh, price_brl, status, state, created_at, start_date, end_date",
      )
      .in("status", ["ACTIVE", "SETTLED", "DRAFT"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ success: true, connections: data ?? [] });
  } catch (err) {
    console.error("GET /api/utility/connections error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/utility/tusd ────────────────────────────────────────────────────
// Returns distribution tariff (TUSD) settlement flows — settled settlements with
// a non-zero BRL amount.

router.get("/tusd", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("settlements")
      .select("id, settlement_id, pld, amount_brl, tx_hash, created_at")
      .eq("status", "SETTLED")
      .gt("amount_brl", 0)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ success: true, tusd_flows: data ?? [] });
  } catch (err) {
    console.error("GET /api/utility/tusd error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/utility/participants ────────────────────────────────────────────
// Returns all fully-verified UTILITY-role participants.

router.get("/participants", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select(
        "id, full_name, organization, city, country, coords, stellar_public_key",
      )
      .eq("email_verified", true)
      .eq("phone_verified", true)
      .contains("roles", ["UTILITY"])
      .order("full_name", { ascending: true });

    if (error) throw error;

    return res.json({ success: true, participants: data ?? [] });
  } catch (err) {
    console.error("GET /api/utility/participants error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
