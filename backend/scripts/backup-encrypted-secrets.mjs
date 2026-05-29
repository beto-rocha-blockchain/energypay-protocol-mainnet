/**
 * One-off READ-ONLY backup — export the encrypted wallet secrets to a local CSV
 * before rotating MASTER_ENCRYPTION_KEY (run-005).
 *
 * Writes the CSV OUTSIDE the repo so it can never be committed. The file holds
 * CIPHERTEXT (encrypted with the current key) — keep it local + secure and delete
 * it once the rotation is verified.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from backend/.env (explicit path,
 * so it works from any cwd). Logs ONLY counts/paths — never secret values.
 *
 * Usage:  node backend/scripts/backup-encrypted-secrets.mjs
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in backend/.env.");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("users")
    .select("id, email, stellar_secret_encrypted")
    .not("stellar_secret_encrypted", "is", null);

  if (error) {
    console.error("Read failed:", error.message);
    process.exitCode = 1;
    return;
  }

  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = data.map((r) => `${esc(r.id)},${esc(r.email)},${esc(r.stellar_secret_encrypted)}`);
  const csv = ["id,email,stellar_secret_encrypted", ...rows].join("\r\n");

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const out = resolve(__dirname, "../../..", `energypay-secrets-backup-${ts}.csv`);
  writeFileSync(out, csv, "utf8");

  console.log(`Backed up ${data.length} encrypted secret(s) to:`);
  console.log(`  ${out}`);
  console.log("Keep this file LOCAL + SECURE (it is ciphertext) and delete it after the rotation is verified.");
}

main().catch((e) => {
  console.error(e?.message || String(e));
  process.exitCode = 1;
});
