/**
 * /api/billing/documents — paid invoices, fiscal documents & receipt PDFs.
 *
 *   GET  /invoices            → unified list of PAID charges (Asaas card/PIX
 *                               payments + confirmed crypto invoices).
 *   GET  /documents           → fiscal readiness + downloadable receipts +
 *                               any issued fiscal documents (NF-e/NFS-e later).
 *   GET  /receipt/:source/:id → payment-receipt PDF. Requires auth + ownership
 *                               + step-up (maximum-security download).
 *
 * Receipts are payment receipts only — NOT official NF-e/NFS-e fiscal invoices.
 * This module does not touch settlement / custody / crypto-payment execution;
 * it only reads billing records and renders documents.
 */

import express from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireStepUp } from "../middleware/auth.js";
import { renderReceiptPdf, formatBrl } from "../lib/pdfReceipt.js";
import { getFiscalReadiness } from "../services/fiscalProvider.js";

const router = express.Router();

const DT = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DT.format(d);
}

function methodLabel(source, row) {
  if (source === "crypto_invoice") return `Crypto · ${row.asset_code || row.asset || "XLM"}`;
  switch (row.payment_method) {
    case "pix": return "PIX";
    case "credit_card": return "Cartão de Crédito";
    case "boleto": return "Boleto";
    default: return row.payment_method || "—";
  }
}

// ─── GET /invoices — unified paid-charges list ────────────────────────────────

router.get("/invoices", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;

    const [{ data: payments }, { data: cryptos }] = await Promise.all([
      supabase
        .from("subscription_payments")
        .select("*, plan:subscription_plans(name)")
        .eq("user_id", userId)
        .eq("status", "paid")
        .order("paid_at", { ascending: false }),
      supabase
        .from("crypto_payment_invoices")
        .select("*, plan:subscription_plans(name)")
        .eq("user_id", userId)
        .eq("status", "PAID")
        .order("confirmed_at", { ascending: false }),
    ]);

    const fromPayments = (payments ?? []).map((p) => ({
      id: p.id,
      source: "subscription_payment",
      plan_id: p.plan_id,
      plan_name: p.plan?.name ?? p.plan_id,
      amount_brl: p.amount_brl,
      currency: "BRL",
      method: methodLabel("subscription_payment", p),
      status: "paid",
      paid_at: p.paid_at,
      gateway: p.gateway ?? null,
      gateway_invoice_url: p.gateway_invoice_url ?? null,
      tx_hash: null,
      explorer_url: null,
      receipt_url: `/api/billing/documents/receipt/subscription_payment/${p.id}`,
    }));

    const fromCrypto = (cryptos ?? []).map((c) => ({
      id: c.id,
      source: "crypto_invoice",
      plan_id: c.plan_id,
      plan_name: c.plan?.name ?? c.plan_id,
      amount_brl: c.amount_brl,
      currency: "BRL",
      asset: c.asset,
      asset_code: c.asset_code,
      amount_received: c.amount_received,
      method: methodLabel("crypto_invoice", c),
      status: "paid",
      paid_at: c.confirmed_at,
      gateway: "stellar",
      tx_hash: c.tx_hash ?? null,
      ledger: c.ledger ?? null,
      explorer_url: c.explorer_url ?? null,
      receipt_url: `/api/billing/documents/receipt/crypto_invoice/${c.id}`,
    }));

    const invoices = [...fromPayments, ...fromCrypto].sort(
      (a, b) => new Date(b.paid_at || 0).getTime() - new Date(a.paid_at || 0).getTime(),
    );

    return res.json({ success: true, invoices, count: invoices.length });
  } catch (err) {
    console.error("[billing-docs/invoices]", err.message);
    return res.status(500).json({ success: false, error: "INVOICES_FETCH_FAILED" });
  }
});

// ─── GET /documents — fiscal readiness + receipts + fiscal docs ───────────────

router.get("/documents", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;

    const [readiness, { data: payments }, { data: cryptos }, { data: fiscalDocs }] = await Promise.all([
      getFiscalReadiness(supabase),
      supabase
        .from("subscription_payments")
        .select("id, plan_id, amount_brl, paid_at, payment_method")
        .eq("user_id", userId)
        .eq("status", "paid")
        .order("paid_at", { ascending: false }),
      supabase
        .from("crypto_payment_invoices")
        .select("id, plan_id, amount_brl, asset_code, confirmed_at")
        .eq("user_id", userId)
        .eq("status", "PAID")
        .order("confirmed_at", { ascending: false }),
      supabase
        .from("fiscal_documents")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    // Each paid charge always has a downloadable RECEIPT (generated on demand).
    const receipts = [
      ...(payments ?? []).map((p) => ({
        source: "subscription_payment",
        payment_id: p.id,
        type: "RECEIPT",
        status: "RECEIPT_AVAILABLE",
        provider: "NONE",
        plan_id: p.plan_id,
        amount_brl: p.amount_brl,
        issued_at: p.paid_at,
        receipt_url: `/api/billing/documents/receipt/subscription_payment/${p.id}`,
      })),
      ...(cryptos ?? []).map((c) => ({
        source: "crypto_invoice",
        payment_id: c.id,
        type: "RECEIPT",
        status: "RECEIPT_AVAILABLE",
        provider: "NONE",
        plan_id: c.plan_id,
        amount_brl: c.amount_brl,
        issued_at: c.confirmed_at,
        receipt_url: `/api/billing/documents/receipt/crypto_invoice/${c.id}`,
      })),
    ].sort((a, b) => new Date(b.issued_at || 0).getTime() - new Date(a.issued_at || 0).getTime());

    return res.json({
      success: true,
      fiscal: readiness,
      receipts,
      fiscal_documents: fiscalDocs ?? [],
    });
  } catch (err) {
    console.error("[billing-docs/documents]", err.message);
    return res.status(500).json({ success: false, error: "DOCUMENTS_FETCH_FAILED" });
  }
});

// ─── GET /receipt/:source/:id — receipt PDF (auth + ownership + step-up) ──────

router.get("/receipt/:source/:id", requireAuth, requireStepUp, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;
    const { source, id } = req.params;

    if (!["subscription_payment", "crypto_invoice"].includes(source)) {
      return res.status(400).json({ success: false, error: "INVALID_SOURCE" });
    }

    let receipt;

    if (source === "subscription_payment") {
      const { data: p, error } = await supabase
        .from("subscription_payments")
        .select("*, plan:subscription_plans(name)")
        .eq("id", id)
        .single();
      if (error || !p) return res.status(404).json({ success: false, error: "PAYMENT_NOT_FOUND" });
      if (p.user_id !== userId) return res.status(403).json({ success: false, error: "FORBIDDEN" });
      if (p.status !== "paid") return res.status(409).json({ success: false, error: "PAYMENT_NOT_PAID" });

      receipt = {
        documentTitle: "PAYMENT RECEIPT · RECIBO DE PAGAMENTO",
        receiptId: p.id,
        paidAt: fmtDate(p.paid_at),
        planName: p.plan?.name ?? p.plan_id,
        method: methodLabel("subscription_payment", p),
        amountLabel: formatBrl(p.amount_brl),
        statusLabel: "PAID",
      };
    } else {
      const { data: c, error } = await supabase
        .from("crypto_payment_invoices")
        .select("*, plan:subscription_plans(name)")
        .eq("id", id)
        .single();
      if (error || !c) return res.status(404).json({ success: false, error: "INVOICE_NOT_FOUND" });
      if (c.user_id !== userId) return res.status(403).json({ success: false, error: "FORBIDDEN" });
      if (c.status !== "PAID") return res.status(409).json({ success: false, error: "INVOICE_NOT_PAID" });

      const cryptoAmount = c.amount_received ?? c.expected_amount;
      receipt = {
        documentTitle: "PAYMENT RECEIPT · RECIBO DE PAGAMENTO",
        receiptId: c.id,
        paidAt: fmtDate(c.confirmed_at),
        planName: c.plan?.name ?? c.plan_id,
        method: methodLabel("crypto_invoice", c),
        amountLabel: `${formatBrl(c.amount_brl)} · ${cryptoAmount} ${c.asset_code}`,
        statusLabel: "PAID",
        txHash: c.tx_hash,
        ledger: c.ledger,
        network: "Stellar Mainnet",
        explorerUrl: c.explorer_url,
      };
    }

    const pdf = renderReceiptPdf(receipt);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="energypay-receipt-${id}.pdf"`);
    res.setHeader("Content-Length", pdf.length);
    res.setHeader("Cache-Control", "no-store");
    return res.end(pdf);
  } catch (err) {
    console.error("[billing-docs/receipt]", err.message);
    return res.status(500).json({ success: false, error: "RECEIPT_FAILED" });
  }
});

export default router;
