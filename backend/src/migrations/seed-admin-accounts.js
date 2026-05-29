/**
 * seed-admin-accounts.js
 *
 * Creates or promotes the 4 platform admin accounts:
 *
 *   energypayepwr@gmail.com      → PLATFORM_OWNER   (Roberto Master)
 *   roberto.blockchainresources  → ACCOUNT_RECOVERY (Roberto Backup — promotes existing)
 *   eduferreira053@gmail.com     → PLATFORM_ADMIN   (Eduardo Master)
 *   contato@edugera.com.br       → ACCOUNT_RECOVERY (Eduardo Backup)
 *
 * Then sets up the full 4-way cross-recovery mesh.
 *
 * Run from the repo root:
 *   node --env-file=backend/.env backend/src/migrations/seed-admin-accounts.js
 *
 * Or from backend/:
 *   node --env-file=.env src/migrations/seed-admin-accounts.js
 *
 * IMPORTANT: Run migration 006_platform_roles.sql in Supabase BEFORE this script.
 */

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Load .env from backend/ regardless of cwd
dotenv.config({ path: resolve(__dirname, "../../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateTempPassword() {
  // 20-char URL-safe random password
  return crypto.randomBytes(15).toString("base64url");
}

function maskPwd(pwd) {
  return pwd.slice(0, 4) + "•".repeat(pwd.length - 4);
}

async function upsertAdmin({ email, fullName, phone, platformRole, isNew }) {
  console.log(`\n📋 ${isNew ? "Creating" : "Promoting"}: ${email} → ${platformRole}`);

  if (!isNew) {
    // Just update the platform_role on the existing account
    const { error } = await supabase
      .from("users")
      .update({ platform_role: platformRole })
      .eq("email", email);

    if (error) {
      console.error(`   ❌ Failed to promote ${email}:`, error.message);
      return null;
    }
    console.log(`   ✅ Promoted to ${platformRole}`);
    return { email, action: "promoted", platformRole };
  }

  // Check if email already exists
  const { data: existing } = await supabase
    .from("users")
    .select("id, email, platform_role")
    .eq("email", email)
    .single();

  if (existing) {
    console.log(`   ℹ️  Account already exists — updating platform_role`);
    const { error } = await supabase
      .from("users")
      .update({ platform_role: platformRole })
      .eq("email", email);

    if (error) {
      console.error(`   ❌ Failed to update ${email}:`, error.message);
      return null;
    }
    console.log(`   ✅ Updated to ${platformRole}`);
    return { email, action: "updated", platformRole };
  }

  // Create new admin account (no Stellar wallet — admin accounts are off-chain only)
  const tempPassword = generateTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  const emailVerificationToken = crypto.randomBytes(32).toString("hex");

  const insert = {
    email,
    password: hashedPassword,
    full_name: fullName,
    phone,
    organization: "EnergyPay",
    country: "BR",
    city: "Brasil",
    roles: ["ADMIN"],                   // internal Admin role (hidden from public signup)
    platform_role: platformRole,
    stellar_public_key: null,           // admin accounts have no on-chain wallet
    stellar_secret_encrypted: null,
    wallet_mode: "USER_CONTROLLED",     // no secret managed by platform
    wallet_status: "ACTIVE",
    wallet_network: "PUBLIC",
    email_verified: true,               // pre-verified — created by seed
    phone_verified: false,
    email_verification_token: emailVerificationToken,
  };

  const { error: insertError } = await supabase.from("users").insert([insert]);

  if (insertError) {
    console.error(`   ❌ Failed to create ${email}:`, insertError.message);
    return null;
  }

  console.log(`   ✅ Created — temp password: ${tempPassword}`);
  console.log(`   ⚠️  Change this password on first login!`);
  return { email, action: "created", platformRole, tempPassword };
}

// ─── Recovery link helper ─────────────────────────────────────────────────────

async function ensureRecoveryLink(accountEmail, recoveryEmail, creatorId) {
  const { data: account }   = await supabase.from("users").select("id").eq("email", accountEmail).single();
  const { data: recovery }  = await supabase.from("users").select("id").eq("email", recoveryEmail).single();

  if (!account || !recovery) {
    console.warn(`   ⚠️  Skipping recovery link ${accountEmail} ← ${recoveryEmail}: user(s) not found`);
    return;
  }

  const { error } = await supabase
    .from("account_recovery_links")
    .upsert(
      { account_id: account.id, recovery_account_id: recovery.id, created_by: creatorId },
      { onConflict: "account_id,recovery_account_id" }
    );

  if (error) {
    console.warn(`   ⚠️  Recovery link ${accountEmail} ← ${recoveryEmail}:`, error.message);
  } else {
    console.log(`   🔗  ${accountEmail}  ←  ${recoveryEmail}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  EnergyPay — Admin Account Seed Script");
  console.log("═══════════════════════════════════════════════════════════");

  const results = [];

  // 1. Roberto Master (new account — energypayepwr@gmail.com)
  const r1 = await upsertAdmin({
    email:        "energypayepwr@gmail.com",
    fullName:     "Roberto da Rocha Pimentel Júnior",
    phone:        "+5524992769936",
    platformRole: "PLATFORM_OWNER",
    isNew:        true,
  });
  if (r1) results.push(r1);

  // 2. Roberto Backup (already exists — promote roberto.blockchainresources@gmail.com)
  const r2 = await upsertAdmin({
    email:        "roberto.blockchainresources@gmail.com",
    platformRole: "ACCOUNT_RECOVERY",
    isNew:        false,
  });
  if (r2) results.push(r2);

  // 3. Eduardo Master (new account — eduferreira053@gmail.com)
  const r3 = await upsertAdmin({
    email:        "eduferreira053@gmail.com",
    fullName:     "Eduardo Ferreira da Silva",
    phone:        "+5511960320519",
    platformRole: "PLATFORM_ADMIN",
    isNew:        true,
  });
  if (r3) results.push(r3);

  // 4. Eduardo Backup (new account — contato@edugera.com.br)
  const r4 = await upsertAdmin({
    email:        "contato@edugera.com.br",
    fullName:     "Eduardo Ferreira da Silva",
    phone:        "+5511960320519",
    platformRole: "ACCOUNT_RECOVERY",
    isNew:        true,
  });
  if (r4) results.push(r4);

  // ─── Recovery link mesh ────────────────────────────────────────────────────
  // Every account can be recovered by the other 3.
  // Matrix: Roberto Master ↔ Roberto Backup ↔ Eduardo Master ↔ Eduardo Backup
  console.log("\n🔗 Setting up recovery link mesh…");

  const EMAILS = [
    "energypayepwr@gmail.com",
    "roberto.blockchainresources@gmail.com",
    "eduferreira053@gmail.com",
    "contato@edugera.com.br",
  ];

  // Fetch PLATFORM_OWNER id to set as creator on all links
  const { data: owner } = await supabase
    .from("users")
    .select("id")
    .eq("email", "energypayepwr@gmail.com")
    .single();

  const creatorId = owner?.id ?? null;

  for (const accountEmail of EMAILS) {
    for (const recoveryEmail of EMAILS) {
      if (accountEmail !== recoveryEmail) {
        await ensureRecoveryLink(accountEmail, recoveryEmail, creatorId);
      }
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");

  const created = results.filter(r => r.action === "created");
  const promoted = results.filter(r => r.action !== "created");

  if (promoted.length) {
    console.log("\n✅ Promoted:");
    promoted.forEach(r => console.log(`   ${r.email} → ${r.platformRole}`));
  }

  if (created.length) {
    console.log("\n🆕 New accounts created — TEMP PASSWORDS (change immediately!):");
    created.forEach(r => {
      console.log(`   ${r.email}`);
      console.log(`     Role:     ${r.platformRole}`);
      console.log(`     Password: ${r.tempPassword}`);
      console.log();
    });
    console.log("   ⚠️  These passwords are shown once. Save them now.");
    console.log("   ⚠️  Use Platform Admin → Set Password to change after first login.");
  }

  console.log("\n✅ Done.");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
