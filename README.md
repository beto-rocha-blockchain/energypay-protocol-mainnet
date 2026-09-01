# EnergyPay ⚡

> **Live on Stellar Mainnet** · programmable settlement & reconciliation for energy markets · [live demo](https://energypay-protocol-mainnet.vercel.app) · on-chain settlement evidence in [`docs/EVIDENCE.md`](./docs/EVIDENCE.md)

## Programmable Settlement Infrastructure for Energy Markets

EnergyPay is a programmable settlement and reconciliation infrastructure for energy contracts, using Stellar Mainnet as a verifiable financial rail for contract execution, audit evidence, and energy API monetization.

The project demonstrates how bilateral energy settlement obligations can move from fragmented manual workflows into a digital, auditable and programmable settlement process — operating on real Stellar Mainnet transactions.

---

## The Problem

Energy markets are becoming more decentralized, competitive and data-driven, but many settlement workflows still rely on fragmented operational processes.

Bilateral energy contracts often involve:

- manual reconciliation;
- delayed payment confirmation;
- disconnected financial workflows;
- spreadsheet-based operational controls;
- limited settlement visibility;
- counterparty risk;
- lack of real-time audit evidence;
- difficulty connecting contract obligations to financial execution.

As the free energy market expands, especially in markets such as Brazil, participants need more transparent and programmable infrastructure to register, execute and verify settlement events.

---

## The Solution

EnergyPay introduces a programmable settlement layer for energy contracts.

The platform allows energy market participants to register digital settlement obligations, execute settlements on Stellar Mainnet, and verify the full transaction lifecycle through audit dashboards, transaction hashes, ledger numbers, memos and Stellar Expert links.

EnergyPay is not just a tokenization prototype.

It is designed as an operational and financial infrastructure layer for:

- bilateral energy contract settlement;
- programmable payment execution;
- reconciliation automation;
- audit evidence generation;
- settlement lifecycle monitoring;
- machine-to-machine energy payments;
- premium energy market API monetization.

---

## Settlement Flow

The platform executes a complete mainnet workflow:

1. A bilateral energy settlement obligation is represented inside the platform.
2. The user executes a programmable settlement flow.
3. The backend submits a real transaction to Stellar Mainnet.
4. The system returns verifiable transaction evidence.
5. The settlement event is displayed with txHash, ledger, memo, status and Stellar Expert link.
6. The audit trail can be used to support reconciliation and operational verification.

---

## Live Demo

**Application:**  
[EnergyPay — energypay-protocol-mainnet.vercel.app](https://energypay-protocol-mainnet.vercel.app/)

**GitHub Repository:**  
[energypay-protocol-mainnet](https://github.com/beto-rocha-blockchain/energypay-protocol-mainnet)

---

## Getting Started

> Requires **Node.js 18+**. The frontend (repo root) is a Vite + TanStack Start app; the backend (`backend/`) is an Express API.

```bash
# 1 · Frontend (repo root)
npm install
npm run dev            # Vite dev server → http://localhost:5173

# 2 · Backend (separate terminal)
cd backend
npm install
cp .env.example .env   # then fill in the values (see table below)
npm run dev            # Express API → http://localhost:3000
```

### Environment variables (`backend/.env`)

All secrets are environment-based — see [`backend/.env.example`](./backend/.env.example) for the full, commented list. The key ones:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Postgres persistence |
| `JWT_SECRET` | session token signing |
| `MASTER_ENCRYPTION_KEY` | AES encryption of PLATFORM_MANAGED wallet secrets |
| `STELLAR_NETWORK` | `mainnet` (default) — set `testnet` only for local development |
| `STELLAR_SECRET` / `ISSUER_SECRET` / `DISTRIBUTION_SECRET` | Stellar custody & EPWR settlement accounts |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | transactional email (verification / reset) |
| `OTP_CHANNEL`, `TWILIO_*` | phone OTP (optional) |
| `PAYMENT_GATEWAY_KEY`, `PAYMENT_GATEWAY_SANDBOX` | subscription billing (Asaas; sandbox by default) |
| `DEMO_MODE` | set `false` to disable the demo approval override (see [Demo & Testing](#demo--testing)) |

The frontend reads `VITE_STELLAR_NETWORK` at build time (defaults to mainnet).

---

## Key Features

### Digital Energy Contract Registry

EnergyPay provides a digital contract registry layer to model bilateral energy settlement obligations.

The registry is designed to represent core contract data such as:

- buyer;
- seller;
- energy volume;
- reference price;
- settlement date;
- contract status;
- contract reference;
- settlement lifecycle state.

This creates the digital foundation required before settlement execution.

---

### Stellar Mainnet Settlement Rail

EnergyPay connects energy contract obligations to Stellar Mainnet settlement execution.

The settlement rail captures and displays:

- source wallet;
- destination wallet;
- asset;
- amount;
- transaction hash;
- ledger number;
- memo;
- finality time;
- settlement status;
- Stellar Expert explorer link.

This makes each settlement event externally verifiable on Stellar Mainnet.

---

### Direct Settlement

The Direct Settlement module allows users to execute a payment flow through Stellar Mainnet and receive real transaction evidence.

The current implementation supports settlement execution with:

- Stellar SDK;
- Horizon Mainnet (`horizon.stellar.org`);
- server-side signing for PLATFORM_MANAGED wallets;
- local signing modal for USER_CONTROLLED wallets;
- transaction submission;
- txHash return;
- ledger confirmation;
- Stellar Expert link generation;
- audit record persistence.

---

### Audit & Reconciliation Layer

EnergyPay includes an audit-oriented dashboard and settlement evidence flow.

The goal is to reduce reconciliation friction by providing a clear operational view of settlement lifecycle states, such as:

- registered;
- pending;
- executed;
- finalized;
- confirmed;
- failed;
- canceled.

This layer is intended to help market participants verify what happened, when it happened and where the transaction can be independently inspected.

---

### x402-Compatible Energy API Access

EnergyPay also demonstrates an x402-compatible payment flow for premium energy market APIs.

The x402-compatible flow demonstrates:

1. A protected API resource returns HTTP 402 Payment Required.
2. The backend provides payment requirement metadata.
3. A Stellar Mainnet payment is executed by the user.
4. The transaction hash is submitted as payment proof.
5. The backend verifies memo, destination, amount and transaction success through Horizon Mainnet.
6. Premium energy market data access is unlocked.

This module shows how future energy APIs, oracle feeds and market data services can be monetized through programmable payment rails on Stellar Mainnet.

---

## Architecture Overview

EnergyPay combines a modern web application with Stellar Mainnet settlement execution.

```txt
Energy Contract Obligation
        ↓
Digital Contract Registry
        ↓
Settlement Instruction
        ↓
Backend Settlement Engine
        ↓
Stellar Mainnet / Horizon (horizon.stellar.org)
        ↓
txHash + Ledger + Memo
        ↓
Audit Dashboard + Reconciliation Evidence
```

---

## Tech Stack

### Frontend

- React 19
- TypeScript
- Vite + TanStack Start
- TanStack Router
- Zustand
- Tailwind CSS
- Radix UI
- Recharts
- lucide-react

### Backend

- Node.js
- Express
- Stellar SDK
- Horizon Mainnet (`horizon.stellar.org`)
- Supabase

### Blockchain / Settlement

- Stellar Mainnet (PUBLIC network)
- Stellar SDK
- Stellar Expert (`stellar.expert/explorer/public`)
- XLM native payments
- EPWR issued asset support

### Infrastructure

- Vercel
- Supabase
- GitHub

---

## Implemented Technical Capabilities

The current implementation includes:

- authenticated settlement route;
- role-based settlement authorization;
- Stellar Mainnet transaction creation;
- backend-side transaction signing (PLATFORM_MANAGED wallets);
- local signing support (USER_CONTROLLED wallets);
- Horizon Mainnet transaction submission;
- txHash and ledger capture;
- Stellar Expert link generation (mainnet explorer);
- settlement memo support;
- destination public key validation;
- supported asset validation (XLM, EPWR);
- AES-encrypted secret key storage for PLATFORM_MANAGED wallets;
- Supabase settlement persistence;
- x402-compatible HTTP 402 payment flow;
- payment proof validation through Horizon Mainnet;
- ONS oracle integration (real-time Brazilian PLD/CMO data);
- frontend execution logs;
- audit-oriented UI.

---

## Stellar Mainnet Evidence

EnergyPay uses Stellar Mainnet to provide verifiable settlement evidence.

Each successful settlement can generate:

- transaction hash;
- ledger number;
- source public key;
- destination public key;
- memo;
- amount;
- asset;
- status;
- finality time;
- Stellar Expert transaction URL (`/explorer/public/tx/…`).

This allows reviewers, partners and stakeholders to independently verify settlement execution on the live Stellar network.

### Verify it yourself (live mainnet)

Don't trust our books — check the explorer:

- **EPWR asset** (live supply, trustlines, holders): [stellar.expert · EPWR](https://stellar.expert/explorer/public/asset/EPWR-GAC6EW2V5SCW3EEBDNFJSRKIFP7EMI7LYPIX2X3QXWQER4FPQVZGEPUA)
- **Example settlement transaction** — atomic EPWR tokenization (issuer → distribution → buyer): [`45c94626…6427b77f`](https://stellar.expert/explorer/public/tx/45c94626386d43bdb0fbd93578e3c8b8b7c59341b56324065c7b79106427b77f)
- **Issuer account:** [`GAC6…QVZGEPUA`](https://stellar.expert/explorer/public/account/GAC6EW2V5SCW3EEBDNFJSRKIFP7EMI7LYPIX2X3QXWQER4FPQVZGEPUA)
- **Distribution account:** [`GD2S…O4D646V4S`](https://stellar.expert/explorer/public/account/GD2S4MPDYMCSPUPPAJ4RULAGVE6PF2Q5HRNT6ELLQYBXKYKO4D646V4S)

---

## Security Notes

Current security-oriented decisions include:

- backend-side transaction signing only (no private keys in the browser);
- AES encryption for PLATFORM_MANAGED wallet secrets;
- USER_CONTROLLED wallets sign locally — secrets never leave the client;
- no private key exposure in frontend execution flows;
- environment-based secret management;
- role-based authorization for settlement execution;
- Stellar public key validation;
- amount and asset validation;
- REGULATORY_AUTHORITY role is read-only by design.

Future production versions would require:

- formal security audit;
- stronger custody architecture (HSM / MPC);
- regulated compliance review;
- KYC/KYB workflows;
- production-grade key management vault;
- banking/fiat integration assessment;
- legal and regulatory validation.

---

## Demo & Testing

For live demonstrations and grant review the platform ships with a **scoped demo harness**. These are intentional conveniences — **disable them before any production use**.

- **Demo login:** `admin` / `admin`. A regular market-participant account (`platform_role = USER`) with **no platform-admin access**. The login field accepts a plain identifier (no `@` required) for convenience on stage.
- **`demo_approver` capability:** a per-user flag (migration [`025_add_demo_approver_flag.sql`](./backend/src/migrations/025_add_demo_approver_flag.sql)) that lets the flagged account approve **any** contract — force-approving every pending party so a live demo never stalls waiting on a counterparty. It is **not** a platform role.
- **Runtime kill switch:** disable the capability globally by setting `DEMO_MODE=false` in the backend environment, or at the data level with `UPDATE users SET demo_approver = false;`.

### Reproducible Testnet settlement evidence

```bash
node scripts/testnet-settlement-evidence.mjs
```

Executes a full **Stellar Testnet** energy-contract settlement (token issuance → settlement lock with a contract-reference memo) using fresh Friendbot-funded accounts, and writes the transaction hash, ledger, memo, destination wallet, status and Stellar Expert link to `scripts/testnet-evidence/`. See [`docs/EVIDENCE.md`](./docs/EVIDENCE.md) for the consolidated evidence package and the settlement lifecycle states.

> ⚠️ **Before production:** set `DEMO_MODE=false`, clear demo flags (`UPDATE users SET demo_approver = false;`), and remove or re-credential the `admin` demo account.

---

## What Is In Scope Now

The current EnergyPay platform operates on Stellar Mainnet and includes:

- digital energy contract registration;
- Stellar Mainnet settlement execution;
- Direct Settlement flow (P2P and contract-based);
- EPWR issued-asset support on mainnet;
- real txHash, ledger and memo evidence;
- Stellar Expert mainnet verification;
- audit dashboard;
- settlement lifecycle visualization;
- x402-compatible API access demonstration;
- ONS oracle integration (live Brazilian PLD/CMO);
- role-based and region-aware interface.

---

## What Is Not In Scope Yet

The current platform does not claim to provide:

- regulated financial operations;
- full clearing house operation;
- collateral management;
- margin engine;
- netting engine;
- banking integration;
- PIX as an energy-settlement rail (subscription/plan billing via PIX/card is a separate billing layer, isolated from settlement);
- ERP integration;
- formal security audit;
- licensed financial intermediation.

These are future roadmap areas that require additional technical, legal, financial and compliance work.

---

## Roadmap

### Phase 1 — Mainnet Settlement Infrastructure ✅

- Digital contract registry
- Stellar Mainnet settlement rail
- Direct Settlement (XLM + EPWR)
- Audit dashboard
- Transaction evidence package
- ONS oracle integration (live PLD)

### Phase 2 — Institutional Refinement

- Improved contract lifecycle management
- Enhanced reconciliation workflows
- Better audit evidence exports
- Stakeholder-facing dashboards
- Pilot-ready documentation

### Phase 3 — Programmable Contract Logic

- Soroban-based settlement logic exploration
- Programmable contract conditions
- Automated settlement triggers
- On-chain/off-chain contract coordination

### Phase 4 — Treasury & Risk Layer

- Collateral monitoring
- Treasury operations
- Reserve management
- Counterparty exposure views
- Settlement risk analytics

### Phase 5 — Production Readiness

- Security audit
- Compliance review
- Enterprise integrations
- Market pilot preparation
- KYC/KYB workflows

### Phase 6 — Energy Financial Infrastructure

- Stablecoin settlement rails
- Energy API monetization (x402 at scale)
- Machine-to-machine payments
- Oracle-based settlement triggers
- Energy financial products
- Cross-market interoperability

---

## Market Vision

EnergyPay is designed for a future where electricity contracts become programmable financial primitives.

The long-term vision is to support infrastructure for:

- energy traders;
- generators;
- retailers;
- distributors;
- commercial consumers;
- financial institutions;
- energy service providers;
- market operators;
- API-based energy data providers;
- autonomous energy systems.

As energy markets become more dynamic and decentralized, settlement infrastructure must become faster, more transparent and more programmable.

---

## Why Stellar

Stellar provides a strong foundation for EnergyPay because it is optimized for fast, low-cost and verifiable financial transactions.

EnergyPay uses Stellar Mainnet to demonstrate:

- programmable settlement execution on a live network;
- fast transaction confirmation (~5s finality);
- public transaction verification;
- ledger-based auditability;
- interoperable payment infrastructure;
- issued-asset support (EPWR);
- stablecoin and asset-based settlement rails.

Stellar acts as the financial execution rail, while EnergyPay provides the energy-specific workflow, registry, audit and reconciliation layer.

---

## Team

EnergyPay is being developed by:

**Roberto Pimentel**  
Fullstack & Web3 Developer  
Technical Lead / Builder

---

## Project Status

EnergyPay is currently in active development on Stellar Mainnet.

Current status:

- platform operational on Stellar Mainnet;
- Mainnet settlement execution working (XLM + EPWR);
- Direct Settlement flow implemented;
- x402-compatible API flow implemented (mainnet payment proofs);
- institutional frontend deployed on Vercel;
- ONS oracle live (real Brazilian PLD/CMO data);
- role-based and region-aware interface;
- audit-oriented workflow in place;
- early stakeholder conversations with energy-market participants underway.

---

## Disclaimer

EnergyPay is an experimental platform running on Stellar Mainnet, intended for demonstration, validation and technical development purposes.

It does not currently perform regulated financial settlement, does not operate as a licensed clearing house, payment institution or energy market operator.

Settlement transactions executed through this platform use real Stellar Mainnet accounts and real XLM/EPWR. Users are responsible for the management and security of their settlement addresses.

---

## EnergyPay

**Building the programmable financial rail for electricity markets.**
