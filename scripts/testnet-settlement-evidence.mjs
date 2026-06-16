/**
 * Stellar Testnet — Programmable Settlement Rail (SCF Deliverable 2 evidence).
 *
 * Executes a *simulated* bilateral energy-contract settlement on the Stellar
 * TESTNET (no real value) that mirrors the production atomic flow:
 *
 *   1. Token issuance     — issuer mints EPWR (1 EPWR = 1 MWh) to the platform
 *                           distribution account.
 *   2. Settlement lock    — distribution transfers the contracted EPWR volume to
 *                           the buyer (destination wallet), anchoring the bilateral
 *                           contract reference in the transaction memo.
 *
 * It records and prints, for the settlement transaction: transaction hash,
 * ledger number, memo, destination wallet, status, and a Stellar Expert
 * (testnet) verification link — and writes a machine-readable evidence JSON
 * plus a human-readable log under scripts/testnet-evidence/.
 *
 * Usage:  node scripts/testnet-settlement-evidence.mjs
 *
 * SAFETY: Testnet only. Accounts are funded by Friendbot with test XLM that has
 * no monetary value. This script never touches Mainnet, real custody, or any
 * stored platform secret.
 */

import {
  Keypair,
  Horizon,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
  Memo,
} from "@stellar/stellar-sdk";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const FRIENDBOT_URL = "https://friendbot.stellar.org";
const PASSPHRASE = Networks.TESTNET;
const EXPLORER = "https://stellar.expert/explorer/testnet";

const server = new Horizon.Server(HORIZON_URL);

// ── contract parameters (a simulated bilateral PPA) ──────────────────────────
const ENERGY_VOLUME_MWH = 100;
const REFERENCE_PRICE_BRL = 225.0; // PLD reference, R$/MWh
const CONTRACT_REF = `PPA-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
  Math.random() * 9000 + 1000,
)}`;
const SETTLEMENT_MEMO = `CTR-${CONTRACT_REF}`.slice(0, 28); // Stellar text memo ≤ 28 bytes

const log = [];
const say = (...a) => {
  const line = a.join(" ");
  console.log(line);
  log.push(line);
};

async function friendbotFund(label, pk) {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(pk)}`);
  if (!res.ok) throw new Error(`Friendbot funding failed for ${label} (${res.status})`);
  await res.json();
  say(`  ✓ funded ${label.padEnd(12)} ${pk}`);
}

async function submit(sourceKp, buildOps, memo, label) {
  const account = await server.loadAccount(sourceKp.publicKey());
  let builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  });
  for (const op of buildOps) builder = builder.addOperation(op);
  if (memo) builder = builder.addMemo(Memo.text(memo));
  const tx = builder.setTimeout(60).build();
  tx.sign(sourceKp);
  const res = await server.submitTransaction(tx);
  say(`  ✓ ${label.padEnd(18)} hash=${res.hash} ledger=${res.ledger}`);
  return { hash: res.hash, ledger: res.ledger, successful: res.successful !== false };
}

async function main() {
  say("══════════════════════════════════════════════════════════════════════");
  say(" EnergyPay · Stellar Testnet Programmable Settlement Rail");
  say(` Network: Stellar Testnet (${PASSPHRASE})`);
  say(` Contract reference: ${CONTRACT_REF} · Volume: ${ENERGY_VOLUME_MWH} MWh · PLD R$ ${REFERENCE_PRICE_BRL}/MWh`);
  say("══════════════════════════════════════════════════════════════════════");

  // 1 · Parties
  const issuer = Keypair.random(); // EPWR issuer (tokenized energy)
  const distribution = Keypair.random(); // platform settlement / distribution account
  const buyer = Keypair.random(); // contract counterparty (destination wallet)
  const EPWR = new Asset("EPWR", issuer.publicKey());

  say("\n[1] Provisioning testnet accounts (Friendbot)…");
  await friendbotFund("issuer", issuer.publicKey());
  await friendbotFund("distribution", distribution.publicKey());
  await friendbotFund("buyer", buyer.publicKey());

  // 2 · Trustlines to the EPWR settlement asset
  say("\n[2] Establishing EPWR trustlines…");
  await submit(distribution, [Operation.changeTrust({ asset: EPWR })], null, "trustline:dist");
  await submit(buyer, [Operation.changeTrust({ asset: EPWR })], null, "trustline:buyer");

  // 3 · Token issuance — issuer mints the contracted energy volume to distribution
  say("\n[3] Token issuance (issuer → distribution)…");
  const issuance = await submit(
    issuer,
    [
      Operation.payment({
        destination: distribution.publicKey(),
        asset: EPWR,
        amount: String(ENERGY_VOLUME_MWH),
      }),
    ],
    `EPWR-ISSUE-${ENERGY_VOLUME_MWH}`,
    "token_issuance",
  );

  // 4 · Settlement — distribution transfers EPWR to the buyer, memo = contract ref
  say("\n[4] Settlement lock (distribution → buyer)…");
  const settlement = await submit(
    distribution,
    [
      Operation.payment({
        destination: buyer.publicKey(),
        asset: EPWR,
        amount: String(ENERGY_VOLUME_MWH),
      }),
    ],
    SETTLEMENT_MEMO,
    "settlement",
  );

  // 5 · Evidence package
  const evidence = {
    deliverable: "D2 · Stellar Testnet Programmable Settlement Rail",
    network: "Stellar Testnet",
    network_passphrase: PASSPHRASE,
    generated_at: new Date().toISOString(),
    contract: {
      reference: CONTRACT_REF,
      energy_volume_mwh: ENERGY_VOLUME_MWH,
      reference_price_brl_per_mwh: REFERENCE_PRICE_BRL,
      settlement_asset: "EPWR (1 EPWR = 1 MWh)",
    },
    parties: {
      issuer: issuer.publicKey(),
      distribution: distribution.publicKey(),
      buyer_destination_wallet: buyer.publicKey(),
    },
    token_issuance_tx: {
      hash: issuance.hash,
      ledger: issuance.ledger,
      stellar_expert: `${EXPLORER}/tx/${issuance.hash}`,
    },
    settlement_tx: {
      hash: settlement.hash,
      ledger: settlement.ledger,
      memo: SETTLEMENT_MEMO,
      destination_wallet: buyer.publicKey(),
      status: settlement.successful ? "SETTLED" : "FAILED",
      stellar_expert: `${EXPLORER}/tx/${settlement.hash}`,
    },
    explorer_accounts: {
      issuer: `${EXPLORER}/account/${issuer.publicKey()}`,
      distribution: `${EXPLORER}/account/${distribution.publicKey()}`,
      buyer: `${EXPLORER}/account/${buyer.publicKey()}`,
    },
  };

  say("\n══════════════════════════════════════════════════════════════════════");
  say(" SETTLEMENT EVIDENCE (Deliverable 2)");
  say("══════════════════════════════════════════════════════════════════════");
  say(` Status:             ${evidence.settlement_tx.status}`);
  say(` Tx Hash:            ${evidence.settlement_tx.hash}`);
  say(` Ledger:             ${evidence.settlement_tx.ledger}`);
  say(` Memo:               ${evidence.settlement_tx.memo}`);
  say(` Destination wallet: ${evidence.settlement_tx.destination_wallet}`);
  say(` Stellar Expert:     ${evidence.settlement_tx.stellar_expert}`);
  say("══════════════════════════════════════════════════════════════════════");

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "testnet-evidence");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `settlement-${CONTRACT_REF}.json`);
  const logPath = join(outDir, `settlement-${CONTRACT_REF}.log`);
  writeFileSync(jsonPath, JSON.stringify(evidence, null, 2));
  writeFileSync(logPath, log.join("\n") + "\n");
  say(`\nEvidence written:\n  ${jsonPath}\n  ${logPath}`);
}

main().catch((err) => {
  const detail = err?.response?.data?.extras?.result_codes
    ? JSON.stringify(err.response.data.extras.result_codes)
    : err?.message || String(err);
  console.error("Settlement rail FAILED:", detail);
  process.exit(1);
});
