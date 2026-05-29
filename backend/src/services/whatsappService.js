/**
 * Phone OTP delivery via Twilio — WhatsApp or SMS.
 *
 * Channel is selected with OTP_CHANNEL ("whatsapp" default, or "sms"):
 *   · whatsapp — TWILIO_WHATSAPP_FROM (free Twilio sandbox for testing; the
 *     recipient must first send the sandbox join code to the sandbox number).
 *   · sms      — TWILIO_SMS_FROM (a Twilio phone number; no opt-in required).
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID    — Twilio Account SID
 *   TWILIO_AUTH_TOKEN     — Twilio Auth Token
 *   TWILIO_WHATSAPP_FROM  — WhatsApp sender, e.g. "whatsapp:+14155238886" (whatsapp channel)
 *   TWILIO_SMS_FROM       — SMS sender phone in E.164, e.g. "+12025550123" (sms channel)
 *
 * Contract: if the selected channel is not configured, this NEVER throws — it
 * returns { fallback: true, code } so the caller can apply its own policy
 * (surface the code in development, fail safely in production). It only throws
 * when a configured provider actively rejects the send.
 */

import twilio from "twilio";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
const SMS_FROM = (process.env.TWILIO_SMS_FROM || "").trim();
const CHANNEL = (process.env.OTP_CHANNEL || "whatsapp").toLowerCase().trim();

const client = ACCOUNT_SID && AUTH_TOKEN ? twilio(ACCOUNT_SID, AUTH_TOKEN) : null;

/** Normalize any phone string to E.164 (+digits). */
function toE164(raw) {
  const clean = String(raw).replace(/[^\d+]/g, "");
  return clean.startsWith("+") ? clean : `+${clean}`;
}

/**
 * Send a 6-digit verification code over the configured channel.
 * @param {{ to: string, code: string, fullName: string }} opts
 * @returns {Promise<{ sid: string, channel: string } | { fallback: true, code: string }>}
 */
export async function sendVerificationOtp({ to, code, fullName }) {
  const e164 = toE164(to);
  const useSms = CHANNEL === "sms";

  // Channel not configured → fallback (caller decides what to do).
  if (!client || (useSms && !SMS_FROM)) {
    console.log(`[OTP] ${useSms ? "SMS" : "WhatsApp"} not configured — fallback for ${e164}`);
    return { fallback: true, code };
  }

  const from = useSms ? SMS_FROM : WHATSAPP_FROM;
  const dest = useSms ? e164 : `whatsapp:${e164}`;
  const body = useSms
    ? `EnergyPay verification code: ${code}\n` +
      `Hello, ${fullName}. This code expires in 10 minutes. ` +
      `If you did not request it, ignore this message.`
    : `⚡ *EnergyPay — Phone Verification*\n\n` +
      `Hello, ${fullName}.\n\n` +
      `Your verification code is:\n\n` +
      `*${code}*\n\n` +
      `This code expires in 10 minutes.\n` +
      `If you did not request this, ignore this message.`;

  try {
    const message = await client.messages.create({ from, to: dest, body });
    console.log(`[OTP] ${useSms ? "SMS" : "WhatsApp"} code sent to ${dest} — SID: ${message.sid}`);
    return { sid: message.sid, channel: useSms ? "sms" : "whatsapp" };
  } catch (err) {
    console.error(`[OTP] Failed to send ${useSms ? "SMS" : "WhatsApp"} to ${dest}:`, err.message);
    throw err;
  }
}

// Back-compat alias — older imports keep working regardless of the active channel.
export const sendWhatsAppVerificationCode = sendVerificationOtp;
