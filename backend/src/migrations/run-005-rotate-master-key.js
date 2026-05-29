/**
 * Migration 005 — rotate MASTER_ENCRYPTION_KEY (re-encrypt stored wallet secrets).
 *
 * The MASTER_ENCRYPTION_KEY was exposed in git history and is being rotated.
 * Every PLATFORM_MANAGED wallet secret in `users.stellar_secret_encrypted` is
 * encrypted with the OLD key. This script decrypts each with the OLD key and
 * re-encrypts it with the NEW key, in place — so the backend can switch to the
 * NEW key without losing access to any managed wallet.
 *
 * Uses the SAME scheme as backend/src/lib/crypto.js (CryptoJS AES, passphrase mode).
 *
 * SECURITY:
 *   · Run LOCALLY only. NEVER logs keys or secret values — only user IDs/counts.
 *   · DRY-RUN by default (no writes). Pass --apply to actually write.
 *   · Idempotent: records already on the NEW key are detected and skipped, so it
 *     is safe to re-run (e.g. after a partial failure).
 *
 * Required env (put in backend/.env — which is gitignored):
 *   MASTER_ENCRYPTION_KEY_OLD   — the current (leaked) key
 *   MASTER_ENCRYPTION_KEY_NEW   — the newly generated key
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   — the NEW (sb_secret_) service key
 *
 * Usage (from the backend/ folder):
 *   node src/migrations/run-005-rotate-master-key.js           # DRY-RUN (verify only)
 *   node src/migrations/run-005-rotate-master-key.js --apply   # re-encrypt for real
 *
 * Recommended: snapshot/backup the users table in Supabase before --apply.
 *
 * After a successful --apply (failed: 0), set MASTER_ENCRYPTION_KEY = <NEW> in the
 * backend env (Vercel) and redeploy — do it right after, so the brief window where
 * the DB is on the NEW key but the backend still has the OLD key stays minimal.
 */

import "dotenv/config";
import CryptoJS from "crypto-js";
import { StrKey } from "@stellar/stellar-sdk";
import { createClient } from "@supabase/supabase-js";

const OLD = (process.env.MASTER_ENCRYPTION_KEY_OLD || "").trim();
const NEW = (process.env.MASTER_ENCRYPTION_KEY_NEW || "").trim();
const APPLY = process.argv.includes("--apply");

function die(msg) {
  console.error(`\n[005] ${msg}\n`);
  process.exitCode = 1;
}

// Mirror of backend/src/lib/crypto.js (passphrase-mode AES).
const encryptWith = (plain, key) => CryptoJS.AES.encrypt(plain, key).toString();
const decryptWith = (cipher, key) => {
  try {
    return CryptoJS.AES.decrypt(cipher, key).toString(CryptoJS.enc.Utf8);
  } catch {
    return ""; // wrong key → malformed UTF-8 → treat as failure
  }
};
const isSecret = (s) => {
  try {
    return typeof s === "string" && StrKey.isValidEd25519SecretSeed(s);
  } catch {
    return false;
  }
};

async function main() {
  if (!OLD || !NEW) return die("Set MASTER_ENCRYPTION_KEY_OLD and MASTER_ENCRYPTION_KEY_NEW in backend/.env.");
  if (OLD === NEW) return die("OLD and NEW keys are identical — nothing to rotate.");
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return die("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (use the NEW sb_secret_ key).");
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  console.log(`\n── MASTER_ENCRYPTION_KEY rotation ── ${APPLY ? "APPLY (writes)" : "DRY-RUN (no writes)"} ──\n`);

  const { data: rows, error } = await supabase
    .from("users")
    .select("id, stellar_secret_encrypted")
    .not("stellar_secret_encrypted", "is", null);
  if (error) return die(`Failed to read users: ${error.message}`);

  console.log(`Records with an encrypted secret: ${rows.length}\n`);

  let reencrypt = 0, alreadyNew = 0, plaintext = 0, failed = 0, written = 0;
  const problemIds = [];

  for (const r of rows) {
    const cur = r.stellar_secret_encrypted;

    // Case 0 — stored as a raw plaintext seed (pre-004 leftover): encrypt with NEW.
    if (isSecret(cur)) {
      plaintext++;
      if (APPLY) {
        const { error: e } = await supabase.from("users")
          .update({ stellar_secret_encrypted: encryptWith(cur, NEW) }).eq("id", r.id);
        if (e) { failed++; problemIds.push(r.id); } else written++;
      }
      continue;
    }

    // Case 1 — decrypts with OLD: re-encrypt with NEW.
    const withOld = decryptWith(cur, OLD);
    if (isSecret(withOld)) {
      reencrypt++;
      if (APPLY) {
        const next = encryptWith(withOld, NEW);
        if (!isSecret(decryptWith(next, NEW))) { failed++; problemIds.push(r.id); continue; } // round-trip guard
        const { error: e } = await supabase.from("users")
          .update({ stellar_secret_encrypted: next }).eq("id", r.id);
        if (e) { failed++; problemIds.push(r.id); } else written++;
      }
      continue;
    }

    // Case 2 — already on NEW key: skip (idempotent).
    if (isSecret(decryptWith(cur, NEW))) { alreadyNew++; continue; }

    // Case 3 — neither key decrypts it: corrupt/unknown. Report, never overwrite.
    failed++;
    problemIds.push(r.id);
  }

  console.log("Summary:");
  console.log(`  to re-encrypt (OLD -> NEW): ${reencrypt}`);
  console.log(`  already on NEW key        : ${alreadyNew}`);
  console.log(`  plaintext (-> NEW)        : ${plaintext}`);
  console.log(`  cannot decrypt (review)   : ${failed}`);
  if (APPLY) console.log(`  WRITTEN                   : ${written}`);
  if (problemIds.length) console.log(`  problem user IDs          : ${problemIds.join(", ")}`);

  if (!APPLY) {
    console.log("\nDRY-RUN only — nothing was written. If the numbers look right (cannot-decrypt = 0), re-run with --apply.\n");
  } else if (failed) {
    console.log(`\n[WARN] Finished with ${failed} problem record(s). Re-run --apply to retry, or review the IDs above. Do NOT switch the backend key until failed = 0.\n`);
  } else {
    console.log("\n[OK] All secrets re-encrypted with the NEW key. Now set MASTER_ENCRYPTION_KEY=<new value> in the backend env (Vercel) and redeploy immediately.\n");
  }
}

main().catch((e) => die(e?.message || String(e)));
