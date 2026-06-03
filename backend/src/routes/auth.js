import express from "express";
import bcrypt from "bcrypt";
import axios from "axios";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import { Keypair, Operation, TransactionBuilder, BASE_FEE, StrKey } from "@stellar/stellar-sdk";

import { supabase } from "../lib/supabase.js";
import {
  NETWORK_LABEL,
  NETWORK_PASSPHRASE,
  horizon,
} from "../lib/stellar-network.js";
import { encryptSecret } from "../lib/crypto.js";
import { Asset } from "@stellar/stellar-sdk";
import { sendWelcomeEmail, sendPasswordResetEmail, sendVerificationEmail } from "../services/emailService.js";
import { sendVerificationOtp, isVerifyConfigured, startPhoneVerification, checkPhoneVerification } from "../services/whatsappService.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// ── Token helpers ────────────────────────────────────────────────────────────
// All tokens/codes are persisted in Supabase so that Vercel serverless instances
// share state correctly.  In-memory Maps were removed (migration 007).

async function saveResetToken(token, userId, email) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  await supabase.from("password_reset_tokens").upsert(
    { token, user_id: userId, expires_at: expiresAt },
    { onConflict: "token" }
  );
}

async function getResetToken(token) {
  const { data } = await supabase
    .from("password_reset_tokens")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();
  return data || null;
}

async function deleteResetToken(token) {
  await supabase.from("password_reset_tokens").delete().eq("token", token);
}

async function saveResetPhoneCode(token, userId, hashedPassword, code) {
  const phoneCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  await supabase
    .from("password_reset_tokens")
    .update({ user_id: userId, hashed_password: hashedPassword, phone_code: code, phone_code_expires_at: phoneCodeExpiresAt })
    .eq("token", token);
}

async function deleteResetPhoneCode(token) {
  await supabase
    .from("password_reset_tokens")
    .update({ phone_code: null, phone_code_expires_at: null, hashed_password: null })
    .eq("token", token);
}

// =====================================================
// REGISTER
// =====================================================

router.post("/register", async (req, res) => {
  try {
    const {
      email,
      password,
      full_name,
      phone,
      roles,
      country,
      state,
      city,
      address,
      organization,
      has_solar_generation,
      coords,
      wallet_mode,
      existing_public_key,
      // existing_secret intentionally NOT accepted — USER_CONTROLLED wallets
      // are identified by public key only; the secret never leaves the user's device.
      energy_type,
      energy_types,
      document_type,
      cpf_cnpj,
    } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ success: false, error: "missing required fields" });
    }

    // TODO: block REGULATORY_AUTHORITY from public signup. This role should only be
    // provisioned via a private admin endpoint. EnergyPay is regulator-ready but not
    // regulator-dependent — regulatory access is internal/enterprise-only.
    // When implementing: return 403 if roles includes "REGULATORY_AUTHORITY".

    // Phone is mandatory — required for 2FA on sensitive operations (password reset, etc.)
    if (!phone || String(phone).replace(/[^\d]/g, "").length < 8) {
      return res.status(400).json({
        success: false,
        error: "A valid phone number is required for account security. Include country code (e.g. +55 11 99999-9999).",
      });
    }

    if (!roles || !roles.length) {
      return res.status(400).json({ success: false, error: "at least one role is required" });
    }

    const ALLOWED_ROLES = ["GENERATOR", "SELLER", "INVESTOR", "USER", "UTILITY"];

    if (!Array.isArray(roles)) {
      return res.status(400).json({ success: false, error: "roles must be an array" });
    }

    const invalidRoles = roles.filter((r) => !ALLOWED_ROLES.includes(r));
    if (invalidRoles.length > 0) {
      return res.status(400).json({ success: false, error: `invalid roles: ${invalidRoles.join(", ")}` });
    }

    // Identity document — number required. Brazil must be a valid CPF (11) or CNPJ (14);
    // other countries accept a generic tax/registration ID (free-form).
    const rawDoc = String(cpf_cnpj ?? "").trim();
    const isBrazil = ["brasil", "brazil", "br"].includes(String(country ?? "").trim().toLowerCase());
    if (!rawDoc) {
      return res.status(400).json({ success: false, error: "A tax/identity document number is required." });
    }
    const docDigits = rawDoc.replace(/\D/g, "");
    if (isBrazil) {
      if (docDigits.length !== 11 && docDigits.length !== 14) {
        return res.status(400).json({ success: false, error: "Brazilian document must be a CPF (11 digits) or CNPJ (14 digits)." });
      }
    } else if (rawDoc.length < 4) {
      return res.status(400).json({ success: false, error: "Document / tax ID is too short." });
    }
    // Brazil stores digits (Asaas needs them); other countries keep the raw value.
    const docNumberToStore = isBrazil ? docDigits : rawDoc;
    const resolvedDocType =
      document_type === "INDIVIDUAL" || document_type === "COMPANY"
        ? document_type
        : (isBrazil && docDigits.length === 14 ? "COMPANY" : "INDIVIDUAL");

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      return res.status(400).json({ success: false, error: "email already registered" });
    }

    // ── Wallet mode resolution ───────────────────────────────────────────────
    //
    // PLATFORM_MANAGED (default): backend generates keypair, encrypts the
    //   secret with AES (crypto.js), stores ciphertext. Frontend never sees
    //   the secret key.
    //
    // USER_CONTROLLED: user provides only their public key. The backend
    //   validates the account on Stellar Mainnet and stores ONLY the public
    //   key. Secret key is NEVER accepted, stored, or logged.

    const resolvedMode =
      wallet_mode === "USER_CONTROLLED" ? "USER_CONTROLLED" : "PLATFORM_MANAGED";

    let publicKey;
    let encryptedSecret = null; // null for USER_CONTROLLED — no secret stored

    if (resolvedMode === "USER_CONTROLLED") {
      // Accept only public key — reject any attempt to send a secret
      if (!existing_public_key || !StrKey.isValidEd25519PublicKey(existing_public_key.trim())) {
        return res.status(400).json({
          success: false,
          error: "A valid Stellar Mainnet public key (G…, 56 chars) is required.",
          code: "INVALID_PUBLIC_KEY",
        });
      }
      publicKey = existing_public_key.trim();

      // A wallet can be linked to only one account — reject if this public key
      // is already registered on the platform.
      const { data: walletInUse } = await supabase
        .from("users")
        .select("id")
        .eq("stellar_public_key", publicKey)
        .maybeSingle();
      if (walletInUse) {
        return res.status(409).json({
          success: false,
          error:
            "This wallet is already registered on the platform. Each Stellar public key can be linked to only one account.",
          code: "WALLET_ALREADY_REGISTERED",
        });
      }

      // Validate the account exists on Stellar Mainnet
      try {
        await horizon.loadAccount(publicKey);
        console.log(`[Register] USER_CONTROLLED wallet validated on mainnet: ${publicKey}`);
      } catch {
        return res.status(400).json({
          success: false,
          error: "This Stellar account was not found on Mainnet. Fund it with at least 1 XLM and retry.",
          code: "ACCOUNT_NOT_FOUND_ON_MAINNET",
        });
      }
    } else {
      // PLATFORM_MANAGED — generate fresh keypair and encrypt the secret
      const pair = Keypair.random();
      publicKey = pair.publicKey();
      // Security: encrypt before storing — NEVER store raw secret
      encryptedSecret = encryptSecret(pair.secret());
      console.log(`[Register] PLATFORM_MANAGED keypair generated for new account.`);
    }

    // ── Account funding (PLATFORM_MANAGED only) ──────────────────────────────
    let stellarFunded = false;

    if (resolvedMode === "PLATFORM_MANAGED") {
      // Mainnet: fund new account from Operator with minimum XLM (2.5 XLM)
      const operatorSecret = (process.env.OPERATOR_SECRET || process.env.STELLAR_SECRET || "").trim();
      if (operatorSecret) {
        try {
          const operatorKeypair = Keypair.fromSecret(operatorSecret);
          const operatorAccount = await horizon.loadAccount(operatorKeypair.publicKey());

          const tx = new TransactionBuilder(operatorAccount, {
            fee: BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE,
          })
            .addOperation(
              Operation.createAccount({
                destination: publicKey,
                startingBalance: "2.5",
              }),
            )
            .setTimeout(30)
            .build();

          tx.sign(operatorKeypair);
          await horizon.submitTransaction(tx);
          stellarFunded = true;
          console.log(`[Register] PLATFORM_MANAGED account ${publicKey} funded with 2.5 XLM.`);
        } catch (fundError) {
          console.warn("[Register] Mainnet funding failed (non-fatal):", fundError.message);
        }
      }
    } else {
      // USER_CONTROLLED — account already exists on-chain (validated above)
      stellarFunded = true;
    }

    // ── Auto-create EPWR trustline (PLATFORM_MANAGED only) ───────────────────
    // USER_CONTROLLED wallets sign their own trustline via TransactionSigningModal.
    let epwrTrustline = false;
    if (resolvedMode === "PLATFORM_MANAGED" && stellarFunded && encryptedSecret) {
      try {
        const issuerPK = (process.env.EPWR_ISSUER_PUBLIC_KEY || "").trim();
        if (issuerPK) {
          // Decrypt to sign — secret used only in memory, not logged
          const { decryptSecret } = await import("../lib/crypto.js");
          const rawSecret = decryptSecret(encryptedSecret);
          const userKeypair = Keypair.fromSecret(rawSecret);
          const userAccount = await horizon.loadAccount(publicKey);

          const trustTx = new TransactionBuilder(userAccount, {
            fee: BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE,
          })
            .addOperation(
              Operation.changeTrust({
                asset: new Asset("EPWR", issuerPK),
              }),
            )
            .setTimeout(30)
            .build();

          trustTx.sign(userKeypair);
          await horizon.submitTransaction(trustTx);
          epwrTrustline = true;
          console.log(`[Register] EPWR trustline created for ${publicKey}.`);
        }
      } catch (trustError) {
        console.warn("[Register] EPWR trustline creation failed (non-fatal):", trustError.message);
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate email-verification token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");

    const VALID_ENERGY_TYPES = ["SOLAR", "HYDRO", "SMALL_HYDRO", "WIND", "BIOMASS", "NATURAL_GAS", "NUCLEAR", "THERMAL", "COGENERATION", "GRID"];
    // Generators may operate several generation sources. Accept an array
    // (energy_types) and validate/dedupe it; keep energy_type (single) as the
    // primary source for backward-compatible readers (grid map, legacy rows).
    const incomingEnergyTypes = Array.isArray(energy_types)
      ? energy_types
      : energy_type
        ? [energy_type]
        : [];
    const resolvedEnergyTypes = roles?.includes("GENERATOR")
      ? [...new Set(incomingEnergyTypes.filter((t) => VALID_ENERGY_TYPES.includes(t)))]
      : [];
    const resolvedEnergyType = resolvedEnergyTypes[0] ?? null;

    // Privileged market roles require admin approval — park them in pending_roles
    // (inactive) until an admin approves. Non-privileged roles are active at once.
    const PRIVILEGED_ROLES = ["GENERATOR", "SELLER", "UTILITY"];
    const activeRoles  = roles.filter((r) => !PRIVILEGED_ROLES.includes(r));
    const pendingRoles = roles.filter((r) =>  PRIVILEGED_ROLES.includes(r));

    const baseInsert = {
      email,
      password: hashedPassword,
      full_name,
      organization,
      cpf_cnpj: docNumberToStore,
      document_type: resolvedDocType,
      roles: activeRoles,
      pending_roles: pendingRoles,
      stellar_public_key: publicKey,
      // SECURITY: only PLATFORM_MANAGED wallets have an encrypted secret stored.
      // USER_CONTROLLED: null — secret never leaves the user's device.
      stellar_secret_encrypted: encryptedSecret,
      wallet_mode: resolvedMode,
      wallet_status: "ACTIVE",
      wallet_network: "PUBLIC",
      country,
      city,
      address,
      has_solar_generation,
      coords: coords ?? null,
      email_verified: false,
      email_verification_token: emailVerificationToken,
      phone_verified: false,
    };

    // Try with all optional extras; fall back gracefully if any column doesn't exist yet.
    let data, error;
    const withExtras = {
      ...baseInsert,
      ...(state ? { state } : {}),
      ...(phone ? { phone } : {}),
      ...(resolvedEnergyType ? { energy_type: resolvedEnergyType } : {}),
      ...(resolvedEnergyTypes.length ? { energy_types: resolvedEnergyTypes } : {}),
    };

    ({ data, error } = await supabase.from("users").insert([withExtras]).select());

    if (error && error.message?.includes("energy_types")) {
      console.warn("[Auth] energy_types column not found — retrying without it.");
      const withoutEnergyTypes = {
        ...baseInsert,
        ...(state ? { state } : {}),
        ...(phone ? { phone } : {}),
        ...(resolvedEnergyType ? { energy_type: resolvedEnergyType } : {}),
      };
      ({ data, error } = await supabase.from("users").insert([withoutEnergyTypes]).select());
    }

    if (error && (error.message?.includes("energy_type") || error.code === "42703")) {
      console.warn("[Auth] energy_type column not found — retrying without it.");
      const withoutEnergyType = { ...baseInsert, ...(state ? { state } : {}), ...(phone ? { phone } : {}) };
      ({ data, error } = await supabase.from("users").insert([withoutEnergyType]).select());
    }

    if (error && (error.message?.includes("state") || error.code === "42703")) {
      console.warn("[Auth] state column not found — retrying without it.");
      const withoutState = { ...baseInsert, ...(phone ? { phone } : {}) };
      ({ data, error } = await supabase.from("users").insert([withoutState]).select());
    }

    if (error && (error.message?.includes("phone") || error.code === "42703")) {
      console.warn("[Auth] phone column not found — retrying without it.");
      ({ data, error } = await supabase.from("users").insert([baseInsert]).select());
    }

    if (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const token = jwt.sign(
      {
        sub: data[0].id,
        email: data[0].email,
        roles: data[0].roles,
        phone: data[0].phone ?? phone ?? null,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    // Send verification email (non-blocking — don't fail registration if email fails)
    let devVerifyUrl = null;
    try {
      const verifyResult = await sendVerificationEmail({
        to: email,
        fullName: full_name,
        verificationToken: emailVerificationToken,
      });
      if (verifyResult?.skipped && process.env.NODE_ENV !== "production") {
        const _siteUrl =
          process.env.SITE_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
          process.env.BACKEND_URL ||
          "http://localhost:3000";
        devVerifyUrl = `${_siteUrl}/api/auth/verify-email?token=${emailVerificationToken}`;
        console.log(`[Auth] DEV — verify email link for ${email}: ${devVerifyUrl}`);
      }
    } catch (e) {
      console.warn("[Auth] Verification email failed:", e.message);
    }

    res.json({
      success: true,
      token,
      ...(devVerifyUrl && { dev_verify_url: devVerifyUrl }),
      user: {
        id: data[0].id,
        email: data[0].email,
        full_name: data[0].full_name,
        phone: data[0].phone ?? phone ?? null,
        organization: data[0].organization,
        roles: data[0].roles,
        pending_roles: data[0].pending_roles ?? pendingRoles,
        stellar_public_key: publicKey,
        wallet_mode: resolvedMode,
        wallet_status: "ACTIVE",
        country: data[0].country,
        state: state ?? data[0].state ?? null,
        city,
        address,
        has_solar_generation,
        coords: data[0].coords ?? coords ?? null,
        email_verified: false,
        phone_verified: false,
        funded: stellarFunded,
      },
      provisioning: {
        wallet_created: true,
        wallet_mode: resolvedMode,
        stellar_funded: stellarFunded,
        epwr_trustline: epwrTrustline,
        settlement_ready: stellarFunded && epwrTrustline,
        roles_assigned: true,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// LOGIN
// =====================================================

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.from("users").select("*").eq("email", email).single();

    if (error || !data) {
      return res.status(401).json({ success: false, error: "invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, data.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: "invalid credentials" });
    }

    // Blocked accounts cannot start a new session.
    if (data.account_status === "BLOCKED") {
      return res.status(403).json({
        success: false,
        error: "ACCOUNT_BLOCKED",
        message: "This account has been blocked. Contact platform support.",
      });
    }

    const token = jwt.sign(
      {
        sub: data.id,
        id: data.id,
        email: data.email,
        roles: data.roles,
        publicKey: data.stellar_public_key,
        phone: data.phone || null,
        platform_role: data.platform_role ?? "USER",
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" },
    );

    res.json({
      success: true,
      token,
      user: {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        phone: data.phone || null,
        organization: data.organization,
        roles: data.roles,
        pending_roles: data.pending_roles ?? [],
        stellar_public_key: data.stellar_public_key,
        wallet_mode: data.wallet_mode ?? "PLATFORM_MANAGED",
        wallet_status: data.wallet_status ?? "ACTIVE",
        country: data.country,
        state: data.state ?? null,
        city: data.city,
        address: data.address,
        has_solar_generation: data.has_solar_generation,
        coords: data.coords ?? null,
        email_verified: !!data.email_verified,
        phone_verified: !!data.phone_verified,
        // Funded = wallet_status is ACTIVE and there is a public key provisioned.
        // The authoritative on-chain balance comes from /api/wallet/:key/balances.
        funded: !!(data.stellar_public_key && data.wallet_status !== "FAILED"),
        platform_role: data.platform_role ?? "USER",
      },
      wallet: {
        publicKey: data.stellar_public_key,
        network: NETWORK_LABEL,
        funded: !!(data.stellar_public_key && data.wallet_status !== "FAILED"),
        walletMode: data.wallet_mode ?? "PLATFORM_MANAGED",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// STEP-UP — re-confirm identity for maximum-security areas
// (card management, fiscal-document downloads, etc.)
// Returns a short-lived (5 min) step-up token bound to the user.
// =====================================================

router.post("/step-up", requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: "PASSWORD_REQUIRED" });
    }

    const userId = req.operator.sub || req.operator.id;
    const { data, error } = await supabase
      .from("users")
      .select("id, email, password")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return res.status(401).json({ success: false, error: "USER_NOT_FOUND" });
    }

    // Never log the attempted password.
    const validPassword = await bcrypt.compare(password, data.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: "INVALID_PASSWORD" });
    }

    const stepUpToken = jwt.sign(
      { sub: data.id, id: data.id, scope: "step-up" },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    );

    return res.json({
      success: true,
      step_up_token: stepUpToken,
      scope: "step-up",
      expires_in: 300,
    });
  } catch (err) {
    console.error("[auth/step-up]", err.message);
    return res.status(500).json({ success: false, error: "STEP_UP_FAILED" });
  }
});

// =====================================================
// FORGOT PASSWORD
// =====================================================

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: "email is required" });
    }

    const { data } = await supabase.from("users").select("id, email, full_name").eq("email", email).single();

    // Always respond 200 to avoid email enumeration
    if (!data) {
      return res.json({ success: true, message: "If that email is registered, a reset link has been sent." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await saveResetToken(token, data.id, data.email);

    // Canonical site URL — same resolution as emailService.js
    const siteUrl =
      process.env.SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      "http://localhost:3000";
    const frontendBase = process.env.FRONTEND_URL || siteUrl;
    const isDev = process.env.NODE_ENV !== "production";

    // Respond immediately — NEVER await email delivery.
    // A slow or misconfigured Resend API must not block the Vercel function.
    if (!process.env.RESEND_API_KEY && isDev) {
      // No mail provider: give devs a clickable link so they can still test.
      const resetUrl = `${frontendBase}/reset-password?token=${token}`;
      console.log(`[ForgotPassword] DEV — reset link for ${data.email}: ${resetUrl}`);
      res.json({
        success: true,
        message: "If that email is registered, a reset link has been sent.",
        dev_reset_url: resetUrl,
      });
    } else {
      res.json({ success: true, message: "If that email is registered, a reset link has been sent." });
    }

    // Fire email in background after the response has been flushed
    sendPasswordResetEmail({ to: data.email, fullName: data.full_name, resetToken: token })
      .catch((e) => console.warn("[ForgotPassword] Email send failed:", e.message));
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// RESET PASSWORD
// =====================================================

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, error: "token and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: "password must be at least 6 characters" });
    }

    const entry = await getResetToken(token);
    if (!entry) {
      return res.status(400).json({ success: false, error: "invalid or expired reset token" });
    }

    // Look up user to check if they have a verified phone
    const { data: user } = await supabase
      .from("users")
      .select("id, full_name, phone, phone_verified")
      .eq("id", entry.user_id)
      .single();

    const hashedPassword = await bcrypt.hash(password, 10);

    // If user has a verified phone → require OTP before committing password change
    if (user?.phone_verified && user?.phone) {
      const code = String(crypto.randomInt(100000, 1000000));

      // Persist hashed password + OTP in the DB row
      await saveResetPhoneCode(token, entry.user_id, hashedPassword, code);

      const maskedPhone = user.phone.replace(/(\+\d{2})\d+(\d{2})$/, "$1·····$2");

      // Try to deliver the OTP over the configured channel (WhatsApp or SMS).
      let delivered = false;
      try {
        const result = await sendVerificationOtp({ to: user.phone, fullName: user.full_name, code });
        delivered = !result?.fallback; // fallback === channel not configured, nothing sent
      } catch (otpErr) {
        console.error("[ResetPassword] OTP delivery failed:", otpErr.message);
        delivered = false;
      }

      if (delivered) {
        // A real code was sent — require the phone confirmation step.
        return res.json({ success: true, require_phone: true, phone_masked: maskedPhone });
      }

      if (process.env.NODE_ENV !== "production") {
        // Dev: keep the 2FA path testable by surfacing the code (never in prod).
        console.log(`[ResetPassword] DEV — phone OTP for ${user.phone}: ${code}`);
        return res.json({ success: true, require_phone: true, phone_masked: maskedPhone, dev_otp: code });
      }

      // Production + undeliverable OTP → never lock the user out. The reset token
      // already proves control of the registered email, so complete the reset on
      // that factor alone (same assurance as accounts without a verified phone).
      console.warn("[ResetPassword] OTP undeliverable in production — completing reset via email factor only.");
      await deleteResetPhoneCode(token);
      const { error: pwError } = await supabase
        .from("users")
        .update({ password: hashedPassword })
        .eq("id", entry.user_id);
      if (pwError) {
        return res.status(500).json({ success: false, error: pwError.message });
      }
      await deleteResetToken(token);
      return res.json({ success: true, message: "Password updated successfully." });
    }

    // No verified phone — complete password reset directly
    const { error } = await supabase
      .from("users")
      .update({ password: hashedPassword })
      .eq("id", entry.user_id);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    await deleteResetToken(token);
    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// RESET PASSWORD — CONFIRM PHONE OTP
// Step 2: verify the OTP sent to the user's phone.
// On success, the new password is committed.
// =====================================================

router.post("/reset-password/confirm-phone", async (req, res) => {
  try {
    const { token, code } = req.body;
    if (!token || !code) {
      return res.status(400).json({ success: false, error: "token and code are required" });
    }

    // Validate original reset token + phone code (single DB read)
    const resetEntry = await getResetToken(token);
    if (!resetEntry) {
      return res.status(400).json({ success: false, error: "Reset session expired. Please start over." });
    }

    if (!resetEntry.phone_code || !resetEntry.phone_code_expires_at) {
      return res.status(400).json({ success: false, error: "No pending phone verification for this reset. Please start over." });
    }

    if (new Date(resetEntry.phone_code_expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: "Verification code expired. Please start over." });
    }

    if (String(code).trim() !== resetEntry.phone_code) {
      return res.status(400).json({ success: false, error: "Invalid verification code." });
    }

    // Commit the new password
    const { error } = await supabase
      .from("users")
      .update({ password: resetEntry.hashed_password })
      .eq("id", resetEntry.user_id);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    // Clean up the reset token row entirely
    await deleteResetToken(token);

    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// LIST COUNTERPARTIES (for contract seller selection)
// =====================================================

router.get("/counterparties", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select(
        "id, full_name, email, organization, roles, stellar_public_key, country, city, email_verified, phone_verified, phone",
      )
      .eq("email_verified", true)
      // Phone verification is optional (event policy): email-verified users may transact.
      .not("stellar_public_key", "is", null)
      .order("full_name", { ascending: true });

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const counterparties = (data || []).map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      organization: u.organization,
      roles: u.roles || [],
      stellar_public_key: u.stellar_public_key,
      country: u.country,
      city: u.city,
      email_verified: u.email_verified === true,
      phone_verified: u.phone_verified === true,
      phone_masked: u.phone ? u.phone.replace(/(\+\d{2})\d+(\d{2})/, "$1·····$2") : null,
    }));

    res.json({ success: true, counterparties });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// VERIFY EMAIL
// =====================================================

router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, error: "verification token is required" });
    }

    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, email_verified")
      .eq("email_verification_token", token)
      .single();

    if (error || !data) {
      return res.status(400).json({ success: false, error: "invalid or expired verification token" });
    }

    if (data.email_verified) {
      return res.json({ success: true, message: "Email already verified.", already_verified: true });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ email_verified: true, email_verification_token: null })
      .eq("id", data.id);

    if (updateError) {
      return res.status(500).json({ success: false, error: updateError.message });
    }

    // Send welcome email now that email is verified
    const { data: fullUser } = await supabase
      .from("users")
      .select("stellar_public_key")
      .eq("id", data.id)
      .single();

    sendWelcomeEmail({
      to: data.email,
      fullName: data.full_name,
      operatorId: data.id,
      publicKey: fullUser?.stellar_public_key ?? "",
    }).catch((e) => console.warn("[Auth] Welcome email failed:", e.message));

    // Redirect to frontend with success
    const _siteUrl =
      process.env.SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      "http://localhost:3000";
    const frontendUrl = process.env.FRONTEND_URL || _siteUrl;
    res.redirect(`${frontendUrl}/login?verified=true`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// RESEND VERIFICATION EMAIL
// =====================================================

router.post("/resend-verification", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "authentication required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: "invalid token" });
    }

    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, email_verified")
      .eq("id", decoded.sub || decoded.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: "user not found" });
    }

    if (data.email_verified) {
      return res.json({ success: true, message: "Email already verified.", already_verified: true });
    }

    // Generate new verification token
    const newToken = crypto.randomBytes(32).toString("hex");
    await supabase
      .from("users")
      .update({ email_verification_token: newToken })
      .eq("id", data.id);

    const resendResult = await sendVerificationEmail({
      to: data.email,
      fullName: data.full_name,
      verificationToken: newToken,
    });

    const isDev = process.env.NODE_ENV !== "production";
    if (resendResult?.skipped && isDev) {
      const _siteUrl =
        process.env.SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
        process.env.BACKEND_URL ||
        "http://localhost:3000";
      const devVerifyUrl = `${_siteUrl}/api/auth/verify-email?token=${newToken}`;
      console.log(`[Auth] DEV — verify email link for ${data.email}: ${devVerifyUrl}`);
      return res.json({
        success: true,
        message: "Verification email sent.",
        dev_verify_url: devVerifyUrl,
      });
    }

    res.json({ success: true, message: "Verification email sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// GRID PARTICIPANTS (verified users — with or without GPS)
// =====================================================

// City-level coordinate lookup for approximate positioning on the grid map.
// Used when a user has not provided GPS/manual coordinates.
const CITY_COORDS = {
  // ── São Paulo state ────────────────────────────────────────────────────────
  "São Paulo": [-23.5505, -46.6333], "Sao Paulo": [-23.5505, -46.6333],
  "Campinas": [-22.9056, -47.0608],
  "Santos": [-23.9618, -46.3322],
  "Ribeirão Preto": [-21.1775, -47.8103], "Ribeirao Preto": [-21.1775, -47.8103],
  "Sorocaba": [-23.5015, -47.4526],
  "São Bernardo do Campo": [-23.6939, -46.5650], "Sao Bernardo do Campo": [-23.6939, -46.5650],
  "São José dos Campos": [-23.1794, -45.8869], "Sao Jose dos Campos": [-23.1794, -45.8869],
  "Osasco": [-23.5329, -46.7919],
  "Santo André": [-23.6639, -46.5383], "Santo Andre": [-23.6639, -46.5383],
  "Guarulhos": [-23.4543, -46.5337],
  "Bauru": [-22.3246, -49.0733],
  "São José do Rio Preto": [-20.8197, -49.3794], "Sao Jose do Rio Preto": [-20.8197, -49.3794],
  "Jundiaí": [-23.1857, -46.8974], "Jundiai": [-23.1857, -46.8974],
  "Piracicaba": [-22.7253, -47.6492],
  "Franca": [-20.5386, -47.4008],
  "Limeira": [-22.5644, -47.4019],
  "Taubaté": [-23.0229, -45.5558], "Taubate": [-23.0229, -45.5558],
  "Barueri": [-23.5109, -46.8756],
  "Mogi das Cruzes": [-23.5228, -46.1876],
  // ── Rio de Janeiro state ───────────────────────────────────────────────────
  "Rio de Janeiro": [-22.9068, -43.1729],
  "Petrópolis": [-22.505, -43.179], "Petropolis": [-22.505, -43.179],
  "Niterói": [-22.8833, -43.1036], "Niteroi": [-22.8833, -43.1036],
  "Nova Iguaçu": [-22.7592, -43.4511], "Nova Iguacu": [-22.7592, -43.4511],
  "Duque de Caxias": [-22.7856, -43.3117],
  "São Gonçalo": [-22.8268, -43.0535], "Sao Goncalo": [-22.8268, -43.0535],
  "Campos dos Goytacazes": [-21.7609, -41.3306],
  "Volta Redonda": [-22.5231, -44.1042],
  "Angra dos Reis": [-23.0067, -44.318],
  "Resende": [-22.4686, -44.4506],
  "Teresópolis": [-22.4123, -42.9651], "Teresopolis": [-22.4123, -42.9651],
  "Macaé": [-22.3710, -41.7869], "Macae": [-22.3710, -41.7869],
  "Cabo Frio": [-22.8789, -42.0189],
  "Búzios": [-22.7469, -41.8820], "Buzios": [-22.7469, -41.8820],
  "Barra Mansa": [-22.5441, -44.1753],
  // ── Minas Gerais state ────────────────────────────────────────────────────
  "Belo Horizonte": [-19.9167, -43.9345],
  "Uberlândia": [-18.9186, -48.2772], "Uberlandia": [-18.9186, -48.2772],
  "Contagem": [-19.9317, -44.0536],
  "Juiz de Fora": [-21.7608, -43.3504],
  "Betim": [-19.9686, -44.1975],
  "Montes Claros": [-16.7286, -43.8614],
  "Uberaba": [-19.7482, -47.9319],
  "Governador Valadares": [-18.8510, -41.9494],
  "Ipatinga": [-19.4683, -42.5362],
  "Divinópolis": [-20.1386, -44.8853], "Divinopolis": [-20.1386, -44.8853],
  "Sete Lagoas": [-19.4653, -44.2471],
  "Varginha": [-21.5517, -45.4307],
  // ── Northeast ─────────────────────────────────────────────────────────────
  "Salvador": [-12.9714, -38.5014],
  "Fortaleza": [-3.7172, -38.5433],
  "Recife": [-8.0578, -34.8829],
  "São Luís": [-2.5287, -44.3028], "Sao Luis": [-2.5287, -44.3028],
  "Maceió": [-9.6658, -35.735], "Maceio": [-9.6658, -35.735],
  "Natal": [-5.7945, -35.211],
  "Teresina": [-5.0892, -42.8019],
  "João Pessoa": [-7.1195, -34.845], "Joao Pessoa": [-7.1195, -34.845],
  "Aracaju": [-10.9472, -37.0731],
  "Feira de Santana": [-12.2664, -38.9663],
  "Caruaru": [-8.2828, -35.9756],
  "Mossoró": [-5.1875, -37.3441], "Mossoro": [-5.1875, -37.3441],
  "Ilhéus": [-14.7952, -39.0496], "Ilheus": [-14.7952, -39.0496],
  // ── South ─────────────────────────────────────────────────────────────────
  "Curitiba": [-25.4278, -49.2731],
  "Porto Alegre": [-30.0277, -51.2287],
  "Florianópolis": [-27.5954, -48.548], "Florianopolis": [-27.5954, -48.548],
  "Londrina": [-23.3045, -51.1696],
  "Maringá": [-23.4273, -51.9375], "Maringa": [-23.4273, -51.9375],
  "Joinville": [-26.3044, -48.8453],
  "Blumenau": [-26.9194, -49.0661],
  "São José": [-27.5969, -48.6388], "Sao Jose": [-27.5969, -48.6388],
  "Foz do Iguaçu": [-25.5469, -54.5882], "Foz do Iguacu": [-25.5469, -54.5882],
  "Cascavel": [-24.9578, -53.4595],
  "Ponta Grossa": [-25.0945, -50.1633],
  "Caxias do Sul": [-29.1682, -51.1794],
  "Pelotas": [-31.7649, -52.3371],
  "Santa Maria": [-29.6842, -53.8069],
  "Canoas": [-29.9178, -51.1839],
  // ── Center-West ───────────────────────────────────────────────────────────
  "Brasília": [-15.7801, -47.9292], "Brasilia": [-15.7801, -47.9292],
  "Goiânia": [-16.6864, -49.2643], "Goiania": [-16.6864, -49.2643],
  "Campo Grande": [-20.4697, -54.6201],
  "Cuiabá": [-15.6014, -56.0979], "Cuiaba": [-15.6014, -56.0979],
  "Anápolis": [-16.3281, -48.9528], "Anapolis": [-16.3281, -48.9528],
  "Aparecida de Goiânia": [-16.8233, -49.2444], "Aparecida de Goiania": [-16.8233, -49.2444],
  "Rondonópolis": [-16.4727, -54.6358], "Rondonopolis": [-16.4727, -54.6358],
  "Dourados": [-22.2213, -54.8058],
  // ── North ─────────────────────────────────────────────────────────────────
  "Manaus": [-3.1019, -60.025],
  "Belém": [-1.4558, -48.4902], "Belem": [-1.4558, -48.4902],
  "Palmas": [-10.2491, -48.3243],
  "Porto Velho": [-8.7612, -63.9004],
  "Rio Branco": [-9.9754, -67.8249],
  "Boa Vista": [2.8235, -60.6758],
  "Macapá": [0.0356, -51.0705], "Macapa": [0.0356, -51.0705],
  "Santarém": [-2.4448, -54.7081], "Santarem": [-2.4448, -54.7081],
  "Marabá": [-5.3686, -49.1178], "Maraba": [-5.3686, -49.1178],
  // ── Espírito Santo ────────────────────────────────────────────────────────
  "Vitória": [-20.3222, -40.3381], "Vitoria": [-20.3222, -40.3381],
  "Vila Velha": [-20.3297, -40.2922],
  "Serra": [-20.1289, -40.3081],
  "Cariacica": [-20.2633, -40.4197],
};

const COUNTRY_CENTROIDS = {
  "Brazil": [-14.235, -51.925], "Brasil": [-14.235, -51.925],
  "Argentina": [-38.416, -63.616],
  "Colombia": [4.57, -74.297],
  "Chile": [-35.675, -71.543],
  "Peru": [-9.19, -75.015],
  "Uruguay": [-32.522, -55.765],
  "Paraguay": [-23.442, -58.443],
  "Portugal": [39.399, -8.224],
  "Spain": [40.463, -3.749],
  "United States": [37.09, -95.712], "USA": [37.09, -95.712],
};

/**
 * Deterministic jitter from user UUID so approximate positions don't stack.
 * Two calls with the same id always return the same offset (±0.25°).
 */
function idJitter(id = "") {
  const hex = id.replace(/-/g, "").slice(0, 8);
  const n = parseInt(hex, 16) || 0;
  const latJ = ((n % 500) / 500 - 0.5) * 0.5;
  const lngJ = ((Math.floor(n / 500) % 500) / 500 - 0.5) * 0.5;
  return { latJ, lngJ };
}

router.get("/grid-participants", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, organization, roles, stellar_public_key, country, city, coords, email_verified, phone_verified, has_solar_generation, energy_type, energy_types")
      .eq("email_verified", true)   // must have verified email
      // Phone verification is optional (event policy): email-verified users participate.
      // coords not required — city-level fallback applied below
      .order("full_name", { ascending: true });

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const participants = (data || []).map((u) => {
      const roles = u.roles || [];
      const primaryRole = roles[0] || "USER";

      // Prefer explicitly stored energy_type; fall back to has_solar_generation for legacy accounts
      const VALID_ENERGY = ["SOLAR", "HYDRO", "WIND", "THERMAL", "GRID"];
      let energyType = "GRID";
      if (primaryRole === "GENERATOR") {
        if (u.energy_type && VALID_ENERGY.includes(u.energy_type)) {
          energyType = u.energy_type;
        } else {
          energyType = u.has_solar_generation ? "SOLAR" : "HYDRO";
        }
      }

      // Full set of generation sources — Generators may operate several.
      const VALID_ENERGY_FULL = ["SOLAR", "HYDRO", "SMALL_HYDRO", "WIND", "BIOMASS", "NATURAL_GAS", "NUCLEAR", "THERMAL", "COGENERATION", "GRID"];
      let energyTypes = [];
      if (primaryRole === "GENERATOR") {
        if (Array.isArray(u.energy_types) && u.energy_types.length) {
          energyTypes = u.energy_types.filter((t) => VALID_ENERGY_FULL.includes(t));
        } else if (u.energy_type && VALID_ENERGY_FULL.includes(u.energy_type)) {
          energyTypes = [u.energy_type];
        } else {
          energyTypes = [energyType];
        }
      }

      // Resolve coordinates: GPS > MANUAL > city lookup > country centroid > Brazil default
      let coords = u.coords;
      let approximateLocation = false;

      if (!coords) {
        approximateLocation = true;
        const city = (u.city || "").trim();
        const country = (u.country || "").trim();
        const { latJ, lngJ } = idJitter(u.id);

        let base = CITY_COORDS[city] || COUNTRY_CENTROIDS[country] || [-14.235, -51.925];
        coords = { lat: base[0] + latJ, lng: base[1] + lngJ, source: "APPROXIMATE" };
      }

      return {
        id: u.id,
        organization: u.organization || u.full_name,
        role: primaryRole,
        roles,
        energyType,
        energyTypes,
        settlementAddress: u.stellar_public_key,
        region: `${u.city || "—"} · ${u.country || "—"}`,
        jurisdiction: u.country || "—",
        coords,
        email_verified: u.email_verified,
        approximate_location: approximateLocation,
      };
    });

    res.json({ success: true, participants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// UPDATE PHONE NUMBER
// =====================================================

router.post("/update-phone", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "authentication required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: "invalid token" });
    }

    const { phone } = req.body;
    if (!phone || phone.trim().length < 8) {
      return res.status(400).json({ success: false, error: "A valid phone number is required (min 8 digits)." });
    }

    const userId = decoded.sub || decoded.id;
    const cleanPhone = phone.trim();

    const { error } = await supabase
      .from("users")
      .update({ phone: cleanPhone, phone_verified: false })
      .eq("id", userId);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, phone: cleanPhone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// UPDATE OWN PROFILE (self-service · never role / email / password)
// =====================================================

router.patch("/profile", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;
    // Editable profile fields only — never roles, platform_role, email or password.
    const ALLOWED = ["full_name", "organization", "phone", "country", "state", "city"];
    const KEEP_NONEMPTY = ["full_name", "organization", "country", "city"];
    const updates = {};
    for (const k of ALLOWED) {
      if (typeof req.body?.[k] !== "string") continue;
      const v = req.body[k].trim();
      if (v === "" && KEEP_NONEMPTY.includes(k)) continue; // don't blank required fields
      updates[k] = v === "" ? null : v;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: "No editable profile fields provided." });
    }
    if ("phone" in updates) updates.phone_verified = false; // re-verify on phone change

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select("id, full_name, organization, phone, country, state, city, phone_verified")
      .single();
    if (error) throw error;

    res.json({ success: true, user: data });
  } catch (err) {
    console.error("[auth/update-profile]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// UPLOAD IDENTITY DOCUMENT (self-service · PDF only)
// =====================================================

router.post(
  "/identity-document",
  requireAuth,
  express.raw({ type: "*/*", limit: "15mb" }),
  async (req, res) => {
    try {
      const userId = req.operator.sub || req.operator.id;
      const contentType = req.headers["content-type"] || "";
      if (!contentType.toLowerCase().includes("application/pdf")) {
        return res.status(400).json({ success: false, error: "Only PDF files are accepted." });
      }
      const rawName = req.headers["x-file-name"]
        ? decodeURIComponent(req.headers["x-file-name"])
        : "identity.pdf";
      const fileName = rawName.replace(/[/\\]/g, "_").slice(0, 200);
      const storagePath = `${userId}/${Date.now()}_${fileName}`;

      const { error: upErr } = await supabase.storage
        .from("identity-documents")
        .upload(storagePath, req.body, { contentType: "application/pdf", upsert: true });
      if (upErr) {
        return res.status(500).json({ success: false, error: upErr.message });
      }

      const { error } = await supabase
        .from("users")
        .update({ document_path: storagePath, document_name: fileName })
        .eq("id", userId);
      if (error) throw error;

      res.json({ success: true, document_name: fileName });
    } catch (err) {
      console.error("[auth/identity-document]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

// =====================================================
// SEND PHONE VERIFICATION CODE
// =====================================================

router.post("/send-phone-code", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "authentication required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: "invalid token" });
    }

    const userId = decoded.sub || decoded.id;
    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, phone, phone_verified")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: "user not found" });
    }

    if (data.phone_verified) {
      return res.json({ success: true, message: "Phone already verified.", already_verified: true });
    }

    if (!data.phone) {
      return res.status(400).json({ success: false, error: "No phone number registered. Update your profile first." });
    }

    const maskedPhone = data.phone.replace(/(\+\d{2})\d+(\d{2})$/, "$1·····$2");

    // Preferred path: Twilio Verify (managed OTP — WhatsApp or SMS, no sandbox
    // opt-in, no purchased number). Twilio generates, sends and later validates
    // the code, so we store nothing here.
    if (isVerifyConfigured()) {
      try {
        const started = await startPhoneVerification({ to: data.phone });
        return res.json({
          success: true,
          message: `Verification code sent to ${maskedPhone} via ${started.channel}.`,
          channel: started.channel,
        });
      } catch (verErr) {
        console.error("[SendPhoneCode] Twilio Verify start failed:", verErr.message);
        return res.status(502).json({
          success: false,
          error: "OTP_DELIVERY_UNAVAILABLE",
          message: "Could not send the verification code right now. Please try again shortly.",
        });
      }
    }

    // Legacy fallback (no Verify Service configured): self-generated 6-digit code
    // persisted in the DB (survives across serverless instances).
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
    await supabase
      .from("users")
      .update({ phone_verification_code: code, phone_verification_expires_at: expiresAt })
      .eq("id", userId);

    // Send code via the configured OTP channel (WhatsApp or SMS).
    let otpResult;
    try {
      otpResult = await sendVerificationOtp({
        to: data.phone,
        fullName: data.full_name,
        code,
      });
    } catch (otpErr) {
      console.warn("[SendPhoneCode] OTP delivery failed:", otpErr.message);
      otpResult = { fallback: true, error: otpErr.message };
    }

    // Channel not configured, or delivery failed.
    if (otpResult?.fallback) {
      if (process.env.NODE_ENV !== "production") {
        // Dev only: surface the code so the flow stays testable without a provider.
        console.log(`[SendPhoneCode] OTP provider unavailable — DEV code for ${maskedPhone}: ${code}`);
        return res.json({
          success: true,
          message: `Verification code generated for ${maskedPhone}.`,
          dev_code: code,
        });
      }
      // SECURITY: never return the code in production. Fail clearly so the operator
      // configures the OTP provider (Twilio) instead of silently leaking the code.
      console.error(`[SendPhoneCode] OTP provider unavailable in production for ${maskedPhone}.`);
      return res.status(502).json({
        success: false,
        error: "OTP_DELIVERY_UNAVAILABLE",
        message: "Could not send the verification code right now. Please try again shortly.",
      });
    }

    res.json({ success: true, message: `Verification code sent to ${maskedPhone}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// VERIFY PHONE CODE
// =====================================================

router.post("/verify-phone-code", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "authentication required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: "invalid token" });
    }

    const userId = decoded.sub || decoded.id;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: "verification code is required" });
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("phone, phone_verification_code, phone_verification_expires_at")
      .eq("id", userId)
      .single();

    // Preferred path: validate via Twilio Verify (managed OTP).
    if (isVerifyConfigured()) {
      if (!userRow?.phone) {
        return res.status(400).json({ success: false, error: "No phone number on file." });
      }
      let approved = false;
      try {
        approved = (await checkPhoneVerification({ to: userRow.phone, code })).approved;
      } catch (verErr) {
        console.error("[VerifyPhoneCode] Twilio Verify check failed:", verErr.message);
        return res.status(502).json({ success: false, error: "Could not verify the code right now. Please try again." });
      }
      if (!approved) {
        return res.status(400).json({ success: false, error: "Invalid or expired code." });
      }
      const { error: vErr } = await supabase.from("users").update({ phone_verified: true }).eq("id", userId);
      if (vErr) return res.status(500).json({ success: false, error: vErr.message });
      return res.json({ success: true, message: "Phone verified successfully." });
    }

    // Legacy fallback: compare the DB-stored code.
    if (
      !userRow?.phone_verification_code ||
      !userRow?.phone_verification_expires_at ||
      new Date(userRow.phone_verification_expires_at) < new Date()
    ) {
      return res.status(400).json({ success: false, error: "Code expired or not found. Request a new one." });
    }

    if (userRow.phone_verification_code !== String(code).trim()) {
      return res.status(400).json({ success: false, error: "Invalid code." });
    }

    // Mark verified and clear the code in a single update
    const { error } = await supabase
      .from("users")
      .update({
        phone_verified: true,
        phone_verification_code: null,
        phone_verification_expires_at: null,
      })
      .eq("id", userId);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, message: "Phone verified successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
