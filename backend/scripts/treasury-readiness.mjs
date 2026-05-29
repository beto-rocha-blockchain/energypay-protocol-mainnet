/**
 * Treasury readiness check — READ-ONLY verification that the EnergyPay crypto
 * treasury is "fully open to receive funds" on Stellar Mainnet.
 *
 * Usage (from the backend/ folder):
 *   node scripts/treasury-readiness.mjs                 # checks ENERGY_PAY_TREASURY_PUBLIC_KEY from .env
 *   node scripts/treasury-readiness.mjs <PUBLIC_KEY>    # checks a specific account
 *
 * It NEVER signs, funds, or writes anything. It only reads Horizon and reports:
 *   · account exists on-ledger (a payment to a missing account fails)
 *   · XLM balance vs. minimum reserve (open to receive XLM)
 *   · USDC trustline present (open to receive USDC) — from USDC_ASSET_CODE / USDC_ISSUER
 *
 * Creating, funding and adding the USDC trustline to the treasury are on-chain
 * actions you perform from your OWN wallet (the secret key stays offline). This
 * script just tells you whether that account is ready to be set as the treasury.
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { StrKey } from "@stellar/stellar-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const HORIZON_URL = "https://horizon.stellar.org";
const USDC_CODE = (process.env.USDC_ASSET_CODE || "USDC").trim();
const USDC_ISSUER = (process.env.USDC_ISSUER || "").trim();

const treasury = (process.argv[2] || process.env.ENERGY_PAY_TREASURY_PUBLIC_KEY || "").trim();

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const info = (m) => console.log(`  \x1b[36mℹ\x1b[0m ${m}`);

function fail(msg) {
  console.error(`\n\x1b[31m${msg}\x1b[0m\n`);
  process.exitCode = 1;
}

async function main() {
  console.log("\n── EnergyPay treasury readiness · Stellar Mainnet · READ-ONLY ──\n");

  if (!treasury) {
    return fail(
      "No treasury key. Set ENERGY_PAY_TREASURY_PUBLIC_KEY in backend/.env or pass one:\n" +
        "  node scripts/treasury-readiness.mjs <PUBLIC_KEY>",
    );
  }
  if (!StrKey.isValidEd25519PublicKey(treasury)) {
    return fail(`Not a valid Stellar public key: ${treasury}`);
  }

  info(`Account  : ${treasury}`);
  info(`Explorer : https://stellar.expert/explorer/public/account/${treasury}`);
  console.log("");

  let resp;
  try {
    resp = await fetch(`${HORIZON_URL}/accounts/${treasury}`, { headers: { Accept: "application/json" } });
  } catch (e) {
    return fail(`Could not reach Horizon: ${e.message}`);
  }

  if (resp.status === 404) {
    bad("Account does NOT exist on-ledger — not funded yet.");
    console.log(
      "\n  To open it: fund this public key with ~3 XLM from any wallet/exchange.\n" +
        "  A payment to a non-existent account fails, so funding is required first.\n",
    );
    return fail("Treasury is NOT ready to receive funds.");
  }
  if (!resp.ok) return fail(`Horizon HTTP ${resp.status}`);

  const account = await resp.json();
  ok("Account exists on-ledger.");

  const balances = Array.isArray(account.balances) ? account.balances : [];
  const native = balances.find((b) => b.asset_type === "native");
  const xlm = native ? Number(native.balance) : 0;
  const subentries = Number(account.subentry_count ?? 0);
  const minReserve = (2 + subentries) * 0.5; // (2 base + subentries) × 0.5 XLM
  if (xlm >= minReserve) {
    ok(`XLM balance ${xlm} (min reserve ${minReserve}) — open to receive XLM.`);
  } else {
    bad(`XLM balance ${xlm} is below the min reserve ${minReserve}.`);
  }

  if (!USDC_ISSUER) {
    info("USDC_ISSUER not set in .env — skipping USDC trustline check.");
  } else if (!StrKey.isValidEd25519PublicKey(USDC_ISSUER)) {
    bad(`USDC_ISSUER is not a valid public key: ${USDC_ISSUER}`);
  } else {
    const hasUsdc = balances.some(
      (b) => b.asset_type !== "native" && b.asset_code === USDC_CODE && b.asset_issuer === USDC_ISSUER,
    );
    if (hasUsdc) {
      ok(`${USDC_CODE} trustline present — open to receive ${USDC_CODE}.`);
    } else {
      bad(`No ${USDC_CODE} trustline (issuer ${USDC_ISSUER}).`);
      console.log(
        `\n  To accept ${USDC_CODE}: add a trustline for ${USDC_CODE}:${USDC_ISSUER}\n` +
          `  from the treasury wallet (e.g. Lobstr / Freighter "Add asset"). Costs 0.5 XLM reserve.\n`,
      );
    }
  }

  const others = balances
    .filter((b) => b.asset_type !== "native")
    .map((b) => `${b.asset_code}:${String(b.asset_issuer).slice(0, 4)}…`);
  if (others.length) info(`Trustlines: ${others.join(", ")}`);

  console.log(
    "\n\x1b[32mDone.\x1b[0m Once all checks pass, set ENERGY_PAY_TREASURY_PUBLIC_KEY to this account.\n",
  );
}

main().catch((e) => fail(e.message));
