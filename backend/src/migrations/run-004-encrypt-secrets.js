/**
 * Migration 004 companion script — re-encrypt plaintext Stellar secrets.
 *
 * Reads all PLATFORM_MANAGED users whose stellar_secret_encrypted is still
 * a raw Stellar secret seed (starts with 'S', 56 chars), encrypts it with
 * AES via encryptSecret(), and updates the row.
 *
 * Run once after applying 004_wallet_modes.sql:
 *   node backend/src/migrations/run-004-encrypt-secrets.js
 *
 * Security: logs only user IDs — never logs the key itself.
 */

import "dotenv/config";
import { Keypair } from "@stellar/stellar-sdk";
import { createClient } from "@supabase/supabase-js";
import { encryptSecret } from "../lib/crypto.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function run() {
  console.log("[004] Starting secret re-encryption migration…");

  const { data: users, error } = await supabase
    .from("users")
    .select("id, stellar_secret_encrypted")
    .eq("wallet_mode", "PLATFORM_MANAGED")
    .not("stellar_secret_encrypted", "is", null);

  if (error) {
    console.error("[004] Failed to fetch users:", error.message);
    process.exit(1);
  }

  console.log(`[004] Found ${users.length} PLATFORM_MANAGED users to inspect.`);

  let encrypted = 0;
  let alreadyEncrypted = 0;
  let failed = 0;

  for (const user of users) {
    const raw = user.stellar_secret_encrypted;

    // Detect plaintext: a raw Stellar secret is exactly 56 chars starting with 'S'
    const isPlaintext = typeof raw === "string" && raw.startsWith("S") && raw.length === 56;

    if (!isPlaintext) {
      alreadyEncrypted++;
      continue;
    }

    // Verify it's a valid secret before encrypting
    try {
      Keypair.fromSecret(raw); // throws if invalid
    } catch {
      console.warn(`[004] User ${user.id} has invalid secret format — skipping.`);
      failed++;
      continue;
    }

    const ciphertext = encryptSecret(raw);

    const { error: updateError } = await supabase
      .from("users")
      .update({ stellar_secret_encrypted: ciphertext })
      .eq("id", user.id);

    if (updateError) {
      console.error(`[004] Failed to update user ${user.id}:`, updateError.message);
      failed++;
    } else {
      console.log(`[004] Re-encrypted secret for user ${user.id}.`);
      encrypted++;
    }
  }

  console.log(
    `[004] Done. Encrypted: ${encrypted} · Already encrypted: ${alreadyEncrypted} · Failed: ${failed}`,
  );
}

run().catch((err) => {
  console.error("[004] Unhandled error:", err.message);
  process.exit(1);
});
