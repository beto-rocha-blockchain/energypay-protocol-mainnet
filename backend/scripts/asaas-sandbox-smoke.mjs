/**
 * Asaas SANDBOX smoke test — exercises the subscription checkout path end-to-end
 * against the Asaas TEST environment. NO real money, NO production calls, NO KYC.
 *
 * Usage (from the backend/ folder):
 *   node scripts/asaas-sandbox-smoke.mjs
 *
 * Requires in backend/.env:
 *   PAYMENT_GATEWAY=asaas
 *   PAYMENT_GATEWAY_KEY=<your SANDBOX api key from https://sandbox.asaas.com>
 *   PAYMENT_GATEWAY_SANDBOX=true
 *
 * NOTE: sandbox and production are SEPARATE environments with SEPARATE keys.
 * A production key will be rejected here ("não pertence a este ambiente") — get
 * the key from INSIDE https://sandbox.asaas.com.
 *
 * SAFETY: this script refuses to run unless it is pointed at the sandbox. It can
 * never reach the production Asaas API or move real funds.
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const KEY = (process.env.PAYMENT_GATEWAY_KEY || "").trim();
const GATEWAY = process.env.PAYMENT_GATEWAY;
const SANDBOX = process.env.PAYMENT_GATEWAY_SANDBOX !== "false";
const BASE = SANDBOX ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3";

async function asaas(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      access_token: KEY,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || `HTTP ${res.status}`;
    throw new Error(`${options.method || "GET"} ${path} → ${msg}`);
  }
  return data;
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

// PIX charges can only generate a QR code if the account has an ACTIVE PIX key.
// In sandbox, auto-provision a random (EVP) key if none exists.
async function ensurePixKey() {
  let list;
  try {
    list = await asaas("/pix/addressKeys?limit=100");
  } catch {
    list = { data: [] };
  }
  const active = (list?.data || []).find((k) => k.status === "ACTIVE");
  if (active) {
    console.log("✅ PIX key present on the sandbox account");
    return;
  }
  console.log("…  no active PIX key — creating a random (EVP) key in sandbox");
  try {
    const created = await asaas("/pix/addressKeys", {
      method: "POST",
      body: JSON.stringify({ type: "EVP" }),
    });
    console.log(`✅ PIX key created (status: ${created.status || "OK"})`);
  } catch (err) {
    throw new Error(
      `Could not auto-create a PIX key (${err.message}). Enable PIX manually at ` +
        "sandbox.asaas.com → Pix → Minhas chaves → cadastrar chave, then re-run.",
    );
  }
}

async function main() {
  // ── Guards (sandbox-only, must be configured) ──────────────────────────────
  if (GATEWAY !== "asaas") throw new Error('PAYMENT_GATEWAY must be "asaas" in backend/.env');
  if (!KEY) throw new Error("PAYMENT_GATEWAY_KEY not set in backend/.env (use your SANDBOX key).");
  if (!SANDBOX) throw new Error("Refusing to run: PAYMENT_GATEWAY_SANDBOX=false — this is a SANDBOX-only test.");

  console.log(`\n🔧 Asaas SANDBOX smoke test → ${BASE}\n`);

  // Masked key diagnostic — reveals truncation / a lost "$" without exposing the secret.
  // A valid Asaas key starts with "$" and is long (~150+ chars).
  const masked = KEY.length > 12 ? `${KEY.slice(0, 8)}…${KEY.slice(-4)}` : "(too short!)";
  console.log(`🔑 Key seen by Node: length=${KEY.length} · startsWith('$')=${KEY.startsWith("$")} · ${masked}\n`);

  // 1. Create a test customer (the "payer").
  const customer = await asaas("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: "EnergyPay Smoke Test",
      email: `smoke+${Math.floor(Date.now() / 1000)}@energypay.test`,
      // Canonical VALID test CPF (111.444.777-35) — synthetic, sandbox only.
      // Asaas requires a CPF/CNPJ on the customer to create PIX/card charges.
      cpfCnpj: "11144477735",
    }),
  });
  console.log(`✅ Customer created: ${customer.id}`);

  // Ensure the sandbox account can receive PIX (needs an active PIX key).
  await ensurePixKey();

  // 2. Create a PIX charge (Operator plan value) — same call the app makes.
  const payment = await asaas("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customer.id,
      billingType: "PIX",
      value: 297.0,
      dueDate: tomorrow(),
      description: "EnergyPay — Operator (sandbox smoke test)",
    }),
  });
  console.log(`✅ PIX charge created: ${payment.id} · status ${payment.status}`);

  // 3. Fetch the PIX QR code ("copia e cola") — what the UI renders.
  const qr = await asaas(`/payments/${payment.id}/pixQrCode`);
  console.log("✅ PIX QR code retrieved");
  console.log(`\n— Copia e cola —\n${qr.payload || "(not available yet)"}\n`);

  // 4. Tokenize a test credit card — the SAME /creditCard/tokenize call the
  //    Cartões tab makes via /api/billing/cards. PAN/CVV live only in this request.
  console.log("— Credit card tokenization —");
  const tokenized = await asaas("/creditCard/tokenize", {
    method: "POST",
    body: JSON.stringify({
      customer: customer.id,
      creditCard: {
        holderName: "ENERGYPAY SMOKE TEST",
        number: "5162306219378829", // Asaas sandbox test card (Mastercard), Luhn-valid
        expiryMonth: "12",
        expiryYear: "2030",
        ccv: "318",
      },
      creditCardHolderInfo: {
        name: "ENERGYPAY SMOKE TEST",
        email: "card-smoke@energypay.test",
        cpfCnpj: "11144477735",
        postalCode: "01310000",
        addressNumber: "100",
        phone: "1140048210",
      },
      remoteIp: "203.0.113.10",
    }),
  });
  console.log(
    `✅ Card tokenized: ${tokenized.creditCardBrand} ••••${tokenized.creditCardNumber} · ` +
      `token ${String(tokenized.creditCardToken).slice(0, 10)}…\n`,
  );

  console.log("🎉 Sandbox checkout flow OK (PIX + card) — gateway is wired and reachable.\n");
}

// Set exitCode instead of process.exit() so pending network sockets close
// cleanly — avoids the libuv "UV_HANDLE_CLOSING" assertion on Windows.
main().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  if (/não pertence a este ambiente|does not belong/i.test(err.message)) {
    console.error(
      "↳ This key is for a different environment. Get the API key from INSIDE\n" +
        "  https://sandbox.asaas.com (separate account from www.asaas.com), and keep\n" +
        "  PAYMENT_GATEWAY_SANDBOX=true.\n",
    );
  }
  process.exitCode = 1;
});
