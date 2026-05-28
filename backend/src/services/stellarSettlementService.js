import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { supabase } from "../lib/supabase.js";
import { decryptSecret } from "../lib/crypto.js";

import { horizon as server, NETWORK_PASSPHRASE, explorerTxUrl } from "../lib/stellar-network.js";
const SUPPORTED_ASSETS = new Set(["XLM", "EPWR"]);

class SettlementInputError extends Error {
  constructor(message, status = 400, code = "INVALID_SETTLEMENT_PAYLOAD") {
    super(message);
    this.name = "SettlementInputError";
    this.status = status;
    this.code = code;
  }
}

const readString = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeAssetCode = (asset) => {
  const code = readString(asset || "XLM").toUpperCase();
  if (!SUPPORTED_ASSETS.has(code)) {
    throw new SettlementInputError("Unsupported asset. Allowed: XLM, EPWR, EPRW.", 422);
  }
  return code;
};

const normalizeAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new SettlementInputError("Amount must be a positive number.", 422);
  }

  return amount.toFixed(7).replace(/\.?0+$/, "");
};

const resolveDestination = (payload) => {
  const destination =
    readString(payload.recipient_public_key) ||
    readString(payload.destination_public_key) ||
    readString(payload.destination) ||
    readString(process.env.STELLAR_DESTINATION);

  if (!StrKey.isValidEd25519PublicKey(destination)) {
    throw new SettlementInputError("Invalid Stellar destination public key.", 422);
  }

  return destination;
};

const resolveMemo = (payload) => {
  const raw =
    readString(payload.memo) ||
    readString(payload.transfer_id) ||
    readString(payload.settlement_id) ||
    `EP-${Date.now()}`;

  const ascii = raw.replace(/[^\x20-\x7E]/g, "");
  return Buffer.byteLength(ascii, "utf8") <= 28
    ? ascii
    : Buffer.from(ascii, "utf8").subarray(0, 28).toString("utf8");
};

const keypairFromEnv = (name) => {
  const secret = process.env[name];
  if (!secret) {
    throw new SettlementInputError(`Missing ${name} environment variable.`, 500, "MISSING_ENV");
  }

  try {
    return Keypair.fromSecret(secret);
  } catch {
    throw new SettlementInputError(`${name} is not a valid Stellar secret seed.`, 500, "BAD_ENV");
  }
};

const resolveIssuerPublicKey = () => {
  const explicit = readString(process.env.EPWR_ISSUER_PUBLIC_KEY);

  if (explicit) {
    if (!StrKey.isValidEd25519PublicKey(explicit)) {
      throw new SettlementInputError(
        "Configured EPWR issuer public key is invalid.",
        500,
        "BAD_ENV",
      );
    }
    return explicit;
  }

  return keypairFromEnv("ISSUER_SECRET").publicKey();
};

const resolvePaymentContext = (assetCode, userKeypair) => {
  const asset = assetCode === "XLM"
    ? Asset.native()
    : new Asset(assetCode, resolveIssuerPublicKey());

  // If we have a user keypair, send from the user's own account
  if (userKeypair) {
    return { source: userKeypair, asset };
  }

  // Fallback: platform custody accounts
  if (assetCode === "XLM") {
    return { source: keypairFromEnv("STELLAR_SECRET"), asset };
  }

  const source = process.env.DISTRIBUTION_SECRET
    ? keypairFromEnv("DISTRIBUTION_SECRET")
    : keypairFromEnv("STELLAR_SECRET");

  return { source, asset };
};

/**
 * Resolve the sender's Keypair from the authenticated user's Supabase record.
 *
 * - PLATFORM_MANAGED: decrypts the stored AES ciphertext and returns a Keypair.
 * - USER_CONTROLLED: throws — settlement must go through prepareUnsignedXdr().
 * - Returns null if userId is missing (caller falls back to custody accounts).
 */
const resolveUserKeypair = async (userId) => {
  if (!userId) return null;

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("stellar_secret_encrypted, wallet_mode")
      .eq("id", userId)
      .single();

    if (error || !user) return null;

    // USER_CONTROLLED wallets never have a stored secret — require XDR signing flow
    if (user.wallet_mode === "USER_CONTROLLED") {
      throw Object.assign(
        new Error("USER_CONTROLLED wallet requires local signing. Use /api/settlement/prepare instead."),
        { code: "USER_CONTROLLED_REQUIRES_SIGNATURE", status: 422 },
      );
    }

    if (!user.stellar_secret_encrypted) return null;

    // Decrypt AES ciphertext — secret used only in memory, never logged or returned
    const rawSecret = decryptSecret(user.stellar_secret_encrypted);
    return Keypair.fromSecret(rawSecret);
  } catch (err) {
    if (err.code === "USER_CONTROLLED_REQUIRES_SIGNATURE") throw err;
    return null;
  }
};

/**
 * Prepare an unsigned transaction XDR for USER_CONTROLLED wallets.
 * The frontend signs locally and submits via /api/settlement/submit-signed.
 */
export async function prepareUnsignedXdr({ senderPublicKey, recipientPublicKey, asset, amount, memo }) {
  const assetCode = normalizeAssetCode(asset);
  const normalizedAmount = normalizeAmount(amount);
  const destination = recipientPublicKey;

  if (!StrKey.isValidEd25519PublicKey(destination)) {
    throw new SettlementInputError("Invalid recipient public key.", 422);
  }

  const resolvedAsset = assetCode === "XLM"
    ? Asset.native()
    : new Asset(assetCode, resolveIssuerPublicKey());

  const account = await server.loadAccount(senderPublicKey);
  const memoText = memo
    ? Buffer.byteLength(memo, "utf8") <= 28 ? memo : Buffer.from(memo, "utf8").subarray(0, 28).toString("utf8")
    : `EP-${Date.now()}`;

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({ destination, asset: resolvedAsset, amount: normalizedAmount }),
    )
    .addMemo(Memo.text(memoText))
    .setTimeout(300) // 5 minutes for the user to sign locally
    .build();

  return tx.toXDR();
}

/**
 * Submit a pre-signed XDR transaction from a USER_CONTROLLED wallet.
 * The frontend signed it locally using the Stellar SDK with Networks.PUBLIC.
 */
export async function submitSignedXdr(signedXdr) {
  const { Transaction } = await import("@stellar/stellar-sdk");
  const startedAt = Date.now();

  try {
    const tx = new Transaction(signedXdr, NETWORK_PASSPHRASE);
    const submission = await server.submitTransaction(tx);
    return {
      txHash: submission.hash,
      ledger: submission.ledger,
      successful: submission.successful,
      finalityMs: Date.now() - startedAt,
      explorerUrl: explorerTxUrl(submission.hash),
    };
  } catch (error) {
    const wrapped = new Error(horizonErrorMessage(error));
    wrapped.status = error?.response?.status || 502;
    wrapped.code = "STELLAR_SUBMISSION_FAILED";
    throw wrapped;
  }
}

const buildSettlementRecord = (payload, result, operator) => ({
  settlement_id:
    readString(payload.transfer_id) || readString(payload.settlement_id) || `STL-${Date.now()}`,
  contract_id: readString(payload.contract_id) || readString(payload.contractId) || "P2P",
  buyer: readString(payload.sender_user_id) || readString(operator?.sub) || "EnergyPay Custody",
  seller: result.destinationPublicKey,
  amount_brl: Number(payload.amount_brl ?? payload.amount ?? 0),
  pld: Number(payload.pld ?? 0),
  tx_hash: result.txHash,
  ledger: result.ledger,
  status: "SETTLED",
});

async function persistSettlement(payload, result, operator) {
  try {
    const { error } = await supabase
      .from("settlements")
      .insert(buildSettlementRecord(payload, result, operator));
    if (error) {
      console.warn("Settlement audit insert failed:", error.message);
    }
  } catch (error) {
    console.warn("Settlement audit insert skipped:", error.message);
  }
}

const horizonErrorMessage = (error) => {
  const resultCodes = error?.response?.data?.extras?.result_codes;
  if (resultCodes) return `Horizon rejected transaction: ${JSON.stringify(resultCodes)}`;
  return error?.response?.data?.title || error.message || "Stellar settlement failed.";
};

export async function executeSettlement(payload = {}, context = {}) {
  const assetCode = normalizeAssetCode(payload.asset);
  const amount = normalizeAmount(payload.amount ?? payload.amount_xlm ?? "0.1");
  const destination = resolveDestination(payload);
  const memo = resolveMemo(payload);

  // Try to send from the authenticated user's own account
  const senderId = readString(payload.sender_user_id) || context.operator?.sub || context.operator?.id;
  const userKeypair = await resolveUserKeypair(senderId);
  const { source, asset } = resolvePaymentContext(assetCode, userKeypair);

  const startedAt = Date.now();

  try {
    const account = await server.loadAccount(source.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination,
          asset,
          amount,
        }),
      )
      .addMemo(Memo.text(memo))
      .setTimeout(30)
      .build();

    tx.sign(source);

    const submission = await server.submitTransaction(tx);
    const result = {
      transferId:
        readString(payload.transfer_id) || readString(payload.settlement_id) || `STL-${Date.now()}`,
      txHash: submission.hash,
      ledger: submission.ledger,
      successful: submission.successful,
      sourcePublicKey: source.publicKey(),
      destinationPublicKey: destination,
      asset: assetCode,
      amount: Number(amount),
      memo,
      finalityMs: Date.now() - startedAt,
    };

    await persistSettlement(payload, result, context.operator);

    console.log("REAL HASH:", result.txHash);
    return result;
  } catch (error) {
    if (error instanceof SettlementInputError) throw error;

    const wrapped = new Error(horizonErrorMessage(error));
    wrapped.status = error?.response?.status || 502;
    wrapped.code = "STELLAR_SUBMISSION_FAILED";
    throw wrapped;
  }
}
