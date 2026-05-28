/**
 * /api/subscriptions — EnergyPay Billing & Subscriptions
 *
 * Gateway: Asaas (https://www.asaas.com/)
 * Certified by Banco Central do Brasil · supports PIX + credit card + boleto.
 *
 * Required environment variables (set in Vercel dashboard):
 *   PAYMENT_GATEWAY=asaas
 *   PAYMENT_GATEWAY_KEY=<your_asaas_api_key>          ← from https://www.asaas.com/userConfig/index
 *   PAYMENT_GATEWAY_SANDBOX=true                       ← set to 'false' in production
 *
 * Asaas account setup (one-time, done on asaas.com):
 *   1. Create account at https://www.asaas.com/
 *   2. Inform CPF and bank account for withdrawals
 *   3. Get the API key from Configurações → Integrações
 */

import express from "express";
import axios from "axios";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// ── Asaas client ───────────────────────────────────────────────────────────────

const SANDBOX = process.env.PAYMENT_GATEWAY_SANDBOX !== "false";
const ASAAS_BASE = SANDBOX
  ? "https://sandbox.asaas.com/api/v3"
  : "https://api.asaas.com/v3";

function asaasClient() {
  const key = process.env.PAYMENT_GATEWAY_KEY;
  if (!key) throw new Error("PAYMENT_GATEWAY_KEY not set");
  return axios.create({
    baseURL: ASAAS_BASE,
    headers: {
      "Content-Type": "application/json",
      access_token: key,
    },
    timeout: 15000,
  });
}

function gatewayConfigured() {
  return !!(process.env.PAYMENT_GATEWAY === "asaas" && process.env.PAYMENT_GATEWAY_KEY);
}

// ── Asaas helpers ──────────────────────────────────────────────────────────────

/**
 * Find or create an Asaas customer for the given EnergyPay user.
 * Returns the Asaas customer ID.
 */
async function getOrCreateAsaasCustomer(user) {
  const client = asaasClient();

  // Search by email
  const search = await client.get(`/customers?email=${encodeURIComponent(user.email)}&limit=1`);
  const existing = search.data?.data?.[0];
  if (existing) return existing.id;

  // Create new customer
  const payload = {
    name: user.full_name,
    email: user.email,
    externalReference: user.id,
  };
  // Include phone if available (digits only, no + sign for Asaas)
  if (user.phone) {
    const digits = String(user.phone).replace(/\D/g, "");
    if (digits.length >= 10) payload.phone = digits;
  }
  // Include CPF/CNPJ if stored on the user record
  if (user.cpf_cnpj) payload.cpfCnpj = String(user.cpf_cnpj).replace(/\D/g, "");

  const created = await client.post("/customers", payload);
  return created.data.id;
}

/**
 * Calculate the next due date for a new subscription.
 * Always start from tomorrow to give a 1-day grace period.
 */
function nextDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

// ── Plans ──────────────────────────────────────────────────────────────────────

router.get("/plans", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("active", true)
      .order("price_brl", { ascending: true });
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, plans: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── My subscription ────────────────────────────────────────────────────────────

router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;

    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });

    if (!data) {
      return res.json({
        success: true,
        subscription: {
          plan: "FREE",
          status: "ACTIVE",
          settlements_used: 0,
          settlements_limit: 5,
          current_period_end: null,
          cancel_at_period_end: false,
        },
      });
    }

    res.json({
      success: true,
      subscription: {
        plan: (data.plan_id ?? "free").toUpperCase(),
        status: data.status.toUpperCase(),
        current_period_start:   data.current_period_start,
        current_period_end:     data.current_period_end,
        cancel_at_period_end:   data.cancel_at_period_end,
        settlements_used:       data.settlements_used ?? 0,
        settlements_limit:      data.plan?.settlements_limit ?? null,
        gateway:                data.gateway ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Checkout ────────────────────────────────────────────────────────────────────

/**
 * POST /api/subscriptions/checkout
 * Body: { plan_id: 'operator' | 'enterprise', payment_method: 'pix' | 'credit_card' }
 *
 * PIX response:
 *   { success, payment_method: 'pix', pix_qr_code, pix_qr_code_text, pix_expires_at, payment_id }
 *
 * Credit card response:
 *   { success, payment_method: 'credit_card', payment_url }
 */
router.post("/checkout", requireAuth, async (req, res) => {
  try {
    if (!gatewayConfigured()) {
      return res.status(503).json({
        success: false,
        error: "GATEWAY_NOT_CONFIGURED",
        message:
          "Defina PAYMENT_GATEWAY=asaas e PAYMENT_GATEWAY_KEY nas variáveis de ambiente do Vercel para ativar os pagamentos.",
      });
    }

    const userId = req.operator.sub || req.operator.id;
    const { plan_id, payment_method } = req.body;

    if (!plan_id || !payment_method) {
      return res.status(400).json({ success: false, error: "plan_id and payment_method are required" });
    }
    if (!["operator", "enterprise"].includes(plan_id)) {
      return res.status(400).json({ success: false, error: "plan_id must be 'operator' or 'enterprise'" });
    }
    if (!["pix", "credit_card"].includes(payment_method)) {
      return res.status(400).json({ success: false, error: "payment_method must be 'pix' or 'credit_card'" });
    }

    // Fetch plan and user
    const [{ data: plan, error: planErr }, { data: user, error: userErr }] = await Promise.all([
      supabase.from("subscription_plans").select("*").eq("id", plan_id).single(),
      supabase.from("users").select("id, email, full_name, phone, organization, cpf_cnpj").eq("id", userId).single(),
    ]);

    if (planErr || !plan) return res.status(404).json({ success: false, error: "Plan not found" });
    if (userErr || !user) return res.status(404).json({ success: false, error: "User not found" });

    const client = asaasClient();

    // 1. Get or create Asaas customer
    const customerId = await getOrCreateAsaasCustomer(user);

    // 2. Create subscription on Asaas
    const billingType = payment_method === "pix" ? "PIX" : "CREDIT_CARD";
    const subPayload = {
      customer: customerId,
      billingType,
      value: Number(plan.price_brl),
      nextDueDate: nextDueDate(),
      cycle: "MONTHLY",
      description: `EnergyPay ${plan.name} — Assinatura Mensal`,
      externalReference: `ep_${userId}_${plan_id}_${Date.now()}`,
    };

    const asaasSub = (await client.post("/subscriptions", subPayload)).data;

    // 3. Save subscription to our DB (pending until payment confirmed via webhook)
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { data: dbSub } = await supabase
      .from("user_subscriptions")
      .upsert({
        user_id: userId,
        plan_id,
        status: "trialing", // becomes 'active' on PAYMENT_CONFIRMED webhook
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        gateway: "asaas",
        gateway_customer_id: customerId,
        gateway_subscription_id: asaasSub.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id", ignoreDuplicates: false })
      .select()
      .single();

    // 4a. PIX: retrieve QR code for the first pending payment
    if (payment_method === "pix") {
      const payments = (await client.get(`/payments?subscription=${asaasSub.id}&limit=1`)).data;
      const payment  = payments?.data?.[0];

      if (!payment) {
        // Asaas may take a moment to create the first payment — return subscription info
        return res.json({
          success: true,
          payment_method: "pix",
          pix_pending: true,
          subscription_id: asaasSub.id,
          message: "Aguardando geração do QR Code PIX. Tente novamente em alguns segundos.",
        });
      }

      const pixData = (await client.get(`/payments/${payment.id}/pixQrCode`)).data;

      // Persist payment record
      await supabase.from("subscription_payments").insert({
        subscription_id: dbSub?.id ?? null,
        user_id: userId,
        plan_id,
        amount_brl: plan.price_brl,
        status: "pending",
        payment_method: "pix",
        gateway: "asaas",
        gateway_payment_id: payment.id,
        pix_qr_code: pixData.encodedImage ?? null,
        pix_qr_code_text: pixData.payload ?? null,
        pix_expires_at: payment.dueDate ? new Date(payment.dueDate).toISOString() : null,
      });

      return res.json({
        success: true,
        payment_method: "pix",
        pix_qr_code: pixData.encodedImage,       // base64 image for QR display
        pix_qr_code_text: pixData.payload,        // "copia e cola" text
        pix_expires_at: payment.dueDate,
        payment_id: payment.id,
        subscription_id: asaasSub.id,
      });
    }

    // 4b. Credit card: create a payment link (hosted checkout — no SDK needed)
    if (payment_method === "credit_card") {
      const linkPayload = {
        name: `EnergyPay ${plan.name}`,
        description: `Assinatura mensal EnergyPay ${plan.name}`,
        billingType: "CREDIT_CARD",
        chargeType: "RECURRENT",
        value: Number(plan.price_brl),
        subscriptionCycle: "MONTHLY",
        externalReference: asaasSub.id,
      };

      const paymentLink = (await client.post("/paymentLinks", linkPayload)).data;

      return res.json({
        success: true,
        payment_method: "credit_card",
        payment_url: paymentLink.url,
        subscription_id: asaasSub.id,
      });
    }
  } catch (err) {
    console.error("[Checkout]", err?.response?.data ?? err.message);
    const asaasMsg = err?.response?.data?.errors?.[0]?.description ?? err.message;
    res.status(500).json({ success: false, error: asaasMsg });
  }
});

// ── Cancel ──────────────────────────────────────────────────────────────────────

router.post("/cancel", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;

    const { data: sub, error: subErr } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      .single();

    if (subErr || !sub) {
      return res.status(404).json({ success: false, error: "Nenhuma assinatura ativa encontrada." });
    }
    if (sub.plan_id === "free") {
      return res.status(400).json({ success: false, error: "O plano Free não pode ser cancelado." });
    }

    // Cancel on Asaas (marks as cancel_at_period_end — not immediate)
    if (sub.gateway_subscription_id && gatewayConfigured()) {
      try {
        await asaasClient().delete(`/subscriptions/${sub.gateway_subscription_id}`);
      } catch (gwErr) {
        console.warn("[Cancel] Asaas cancel failed:", gwErr?.response?.data ?? gwErr.message);
      }
    }

    await supabase
      .from("user_subscriptions")
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("id", sub.id);

    res.json({ success: true, message: "Assinatura agendada para cancelamento ao fim do período atual." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Webhook — Asaas events ─────────────────────────────────────────────────────

/**
 * POST /api/subscriptions/webhook
 * Called by Asaas when a payment status changes.
 *
 * Configure in Asaas dashboard:
 *   Configurações → Integrações → Webhooks
 *   URL: https://energypay-protocol-mainnet.vercel.app/api/subscriptions/webhook
 *   Events: PAYMENT_CONFIRMED, PAYMENT_OVERDUE, SUBSCRIPTION_CANCELLED
 */
router.post(
  "/webhook",
  express.raw({ type: "*/*" }),  // Receive raw body for potential signature verification
  async (req, res) => {
    try {
      // ── Authenticate the webhook (fail-closed) ───────────────────────────────
      // Asaas sends the value configured in Webhooks → "Token de autenticação"
      // back on every request via the `asaas-access-token` header.
      // Set the SAME value in Vercel as ASAAS_WEBHOOK_TOKEN.
      const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
      const receivedToken = req.headers["asaas-access-token"];
      if (!expectedToken) {
        console.error(
          "[Asaas Webhook] ASAAS_WEBHOOK_TOKEN not configured — rejecting (fail-closed).",
        );
        return res.status(503).json({ error: "Webhook authentication not configured" });
      }
      if (receivedToken !== expectedToken) {
        console.warn("[Asaas Webhook] Invalid/missing asaas-access-token header — rejected.");
        return res.status(401).json({ error: "Unauthorized webhook" });
      }

      let body;
      try {
        body = typeof req.body === "string"
          ? JSON.parse(req.body)
          : Buffer.isBuffer(req.body)
            ? JSON.parse(req.body.toString())
            : req.body;
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }

      const event = body?.event;
      const payment = body?.payment;
      console.log(`[Asaas Webhook] event=${event} payment=${payment?.id}`);

      if (!event || !payment) return res.json({ received: true });

      // Find payment record by gateway_payment_id
      const { data: pmtRow } = await supabase
        .from("subscription_payments")
        .select("*, user_subscriptions(*)")
        .eq("gateway_payment_id", payment.id)
        .maybeSingle();

      if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
        // Mark payment as paid
        if (pmtRow) {
          await supabase.from("subscription_payments").update({
            status: "paid",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", pmtRow.id);
        }

        // Activate/renew subscription via gateway_subscription_id from Asaas payload
        const asaasSubId = payment?.subscription;
        if (asaasSubId) {
          const periodEnd = new Date();
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          await supabase.from("user_subscriptions").update({
            status: "active",
            current_period_end: periodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("gateway_subscription_id", asaasSubId);
        }
      }

      if (event === "PAYMENT_OVERDUE") {
        if (payment?.subscription) {
          await supabase.from("user_subscriptions").update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          }).eq("gateway_subscription_id", payment.subscription);
        }
      }

      if (event === "SUBSCRIPTION_CANCELLED" || event === "SUBSCRIPTION_DELETED") {
        const subId = body?.subscription?.id ?? payment?.subscription;
        if (subId) {
          await supabase.from("user_subscriptions").update({
            status: "cancelled",
            updated_at: new Date().toISOString(),
          }).eq("gateway_subscription_id", subId);
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error("[Webhook] Error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── Payment status polling ─────────────────────────────────────────────────────

/**
 * GET /api/subscriptions/payment-status/:paymentId
 * Polls Asaas for the current status of a PIX payment.
 * Used by the frontend to confirm payment without relying on webhook timing.
 */
router.get("/payment-status/:paymentId", requireAuth, async (req, res) => {
  try {
    if (!gatewayConfigured()) {
      return res.status(503).json({ success: false, error: "GATEWAY_NOT_CONFIGURED" });
    }

    const { paymentId } = req.params;
    const payment = (await asaasClient().get(`/payments/${paymentId}`)).data;

    const confirmed = payment.status === "CONFIRMED" || payment.status === "RECEIVED";

    res.json({
      success: true,
      payment_id: paymentId,
      status: payment.status,
      confirmed,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
