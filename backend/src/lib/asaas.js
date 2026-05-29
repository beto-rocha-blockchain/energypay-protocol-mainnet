/**
 * Shared Asaas client helpers.
 *
 * Asaas (https://www.asaas.com/) is the configured payment gateway — certified
 * by Banco Central do Brasil; supports PIX, credit card and boleto.
 *
 * Required environment variables:
 *   PAYMENT_GATEWAY=asaas
 *   PAYMENT_GATEWAY_KEY=<your_asaas_api_key>
 *   PAYMENT_GATEWAY_SANDBOX=true   ← set to 'false' in production
 *
 * SECURITY: this module never persists full PAN or CVV. Card tokenisation
 * returns an opaque gateway token plus masked metadata (brand + last4) only.
 */

import axios from "axios";

export const SANDBOX = process.env.PAYMENT_GATEWAY_SANDBOX !== "false";

export const ASAAS_BASE = SANDBOX
  ? "https://sandbox.asaas.com/api/v3"
  : "https://api.asaas.com/v3";

export function gatewayConfigured() {
  return !!(process.env.PAYMENT_GATEWAY === "asaas" && process.env.PAYMENT_GATEWAY_KEY);
}

export function asaasClient() {
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

/**
 * Find or create an Asaas customer for the given EnergyPay user.
 * Returns the Asaas customer ID.
 */
export async function getOrCreateAsaasCustomer(user) {
  const client = asaasClient();

  const search = await client.get(`/customers?email=${encodeURIComponent(user.email)}&limit=1`);
  const existing = search.data?.data?.[0];
  if (existing) return existing.id;

  const payload = {
    name: user.full_name,
    email: user.email,
    externalReference: user.id,
  };
  if (user.phone) {
    const digits = String(user.phone).replace(/\D/g, "");
    if (digits.length >= 10) payload.phone = digits;
  }
  if (user.cpf_cnpj) payload.cpfCnpj = String(user.cpf_cnpj).replace(/\D/g, "");

  const created = await client.post("/customers", payload);
  return created.data.id;
}
