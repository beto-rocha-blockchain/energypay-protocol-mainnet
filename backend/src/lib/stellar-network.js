/**
 * Centralized Stellar network configuration — Mainnet only.
 *
 * STELLAR_NETWORK env var is kept for compatibility but this platform
 * operates exclusively on Stellar Mainnet (PUBLIC network).
 * Friendbot and testnet references have been removed.
 *
 * Every backend service and route MUST import from this module instead of
 * hard-coding Horizon URLs, network passphrases, or explorer base URLs.
 */

import { Horizon, Networks } from "@stellar/stellar-sdk";

// Platform is mainnet-only. The env var check is kept as a safety guard.
const raw = (process.env.STELLAR_NETWORK || "mainnet").toLowerCase().trim();
export const IS_MAINNET = raw === "mainnet" || raw === "public";

export const NETWORK_NAME = "stellar-mainnet";
export const NETWORK_LABEL = "STELLAR_MAINNET";
export const NETWORK_PASSPHRASE = Networks.PUBLIC;

export const HORIZON_URL = "https://horizon.stellar.org";

const EXPLORER_SEGMENT = IS_MAINNET ? "public" : "testnet";
export const explorerTxUrl = (hash) =>
  `https://stellar.expert/explorer/${EXPLORER_SEGMENT}/tx/${hash}`;
export const explorerAccountUrl = (publicKey) =>
  `https://stellar.expert/explorer/${EXPLORER_SEGMENT}/account/${publicKey}`;
export const explorerAssetUrl = (code, issuer) =>
  `https://stellar.expert/explorer/${EXPLORER_SEGMENT}/asset/${code}-${issuer}`;

/** Shared Horizon.Server instance — reuse across services. */
export const horizon = new Horizon.Server(HORIZON_URL);
