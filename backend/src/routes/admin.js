/**
 * Admin routes — account lifecycle management + platform user management.
 *
 * POST /api/admin/cleanup-inactive
 *   Deletes accounts that have been inactive for 7+ days:
 *   - No settlements as buyer or seller
 *   - No funded Stellar account (or balance === 0)
 *
 *   For funded accounts, merges the Stellar account back into
 *   the operator, recovering the XLM reserve.
 *
 * ─── Platform user management (requires JWT + platform_role) ─────────────
 * GET    /api/admin/users                       — list all users (searchable)
 * GET    /api/admin/users/:id                   — get single user
 * PATCH  /api/admin/users/:id                   — update profile fields
 * POST   /api/admin/users/:id/set-password      — force password reset (OWNER)
 * POST   /api/admin/users/:id/set-platform-role — change platform role (OWNER)
 * GET    /api/admin/audit-log                   — view admin audit log
 * GET    /api/admin/recovery-links              — view recovery links
 * POST   /api/admin/recovery-links              — add recovery link (OWNER)
 * DELETE /api/admin/recovery-links/:id          — remove recovery link (OWNER)
 */

import express from "express";
import bcrypt from "bcrypt";
import {
  Keypair,
  Operation,
  TransactionBuilder,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { supabase } from "../lib/supabase.js";
import { NETWORK_PASSPHRASE, horizon } from "../lib/stellar-network.js";
import { requirePlatformRole } from "../middleware/auth.js";
import { logAudit } from "../lib/adminAudit.js";

const router = express.Router();

const INACTIVITY_DAYS = 7;

/** Accounts that must never be deleted (operator, distribution, legacy testnet keys). */
const PROTECTED_ACCOUNTS = new Set([
  "GCBV4JEMUWJH54KWVIGQ56ULHYBT44BJMBWAKABD7KVXFQ4QCT53V2DV",
  "GAC6EW2V5SCW3EEBDNFJSRKIFP7EMI7LYPIX2X3QXWQER4FPQVZGEPUA",
  "GD2S4MPDYMCSPUPPAJ4RULAGVE6PF2Q5HRNT6ELLQYBXKYKO4D646V4S",
  "GDJM2O2NBMZNDQ46EOCAG3WLOCGA2PKP7KOBK4SOTYXDUHNZ5NLIMAM2",
]);

/**
 * Attempt to merge a Stellar account back into the operator,
 * recovering XLM. If the account doesn't exist on-chain or has
 * trustlines that prevent merging, we skip gracefully.
 */
async function mergeAccountIntoOperator(userSecret, operatorPublic) {
  try {
    const userKeypair = Keypair.fromSecret(userSecret);
    const userPublic = userKeypair.publicKey();

    // Check if account exists on-chain
    let account;
    try {
      account = await horizon.loadAccount(userPublic);
    } catch {
      // Account doesn't exist on-chain — nothing to merge
      return { merged: false, reason: "account_not_found" };
    }

    // Remove any trustlines first (required before merge)
    const nonNativeBalances = account.balances.filter(
      (b) => b.asset_type !== "native"
    );

    if (nonNativeBalances.length > 0) {
      const removeTrustTx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      for (const bal of nonNativeBalances) {
        // If balance > 0, send it back to issuer or skip
        if (parseFloat(bal.balance) > 0) {
          // Can't remove trustline with balance — skip merge
          return { merged: false, reason: "has_token_balance" };
        }
        removeTrustTx.addOperation(
          Operation.changeTrust({
            asset: new (await import("@stellar/stellar-sdk")).Asset(
              bal.asset_code,
              bal.asset_issuer
            ),
            limit: "0",
          })
        );
      }

      const builtRemove = removeTrustTx.setTimeout(30).build();
      builtRemove.sign(userKeypair);
      await horizon.submitTransaction(builtRemove);

      // Reload account after trustline removal
      account = await horizon.loadAccount(userPublic);
    }

    // Merge account into operator
    const mergeTx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.accountMerge({ destination: operatorPublic })
      )
      .setTimeout(30)
      .build();

    mergeTx.sign(userKeypair);
    await horizon.submitTransaction(mergeTx);

    return { merged: true, recovered: account.balances.find((b) => b.asset_type === "native")?.balance ?? "0" };
  } catch (err) {
    return { merged: false, reason: err.message?.slice(0, 120) };
  }
}

/**
 * POST /api/admin/cleanup-inactive
 *
 * Body (optional):
 *   { "dry_run": true }   — preview only, don't delete
 *   { "days": 14 }        — override inactivity threshold
 */
router.post(
  "/cleanup-inactive",
  requirePlatformRole("PLATFORM_OWNER"),
  async (req, res) => {
  try {
    const operatorSecret = (
      process.env.OPERATOR_SECRET ||
      process.env.STELLAR_SECRET ||
      ""
    ).trim();

    if (!operatorSecret) {
      return res.status(500).json({
        success: false,
        error: "OPERATOR_SECRET not configured",
      });
    }

    const operatorPublic = Keypair.fromSecret(operatorSecret).publicKey();
    const dryRun = req.body?.dry_run === true;
    const days = Number(req.body?.days) || INACTIVITY_DAYS;

    // 1. Find users created more than N days ago
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffISO = cutoff.toISOString();

    const { data: candidates, error: fetchErr } = await supabase
      .from("users")
      .select("id, email, full_name, stellar_public_key, stellar_secret_encrypted, created_at")
      .lt("created_at", cutoffISO);

    if (fetchErr) {
      return res.status(500).json({ success: false, error: fetchErr.message });
    }

    if (!candidates || candidates.length === 0) {
      return res.json({
        success: true,
        message: "No candidates found",
        deleted: 0,
        checked: 0,
      });
    }

    // 2. For each candidate, check if they have any settlements
    const results = [];

    for (const user of candidates) {
      // Skip operator and protected accounts
      if (
        user.stellar_public_key === operatorPublic ||
        PROTECTED_ACCOUNTS.has(user.stellar_public_key)
      ) {
        results.push({
          email: user.email,
          action: "kept",
          reason: "protected account",
        });
        continue;
      }

      // Check settlements as buyer (user id)
      const { count: buyerCount } = await supabase
        .from("settlements")
        .select("id", { count: "exact", head: true })
        .eq("buyer", user.id);

      // Check settlements as seller (stellar public key)
      const { count: sellerCount } = await supabase
        .from("settlements")
        .select("id", { count: "exact", head: true })
        .eq("seller", user.stellar_public_key);

      const totalSettlements = (buyerCount ?? 0) + (sellerCount ?? 0);

      if (totalSettlements > 0) {
        results.push({
          email: user.email,
          action: "kept",
          reason: `${totalSettlements} settlement(s) found`,
        });
        continue;
      }

      // Check on-chain balance
      let hasFunds = false;
      try {
        const acct = await horizon.loadAccount(user.stellar_public_key);
        const xlm = acct.balances.find((b) => b.asset_type === "native");
        hasFunds = xlm && parseFloat(xlm.balance) > 1.0; // more than base reserve
      } catch {
        // Account not found on-chain
      }

      if (hasFunds) {
        results.push({
          email: user.email,
          action: "kept",
          reason: "account has XLM balance on-chain",
        });
        continue;
      }

      // This account qualifies for deletion
      if (dryRun) {
        results.push({
          email: user.email,
          action: "would_delete",
          reason: `inactive ${days}+ days, no settlements, no funds`,
        });
        continue;
      }

      // 3. Attempt Stellar account merge if it exists on-chain
      let mergeResult = { merged: false, reason: "no_secret" };
      if (user.stellar_secret_encrypted) {
        mergeResult = await mergeAccountIntoOperator(
          user.stellar_secret_encrypted,
          operatorPublic
        );
      }

      // 4. Delete user from Supabase
      const { error: delErr } = await supabase
        .from("users")
        .delete()
        .eq("id", user.id);

      if (delErr) {
        results.push({
          email: user.email,
          action: "error",
          reason: `delete failed: ${delErr.message}`,
        });
        continue;
      }

      results.push({
        email: user.email,
        action: "deleted",
        stellar_merge: mergeResult,
        reason: `inactive ${days}+ days, no settlements, no funds`,
      });
    }

    const deleted = results.filter((r) => r.action === "deleted").length;
    const kept = results.filter((r) => r.action === "kept").length;

    if (!dryRun && deleted > 0) {
      await logAudit({
        actorId: req.adminUser.id,
        action: "DELETE_INACTIVE_ACCOUNT",
        details: {
          deleted,
          kept,
          checked: candidates.length,
          days_threshold: days,
          emails: results.filter((r) => r.action === "deleted").map((r) => r.email),
        },
        ip: req.ip,
      });
    }

    return res.json({
      success: true,
      dry_run: dryRun,
      days_threshold: days,
      checked: candidates.length,
      deleted,
      kept,
      results,
    });
  } catch (err) {
    console.error("[admin/cleanup-inactive]", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM USER MANAGEMENT
// All endpoints below require a valid JWT + appropriate platform_role.
// They never expose: password, stellar_secret_encrypted.
// ─────────────────────────────────────────────────────────────────────────────

// Safe user fields — never expose password or secret key
const USER_SELECT =
  "id, email, full_name, organization, country, state, city, phone, roles, pending_roles, " +
  "platform_role, account_status, blocked_at, blocked_reason, " +
  "wallet_mode, wallet_status, wallet_network, stellar_public_key, " +
  "email_verified, phone_verified, funded, created_at, updated_at";

// Audit helper (logAudit) is imported from ../lib/adminAudit.js. Besides writing
// the immutable admin_audit_log entry, it notifies every PLATFORM_OWNER ("Deus")
// of actions performed by any other administrator.

/**
 * Recovery permission model — who may reset (recover) whose password.
 *   • common USER                        → only PLATFORM_OWNER
 *   • PLATFORM_ADMIN / ACCOUNT_RECOVERY  → PLATFORM_OWNER or any PLATFORM_ADMIN (admin↔admin)
 *   • PLATFORM_OWNER                     → only an account explicitly linked to it in
 *                                          account_recovery_links (the designated owner-
 *                                          recovery agent — seeded as roberto in migration 011)
 * Never allowed on one's own account.
 * actor = req.adminUser { id, platformRole }; target = { id, platform_role }.
 */
async function canRecover(actor, target) {
  if (actor.id === target.id) {
    return { ok: false, error: "Use the standard password change for your own account." };
  }
  const targetRole = target.platform_role ?? "USER";

  if (targetRole === "PLATFORM_OWNER") {
    const { data } = await supabase
      .from("account_recovery_links")
      .select("id")
      .eq("account_id", target.id)
      .eq("recovery_account_id", actor.id)
      .maybeSingle();
    return data
      ? { ok: true }
      : { ok: false, error: "Only the designated recovery account can recover a PLATFORM_OWNER." };
  }

  if (targetRole === "PLATFORM_ADMIN" || targetRole === "ACCOUNT_RECOVERY") {
    return (actor.platformRole === "PLATFORM_OWNER" || actor.platformRole === "PLATFORM_ADMIN")
      ? { ok: true }
      : { ok: false, error: "Insufficient permission to recover this account." };
  }

  // common USER
  return actor.platformRole === "PLATFORM_OWNER"
    ? { ok: true }
    : { ok: false, error: "Only a PLATFORM_OWNER can recover common users." };
}

// ─── GET /api/admin/users ────────────────────────────────────────────────────
router.get(
  "/users",
  requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN", "ACCOUNT_RECOVERY"),
  async (req, res) => {
    try {
      const { search = "", page = "1", limit = "50", platform_role: roleFilter, verified } = req.query;
      const pageNum  = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const offset   = (pageNum - 1) * limitNum;

      let query = supabase
        .from("users")
        .select(USER_SELECT, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (search) {
        query = query.or(
          `email.ilike.%${search}%,full_name.ilike.%${search}%,organization.ilike.%${search}%`
        );
      }
      if (roleFilter) {
        query = query.eq("platform_role", roleFilter);
      }
      // Verification filter: "full" = email AND phone verified (visible to other
      // participants); "incomplete" = missing email or phone (hidden from
      // counterparty/grid listings until an admin approves verification).
      if (verified === "full") {
        query = query.eq("email_verified", true).eq("phone_verified", true);
      } else if (verified === "incomplete") {
        query = query.or("email_verified.eq.false,phone_verified.eq.false");
      }

      const { data, count, error } = await query;
      if (error) throw error;

      res.json({ success: true, users: data ?? [], total: count ?? 0, page: pageNum, limit: limitNum });
    } catch (err) {
      console.error("[admin/users GET]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── GET /api/admin/users/:id ────────────────────────────────────────────────
router.get(
  "/users/:id",
  requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN", "ACCOUNT_RECOVERY"),
  async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select(USER_SELECT)
        .eq("id", req.params.id)
        .single();

      if (error || !data) return res.status(404).json({ success: false, error: "User not found." });

      res.json({ success: true, user: data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── PATCH /api/admin/users/:id ──────────────────────────────────────────────
// Allowed profile fields: full_name, organization, phone, country, state, city
// Allowed wallet field:   stellar_public_key — only for USER_CONTROLLED accounts
//                         that currently have no public key (null). Validated on Horizon.
// NOT allowed: email, password, roles, platform_role, stellar_secret_encrypted
router.patch(
  "/users/:id",
  requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN"),
  async (req, res) => {
    try {
      const ALLOWED = ["full_name", "organization", "phone", "country", "state", "city"];
      const update  = {};

      for (const key of ALLOWED) {
        if (req.body[key] !== undefined) update[key] = req.body[key];
      }

      // Special case: link a Stellar public key for USER_CONTROLLED accounts that have none.
      if (req.body.stellar_public_key !== undefined) {
        const newKey = String(req.body.stellar_public_key).trim();

        // Validate format
        const { StrKey } = await import("@stellar/stellar-sdk");
        if (!StrKey.isValidEd25519PublicKey(newKey)) {
          return res.status(400).json({ success: false, error: "Invalid Stellar public key (must start with G, 56 chars)." });
        }

        // Fetch current wallet state
        const { data: target } = await supabase
          .from("users")
          .select("wallet_mode, stellar_public_key")
          .eq("id", req.params.id)
          .single();

        if (!target) return res.status(404).json({ success: false, error: "User not found." });
        if (target.wallet_mode === "PLATFORM_MANAGED") {
          return res.status(400).json({ success: false, error: "Cannot change stellar_public_key on a PLATFORM_MANAGED wallet. Only USER_CONTROLLED accounts can link a new address." });
        }
        if (target.stellar_public_key) {
          return res.status(400).json({ success: false, error: "This account already has a linked wallet. Contact the account holder to change it." });
        }

        // Check it's not already used by another account
        const { data: conflict } = await supabase
          .from("users")
          .select("id, email")
          .eq("stellar_public_key", newKey)
          .neq("id", req.params.id)
          .single();
        if (conflict) {
          return res.status(409).json({ success: false, error: `This public key is already linked to another account (${conflict.email}).` });
        }

        update.stellar_public_key = newKey;
        update.wallet_status = "ACTIVE";
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ success: false, error: "No updatable fields provided." });
      }

      // Fetch before-snapshot for audit
      const { data: before } = await supabase
        .from("users")
        .select([...ALLOWED, "stellar_public_key"].join(", "))
        .eq("id", req.params.id)
        .single();

      const { data, error } = await supabase
        .from("users")
        .update(update)
        .eq("id", req.params.id)
        .select(USER_SELECT)
        .single();

      if (error) throw error;

      await logAudit({
        actorId:  req.adminUser.id,
        targetId: req.params.id,
        action:   "UPDATE_PROFILE",
        details:  { before, after: update },
        ip:       req.ip,
      });

      res.json({ success: true, user: data });
    } catch (err) {
      console.error("[admin/users PATCH]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/admin/users/:id/set-password ──────────────────────────────────
// RECOVER a user's password. Gate allows OWNER + ADMIN; canRecover() enforces the
// recovery matrix per target (admins recover admins; OWNER recovers common+admin;
// only the designated link recovers an OWNER). Email/role changes stay OWNER-only.
router.post(
  "/users/:id/set-password",
  requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN"),
  async (req, res) => {
    try {
      const { new_password } = req.body;

      if (!new_password || new_password.length < 8) {
        return res.status(400).json({ success: false, error: "Password must be at least 8 characters." });
      }

      const { data: target } = await supabase
        .from("users")
        .select("id, email, platform_role")
        .eq("id", req.params.id)
        .single();
      if (!target) return res.status(404).json({ success: false, error: "User not found." });

      const perm = await canRecover(req.adminUser, target);
      if (!perm.ok) return res.status(403).json({ success: false, error: perm.error });

      const hashed = await bcrypt.hash(new_password, 10);

      const { error } = await supabase
        .from("users")
        .update({ password: hashed })
        .eq("id", req.params.id);

      if (error) throw error;

      await logAudit({
        actorId:  req.adminUser.id,
        targetId: req.params.id,
        action:   "RECOVER_PASSWORD",
        details:  { reason: req.body.reason ?? "Admin recovery", target_role: target.platform_role ?? "USER" },
        ip:       req.ip,
      });

      res.json({ success: true, message: "Password updated." });
    } catch (err) {
      console.error("[admin/set-password]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/admin/users/:id/block ─────────────────────────────────────────
// OWNER + ADMIN — block an account (blocked accounts cannot log in).
// PLATFORM_OWNER accounts and your own account are protected.
router.post(
  "/users/:id/block",
  requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN"),
  async (req, res) => {
    try {
      if (req.params.id === req.adminUser.id) {
        return res.status(400).json({ success: false, error: "You cannot block your own account." });
      }
      const { data: target } = await supabase
        .from("users").select("id, platform_role").eq("id", req.params.id).single();
      if (!target) return res.status(404).json({ success: false, error: "User not found." });
      if (target.platform_role === "PLATFORM_OWNER") {
        return res.status(403).json({ success: false, error: "PLATFORM_OWNER accounts cannot be blocked." });
      }

      const { error } = await supabase
        .from("users")
        .update({ account_status: "BLOCKED", blocked_at: new Date().toISOString(), blocked_reason: req.body.reason ?? null })
        .eq("id", req.params.id);
      if (error) throw error;

      await logAudit({
        actorId: req.adminUser.id, targetId: req.params.id,
        action: "BLOCK_USER", details: { reason: req.body.reason ?? null }, ip: req.ip,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("[admin/block]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/admin/users/:id/unblock ───────────────────────────────────────
router.post(
  "/users/:id/unblock",
  requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN"),
  async (req, res) => {
    try {
      const { error } = await supabase
        .from("users")
        .update({ account_status: "ACTIVE", blocked_at: null, blocked_reason: null })
        .eq("id", req.params.id);
      if (error) throw error;

      await logAudit({
        actorId: req.adminUser.id, targetId: req.params.id,
        action: "UNBLOCK_USER", details: {}, ip: req.ip,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("[admin/unblock]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/admin/users/:id/set-email ─────────────────────────────────────
// PLATFORM_OWNER only — change a user's email (resets email verification).
router.post(
  "/users/:id/set-email",
  requirePlatformRole("PLATFORM_OWNER"),
  async (req, res) => {
    try {
      const email = String(req.body.email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ success: false, error: "Invalid email address." });
      }
      if (req.params.id === req.adminUser.id) {
        return res.status(400).json({ success: false, error: "Use your own account settings to change your email." });
      }

      const { data: conflict } = await supabase
        .from("users").select("id").eq("email", email).neq("id", req.params.id).maybeSingle();
      if (conflict) return res.status(409).json({ success: false, error: "That email is already in use." });

      const { data: before } = await supabase
        .from("users").select("email").eq("id", req.params.id).single();
      if (!before) return res.status(404).json({ success: false, error: "User not found." });

      const { error } = await supabase
        .from("users")
        .update({ email, email_verified: false, email_verification_token: null })
        .eq("id", req.params.id);
      if (error) throw error;

      await logAudit({
        actorId: req.adminUser.id, targetId: req.params.id,
        action: "SET_EMAIL", details: { before: before.email, after: email }, ip: req.ip,
      });
      res.json({ success: true, email });
    } catch (err) {
      console.error("[admin/set-email]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/admin/users/:id/verify ────────────────────────────────────────
// OWNER or ADMIN — manually approve a user's email and/or phone verification so
// they become visible to other participants without waiting on the email/OTP
// flow. Body: { email?: boolean, phone?: boolean }.
router.post(
  "/users/:id/verify",
  requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN"),
  async (req, res) => {
    try {
      const verifyEmail = req.body.email === true;
      const verifyPhone = req.body.phone === true;
      if (!verifyEmail && !verifyPhone) {
        return res
          .status(400)
          .json({ success: false, error: "Specify email and/or phone to verify." });
      }
      const patch = {};
      if (verifyEmail) {
        patch.email_verified = true;
        patch.email_verification_token = null;
      }
      if (verifyPhone) patch.phone_verified = true;

      const { data, error } = await supabase
        .from("users")
        .update(patch)
        .eq("id", req.params.id)
        .select("id, email, email_verified, phone_verified")
        .single();
      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: "User not found." });

      await logAudit({
        actorId: req.adminUser.id,
        targetId: req.params.id,
        action: "MANUAL_VERIFY",
        details: { email: verifyEmail, phone: verifyPhone },
        ip: req.ip,
      });
      res.json({
        success: true,
        email_verified: data.email_verified,
        phone_verified: data.phone_verified,
      });
    } catch (err) {
      console.error("[admin/verify]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

// ─── POST /api/admin/users/:id/set-platform-role ─────────────────────────────
// PLATFORM_OWNER only — promote or demote a user's platform role.
// Elevated platform roles are restricted to specific accounts (allowlist by email).
// Enforced here server-side; the UI also hides ineligible options.
const OWNER_ELIGIBLE_EMAILS = ["energypayepwr@gmail.com", "roberto.blockchainresources@gmail.com"];
const ADMIN_ELIGIBLE_EMAILS = [...OWNER_ELIGIBLE_EMAILS];
const VALID_PLATFORM_ROLES = ["PLATFORM_OWNER", "PLATFORM_ADMIN", "ACCOUNT_RECOVERY", "USER"];

router.post(
  "/users/:id/set-platform-role",
  requirePlatformRole("PLATFORM_OWNER"),
  async (req, res) => {
    try {
      const { platform_role } = req.body;

      if (!VALID_PLATFORM_ROLES.includes(platform_role)) {
        return res.status(400).json({
          success: false,
          error: `Invalid platform_role. Must be one of: ${VALID_PLATFORM_ROLES.join(", ")}`,
        });
      }

      // Allowlist: OWNER only for the 2 owner emails; ADMIN/RECOVERY only for the
      // 4 admin emails. Demotion to USER is always allowed.
      if (platform_role !== "USER") {
        const { data: targetRow } = await supabase
          .from("users").select("email").eq("id", req.params.id).single();
        const targetEmail = (targetRow?.email || "").trim().toLowerCase();
        const eligible = platform_role === "PLATFORM_OWNER" ? OWNER_ELIGIBLE_EMAILS : ADMIN_ELIGIBLE_EMAILS;
        if (!eligible.includes(targetEmail)) {
          return res.status(403).json({
            success: false,
            error: `${platform_role} can only be assigned to an authorized account.`,
            code: "ROLE_NOT_ELIGIBLE",
          });
        }
      }

      // Guard: never demote the last PLATFORM_OWNER
      if (platform_role !== "PLATFORM_OWNER") {
        const { count } = await supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("platform_role", "PLATFORM_OWNER");

        const targetIsSelf = req.params.id === req.adminUser.id;
        if (count === 1 && targetIsSelf) {
          return res.status(400).json({
            success: false,
            error: "Cannot demote the last PLATFORM_OWNER. Promote another account first.",
          });
        }
      }

      const { data: before } = await supabase
        .from("users")
        .select("platform_role")
        .eq("id", req.params.id)
        .single();

      const { error } = await supabase
        .from("users")
        .update({ platform_role })
        .eq("id", req.params.id);

      if (error) throw error;

      await logAudit({
        actorId:  req.adminUser.id,
        targetId: req.params.id,
        action:   "SET_PLATFORM_ROLE",
        details:  { before: before?.platform_role, after: platform_role },
        ip:       req.ip,
      });

      res.json({ success: true, platform_role });
    } catch (err) {
      console.error("[admin/set-platform-role]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/admin/users/:id/set-roles ─────────────────────────────────────
// OWNER or ADMIN — set a user's market-participant roles. Manages the 5 market
// roles below; preserves any existing ADMIN ("Platform Operator") /
// REGULATORY_AUTHORITY so this editor never silently strips those tags.
const ASSIGNABLE_MARKET_ROLES = ["GENERATOR", "SELLER", "INVESTOR", "USER", "UTILITY"];
const PRESERVED_MARKET_ROLES  = ["ADMIN", "REGULATORY_AUTHORITY"];

router.post(
  "/users/:id/set-roles",
  requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN"),
  async (req, res) => {
    try {
      const incoming = Array.isArray(req.body?.roles) ? req.body.roles : null;
      if (!incoming) {
        return res.status(400).json({ success: false, error: "roles must be an array." });
      }
      const requested = [...new Set(incoming.map((r) => String(r).toUpperCase()))];
      const invalid = requested.filter((r) => !ASSIGNABLE_MARKET_ROLES.includes(r));
      if (invalid.length) {
        return res.status(400).json({
          success: false,
          error: `Invalid market role(s): ${invalid.join(", ")}. Allowed: ${ASSIGNABLE_MARKET_ROLES.join(", ")}`,
        });
      }

      const { data: current } = await supabase
        .from("users").select("roles").eq("id", req.params.id).single();
      const preserved = (current?.roles || []).filter((r) => PRESERVED_MARKET_ROLES.includes(r));
      const nextRoles = [...new Set([...requested, ...preserved])];

      const { error } = await supabase
        .from("users").update({ roles: nextRoles }).eq("id", req.params.id);
      if (error) throw error;

      await logAudit({
        actorId:  req.adminUser.id,
        targetId: req.params.id,
        action:   "SET_MARKET_ROLES",
        details:  { before: current?.roles ?? [], after: nextRoles },
        ip:       req.ip,
      });

      res.json({ success: true, roles: nextRoles });
    } catch (err) {
      console.error("[admin/set-roles]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/admin/users/:id/approve-roles ─────────────────────────────────
// OWNER or ADMIN — approve (move pending → active) or reject privileged role
// requests (GENERATOR / SELLER / UTILITY) sitting in the user's pending_roles.
const PRIVILEGED_MARKET_ROLES = ["GENERATOR", "SELLER", "UTILITY"];

router.post(
  "/users/:id/approve-roles",
  requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN"),
  async (req, res) => {
    try {
      const incoming = Array.isArray(req.body?.roles) ? req.body.roles : null;
      const approve = req.body?.approve !== false; // default true; false = reject
      if (!incoming || !incoming.length) {
        return res.status(400).json({ success: false, error: "roles must be a non-empty array." });
      }
      const requested = [...new Set(incoming.map((r) => String(r).toUpperCase()))]
        .filter((r) => PRIVILEGED_MARKET_ROLES.includes(r));
      if (!requested.length) {
        return res.status(400).json({
          success: false,
          error: `Only ${PRIVILEGED_MARKET_ROLES.join(" / ")} require approval.`,
        });
      }

      const { data: current } = await supabase
        .from("users").select("roles, pending_roles").eq("id", req.params.id).single();
      const curRoles   = current?.roles || [];
      const curPending = current?.pending_roles || [];

      // Only act on roles actually pending for this user.
      const acting = requested.filter((r) => curPending.includes(r));
      if (!acting.length) {
        return res.status(400).json({ success: false, error: "No matching pending roles for this user." });
      }
      const nextPending = curPending.filter((r) => !acting.includes(r));
      const nextRoles = approve ? [...new Set([...curRoles, ...acting])] : curRoles;

      const { error } = await supabase
        .from("users")
        .update({ roles: nextRoles, pending_roles: nextPending })
        .eq("id", req.params.id);
      if (error) throw error;

      await logAudit({
        actorId:  req.adminUser.id,
        targetId: req.params.id,
        action:   approve ? "APPROVE_ROLES" : "REJECT_ROLES",
        details:  { roles: acting, after_roles: nextRoles, after_pending: nextPending },
        ip:       req.ip,
      });

      res.json({ success: true, roles: nextRoles, pending_roles: nextPending });
    } catch (err) {
      console.error("[admin/approve-roles]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── GET /api/admin/audit-log ────────────────────────────────────────────────
router.get(
  "/audit-log",
  requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN"),
  async (req, res) => {
    try {
      const { page = "1", limit = "50", action: actionFilter, target_id } = req.query;
      const pageNum  = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
      const offset   = (pageNum - 1) * limitNum;

      let query = supabase
        .from("admin_audit_log")
        .select(
          "id, action, details, ip_address, created_at, " +
          "actor:actor_id(id, email, full_name), " +
          "target:target_id(id, email, full_name)",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (actionFilter) query = query.eq("action", actionFilter);
      if (target_id)    query = query.eq("target_id", target_id);

      const { data, count, error } = await query;
      if (error) throw error;

      res.json({ success: true, entries: data ?? [], total: count ?? 0, page: pageNum, limit: limitNum });
    } catch (err) {
      console.error("[admin/audit-log]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── GET /api/admin/recovery-links ───────────────────────────────────────────
router.get(
  "/recovery-links",
  requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN"),
  async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("account_recovery_links")
        .select(
          "id, created_at, " +
          "account:account_id(id, email, full_name, platform_role), " +
          "recovery:recovery_account_id(id, email, full_name, platform_role)"
        )
        .order("created_at", { ascending: true });

      if (error) throw error;

      res.json({ success: true, links: data ?? [] });
    } catch (err) {
      console.error("[admin/recovery-links GET]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/admin/recovery-links ──────────────────────────────────────────
router.post(
  "/recovery-links",
  requirePlatformRole("PLATFORM_OWNER"),
  async (req, res) => {
    try {
      const { account_id, recovery_account_id } = req.body;

      if (!account_id || !recovery_account_id) {
        return res.status(400).json({ success: false, error: "account_id and recovery_account_id required." });
      }

      if (account_id === recovery_account_id) {
        return res.status(400).json({ success: false, error: "An account cannot recover itself." });
      }

      const { error } = await supabase
        .from("account_recovery_links")
        .insert([{ account_id, recovery_account_id, created_by: req.adminUser.id }]);

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ success: false, error: "Recovery link already exists." });
        }
        throw error;
      }

      await logAudit({
        actorId:  req.adminUser.id,
        targetId: account_id,
        action:   "ADD_RECOVERY_LINK",
        details:  { account_id, recovery_account_id },
        ip:       req.ip,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("[admin/recovery-links POST]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── DELETE /api/admin/recovery-links/:id ────────────────────────────────────
router.delete(
  "/recovery-links/:id",
  requirePlatformRole("PLATFORM_OWNER"),
  async (req, res) => {
    try {
      const { data: link } = await supabase
        .from("account_recovery_links")
        .select("id, account_id, recovery_account_id")
        .eq("id", req.params.id)
        .single();

      if (!link) return res.status(404).json({ success: false, error: "Link not found." });

      const { error } = await supabase
        .from("account_recovery_links")
        .delete()
        .eq("id", req.params.id);

      if (error) throw error;

      await logAudit({
        actorId:  req.adminUser.id,
        targetId: link.account_id,
        action:   "REMOVE_RECOVERY_LINK",
        details:  { link_id: req.params.id, recovery_account_id: link.recovery_account_id },
        ip:       req.ip,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("[admin/recovery-links DELETE]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── GET /api/admin/activity ─────────────────────────────────────────────────
// Owner-only feed of actions performed by OTHER admins (everyone except the
// requesting owner). Backs the "Activity Feed" tab seen only by the PLATFORM_OWNER.
router.get(
  "/activity",
  requirePlatformRole("PLATFORM_OWNER"),
  async (req, res) => {
    try {
      const { page = "1", limit = "50" } = req.query;
      const pageNum  = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
      const offset   = (pageNum - 1) * limitNum;

      const { data, count, error } = await supabase
        .from("admin_audit_log")
        .select(
          "id, action, details, ip_address, created_at, " +
          "actor:actor_id(id, email, full_name, platform_role), " +
          "target:target_id(id, email, full_name)",
          { count: "exact" }
        )
        .neq("actor_id", req.adminUser.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) throw error;

      res.json({ success: true, entries: data ?? [], total: count ?? 0, page: pageNum, limit: limitNum });
    } catch (err) {
      console.error("[admin/activity]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
