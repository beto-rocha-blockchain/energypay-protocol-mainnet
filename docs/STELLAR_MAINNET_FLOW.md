# EnergyPay Stellar Mainnet Flow

## Overview

This document explains how the current EnergyPay platform uses Stellar Mainnet to execute and verify settlement flows.

EnergyPay uses Stellar as a verifiable financial execution rail for production operations. The current implementation is focused on mainnet-based settlement evidence, including transaction hash, ledger number, memo and Stellar Expert verification.

This document is intended for reviewers, judges, mentors, developers and stakeholders who want to understand how EnergyPay connects a settlement instruction to a verifiable Stellar Mainnet transaction.

---

## Current Scope

The current Stellar integration is designed for production mainnet operations.

It demonstrates:

- Stellar Mainnet transaction execution;
- Direct Settlement through backend services;
- XLM mainnet payments;
- EPWR mainnet asset support;
- transaction hash capture;
- ledger confirmation;
- memo-based settlement identification;
- Stellar Expert explorer link generation;
- audit-oriented settlement persistence.

The current flow represents production mainnet settlement and supports live energy market settlement workflows.

---

## High-Level Flow

```txt
Settlement Intent
        ↓
Frontend Direct Settlement UI
        ↓
TanStack Start API Gateway
        ↓
Express Settlement Backend
        ↓
Stellar SDK Transaction Builder
        ↓
Horizon Mainnet
        ↓
Stellar Mainnet Ledger
        ↓
txHash + Ledger + Memo
        ↓
EnergyPay Receipt + Stellar Expert Link
```

---

## Main Components

### 1. Frontend

The frontend provides the operational interface where the user initiates a settlement.

The Direct Settlement interface can collect or display:

- destination wallet;
- amount;
- asset;
- memo;
- recipient or counterparty reference;
- execution logs;
- receipt information;
- Stellar Expert transaction link.

The frontend does not handle Stellar secret seeds.

---

### 2. TanStack Start API Gateway

The TanStack Start server routes act as a same-origin API gateway between the browser UI and the Express backend.

The gateway can:

- validate P2P settlement intent;
- normalize request payloads;
- apply authorization checks from JWT claims;
- proxy the settlement request to the backend;
- keep the browser separated from backend secrets.

The gateway does not hold Stellar secret keys.

---

### 3. Express Settlement Backend

The Express backend is responsible for authenticated settlement execution.

The backend can:

- verify JWT signatures;
- validate operator roles;
- validate settlement payloads;
- validate destination public keys;
- validate settlement amounts;
- resolve the payment asset;
- resolve the settlement memo;
- sign Stellar Mainnet transactions in a controlled production environment;
- submit transactions to Horizon Mainnet;
- return a canonical settlement receipt;
- write best-effort audit rows to Supabase.

---

### 4. Stellar Mainnet

Stellar Mainnet is used as the verifiable execution rail.

EnergyPay currently uses Stellar Mainnet for:

- XLM mainnet settlement;
- EPWR issued-asset mainnet flows;
- public account balance reads;
- transaction submission through Horizon;
- transaction verification through Stellar Expert.

---

### 5. Evidence Layer

Each successful settlement can generate evidence such as:

- transaction hash;
- ledger number;
- source public key;
- destination public key;
- asset;
- amount;
- memo;
- finality latency;
- status;
- Stellar Expert transaction URL.

This evidence allows the settlement event displayed inside EnergyPay to be independently verified on Stellar Mainnet.

---

## Direct Settlement Flow

The Direct Settlement flow connects a user action inside EnergyPay to a Stellar Mainnet payment.

```txt
1. Operator logs in
2. Operator opens Direct Settlement
3. Operator enters settlement details
4. Frontend sends settlement request
5. Gateway validates and proxies request
6. Backend verifies JWT and role
7. Backend builds Stellar payment transaction
8. Backend signs transaction in controlled mainnet environment
9. Backend submits transaction to Horizon Mainnet
10. Horizon returns transaction hash and ledger number
11. Backend persists audit evidence
12. Frontend displays receipt and Stellar Expert link
13. Reviewer verifies transaction externally
```

---

## Settlement Request

A settlement request may include fields such as:

```json
{
  "destination_public_key": "G...",
  "amount": "0.1",
  "asset": "XLM",
  "memo": "EP-EXAMPLE",
  "contract_id": "CONTRACT-001"
}
```

Depending on the route and frontend flow, equivalent fields may also be normalized by the gateway or backend.

The backend should not trust client-provided identity or role fields. The sender/operator identity should be derived from the verified token.

---

## Backend Validation

Before submitting a transaction, the backend validates the request.

Validation includes:

- checking authentication;
- checking operator role;
- validating destination public key format;
- validating positive amount;
- validating supported asset;
- resolving memo safely;
- preventing client-controlled role escalation;
- deriving sender identity from verified JWT claims.

If validation fails, the backend returns an error and does not submit a transaction to Stellar Mainnet.

---

## Supported Assets

The current platform supports mainnet settlement flows using:

- XLM;
- EPWR.

### XLM

XLM is used for native Stellar Mainnet payments.

The source account is configured through a backend environment variable such as:

```txt
STELLAR_SECRET
```

### EPWR

EPWR represents the EnergyPay mainnet issued asset used for settlement operations.

EPWR flows may depend on:

```txt
ISSUER_SECRET
DISTRIBUTION_SECRET
EPWR_ISSUER_PUBLIC_KEY
```

The EPWR setup is intended for mainnet operations and should be managed with appropriate production-grade key management.

---

## Memo Usage

EnergyPay uses Stellar memos to connect an on-chain transaction to an internal settlement or operation reference.

A memo may represent:

- settlement ID;
- transfer ID;
- contract reference;
- operation reference;
- execution reference.

Example:

```txt
EP-1710000000000
```

Stellar memo text has length limitations, so long values should be normalized or truncated safely by the backend.

The memo is important because it helps connect:

```txt
EnergyPay settlement record → Stellar transaction → audit evidence
```

---

## Settlement Response

A successful settlement response may include:

```json
{
  "transfer_id": "STL-EXAMPLE",
  "source_public_key": "G...",
  "destination_public_key": "G...",
  "asset": "XLM",
  "amount": 0.1,
  "tx_hash": "example_tx_hash",
  "ledger": 123456,
  "finality_ms": 1200,
  "status": "FINALIZED",
  "explorer_link": "https://stellar.expert/explorer/mainnet/tx/example_tx_hash",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "memo": "EP-EXAMPLE"
}
```

The most important evidence fields are:

- `tx_hash`;
- `ledger`;
- `memo`;
- `status`;
- `explorer_link`.

---

## Stellar Expert Verification

Each successful settlement can be verified on Stellar Expert.

A transaction link follows this format:

```txt
https://stellar.expert/explorer/mainnet/tx/<txHash>
```

A reviewer can inspect:

- transaction status;
- ledger;
- source account;
- destination account;
- payment operation;
- asset;
- amount;
- memo;
- timestamp.

This is the key proof that the EnergyPay platform is not only displaying a simulated UI, but also connecting settlement actions to verifiable Stellar Mainnet transactions.

---

## Audit Persistence

After a successful settlement, the backend can write an audit-oriented row to Supabase.

A settlement audit record may include:

- settlement ID;
- contract ID;
- buyer or sender reference;
- seller or destination reference;
- amount;
- PLD reference value when applicable;
- transaction hash;
- ledger number;
- status.

This persistence layer helps connect application-level workflows with blockchain-level settlement evidence.

The current Supabase persistence is production infrastructure and will evolve into a more robust reconciliation database in future versions.

---

## Error Handling

The settlement backend should handle common failure cases such as:

- missing environment variables;
- invalid Stellar secret seed;
- invalid destination public key;
- invalid amount;
- unsupported asset;
- insufficient source balance;
- missing trustline for issued assets;
- Horizon transaction rejection;
- network errors;
- unauthorized operator role;
- expired or invalid JWT.

When Horizon rejects a transaction, the backend should return a readable error message instead of exposing raw low-level failure details only.

---

## Environment Variables

The backend may use the following Stellar-related variables:

```txt
STELLAR_SECRET=
STELLAR_DESTINATION=
ISSUER_SECRET=
DISTRIBUTION_SECRET=
EPWR_ISSUER_PUBLIC_KEY=
```

Additional application variables may include:

```txt
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
MASTER_ENCRYPTION_KEY=
PORT=
```

Important security rules:

- never commit real secret values;
- keep `backend/.env` local and ignored;
- document safe examples in `backend/.env.example`;
- rotate any exposed secret immediately;
- use production-grade secrets for mainnet operations;
- move to proper vault/HSM architecture before any regulated deployment.

---

## What Is Real

The current platform can demonstrate:

- real Stellar Mainnet transaction submission;
- real txHash returned from Horizon;
- real ledger number returned after submission;
- real Stellar Expert verification;
- real memo attached to transaction;
- backend-side validation;
- audit-oriented persistence;
- Direct Settlement UI receipt.

---

## What Is Simulated or Demo-Scoped

The current platform may still include simulated or demo-only elements such as:

- simulated energy contract data;
- simulated market data;
- simulated PLD values;
- demo counterparties;
- non-regulated settlement flows.

These elements are acceptable for demonstration as long as they are clearly separated from production claims.

---

## What Is Not Claimed

EnergyPay does not currently claim to provide:

- regulated financial intermediation;
- licensed clearing house operation;
- production custody without vault/HSM;
- banking integration;
- PIX integration;
- ERP integration.

The Stellar Mainnet flow is intended to validate technical feasibility and settlement evidence generation at production scale.

---

## Reviewer Checklist

A reviewer can validate the Stellar Mainnet flow by checking:

- Does the frontend show a Direct Settlement flow?
- Does the backend return a transaction hash?
- Does the backend return a ledger number?
- Does the receipt include a memo?
- Does the receipt include a Stellar Expert Mainnet link?
- Does the Stellar Expert link open a valid transaction?
- Does the transaction show the expected destination account?
- Does the transaction show the expected amount and asset?
- Does the transaction memo match the EnergyPay receipt?
- Does the platform distinguish mainnet production operations from simulated demo data?

---

## Example Evidence Template

Use the template below to document one verified settlement.

```txt
Settlement ID:
PASTE_SETTLEMENT_ID_HERE

Contract ID:
PASTE_CONTRACT_ID_HERE

Source Public Key:
PASTE_SOURCE_PUBLIC_KEY_HERE

Destination Public Key:
PASTE_DESTINATION_PUBLIC_KEY_HERE

Asset:
XLM or EPWR

Amount:
PASTE_AMOUNT_HERE

Memo:
PASTE_MEMO_HERE

Transaction Hash:
PASTE_TX_HASH_HERE

Ledger:
PASTE_LEDGER_NUMBER_HERE

Status:
FINALIZED / SETTLED

Stellar Expert Link:
PASTE_STELLAR_EXPERT_LINK_HERE
```

---

## Production Considerations

For full enterprise production deployment, EnergyPay would require additional work such as:

- formal security audit;
- production-grade key management;
- custody architecture redesign;
- legal and regulatory review;
- KYC/KYB process;
- compliance framework;
- enterprise identity management;
- monitoring and alerting;
- incident response;
- disaster recovery;
- banking or payment partner review;
- expanded mainnet readiness plan.

---

## Summary

The EnergyPay Stellar Mainnet flow demonstrates how a bilateral energy settlement instruction can become a verifiable financial transaction.

```txt
Settlement Instruction
        ↓
Backend Validation
        ↓
Stellar Mainnet Transaction
        ↓
txHash + Ledger + Memo
        ↓
Stellar Expert Verification
        ↓
Audit & Reconciliation Evidence
```

This flow is the technical foundation of the EnergyPay platform and supports the broader thesis of programmable settlement infrastructure for energy markets.
