# EnergyPay — Evidence Package (SCF Instawards)

## Overview

EnergyPay is a programmable settlement and reconciliation infrastructure for bilateral
energy contracts. It connects a digital energy-contract obligation (buyer, seller, energy
volume, reference price, settlement date) to a **verifiable financial execution rail on the
Stellar network**, and reconciles the resulting on-chain receipts into an audit trail.

This document lets reviewers verify what is implemented against each SCF deliverable, with
**real, independently verifiable transaction evidence**.

> **Network note.** The SCF deliverable scope targets **Stellar Testnet**. The programmable
> settlement rail is demonstrated on Testnet below via a reproducible script with real
> testnet transactions. **Beyond the grant scope**, the platform has also been deployed and
> exercised on **Stellar Mainnet** (a real 100 MWh settlement, publicly verifiable) — see
> "Beyond scope: Mainnet" under Deliverable 2.

---

## Project Links

| | |
|---|---|
| **GitHub repository** | https://github.com/beto-rocha-blockchain/energypay-protocol-mainnet |
| **Live demo** | https://energypay-protocol-mainnet.vercel.app |
| **Demo video** | https://drive.google.com/file/d/1LT8rV_N1KavR8iABE1BbxantPwqP-DHv/view *(confirm/replace with the final walkthrough)* |

---

## Deliverable 1 — Digital Energy Contract Registry MVP

**A web module to register and visualize a bilateral energy settlement obligation** (buyer,
seller, energy volume, reference price, settlement date, status, contract reference).

**Implemented — status: COMPLETE.**

| Capability | Where |
|---|---|
| Register a bilateral contract (buyer, seller, MWh volume, price, period, parties) | `src/routes/contracts.new.tsx` → `POST /api/contracts` (`backend/src/routes/contracts.js`) |
| Contract listing with status / state / PLD / exposure / tx hash | `src/routes/contracts.index.tsx` |
| Contract detail + settlement state machine + movements/audit trail | `src/routes/contracts.index.tsx` (detail modal) |
| Schema (buyer/seller, volume_mwh, price_brl, pld_brl, settlement_date, status, state, tx_hash, ledger) | `backend/src/migrations/002_contract_lifecycle.sql` |

**Evidence to attach (operator):**
- Screenshot — contract registration form: `/contracts/new`
- Screenshot — contract listing: `/contracts`
- Live demo + GitHub repo links above.

---

## Deliverable 2 — Stellar Testnet Programmable Settlement Rail

**A Stellar Testnet settlement flow that executes a simulated energy-contract settlement and
records transaction hash, ledger number, memo, destination wallet, status, and Stellar Expert
link.**

**Implemented — status: COMPLETE (real testnet transactions below).**

The rail mirrors the production atomic flow: **token issuance** (issuer mints EPWR, where
1 EPWR = 1 MWh) → **settlement lock** (distribution transfers the contracted volume to the
buyer, anchoring the bilateral contract reference in the transaction memo). It is reproducible
from a clean checkout via [`scripts/testnet-settlement-evidence.mjs`](../scripts/testnet-settlement-evidence.mjs).

### Settlement transaction (Stellar Testnet)

| Field | Value |
|---|---|
| **Network** | Stellar Testnet (`Test SDF Network ; September 2015`) |
| **Contract reference** | `PPA-20260616-5474` |
| **Energy volume** | 100 MWh |
| **Reference price (PLD)** | R$ 225.00 / MWh |
| **Settlement asset** | EPWR (1 EPWR = 1 MWh) |
| **Source wallet** (distribution) | `GDUWACKBNMJII4M2TGP57NSOFTSCLENKO23SMEH2VDUJIW727LAHBHT4` |
| **Destination wallet** (buyer) | `GA3K22ZQREYJBPSWYYBEAE7WVCR4SIBCJUF3RWS3XZDXI6M36SS6W5V2` |
| **Memo** | `CTR-PPA-20260616-5474` |
| **Transaction hash** | `e883469c6ff5c1553700415c25c9e75021b1e84000f8a72bd29f692655241c17` |
| **Ledger** | `3123027` |
| **Status** | SETTLED (confirmed `2026-06-16T16:41:23Z`) |
| **Stellar Expert** | https://stellar.expert/explorer/testnet/tx/e883469c6ff5c1553700415c25c9e75021b1e84000f8a72bd29f692655241c17 |

### Supporting transactions (same run)

| Step | Tx hash | Ledger |
|---|---|---|
| EPWR trustline (distribution) | `9eff054fd9783471d042acdcbe1353c31a3bc5ecde5a02772a650090ea4fc2d5` | 3123024 |
| EPWR trustline (buyer) | `39664321c3901aefcd8524d43e43b12c19a3b6508ce925a7f093029e36f6be8e` | 3123025 |
| Token issuance (issuer → distribution, 100 EPWR) | `f32e96bd5c253d1ed887f1ecfdecbb3d54f3ca67546468a92d6ac78fc8b732aa` | 3123026 |

- Issuer (EPWR): `GBOHUEINY3OXKZIDOCOW4GR4NR5JTX7Q5LKBHVPFVQR56YFZ4HVRXHTH`
- **Settlement rail logs:** [`scripts/testnet-evidence/settlement-PPA-20260616-5474.log`](../scripts/testnet-evidence/settlement-PPA-20260616-5474.log)
- **Machine-readable evidence:** [`scripts/testnet-evidence/settlement-PPA-20260616-5474.json`](../scripts/testnet-evidence/settlement-PPA-20260616-5474.json)

### Beyond scope: Mainnet (over-delivery)

The same architecture has executed a **real settlement on Stellar Mainnet** (not required by the
grant, which is testnet-scoped):

| Field | Value |
|---|---|
| Asset / volume | 100 EPWR (100 MWh) |
| Transaction hash | `2ae6f9a67bbab0fa121ddaf704948e5bea68fdb0395093e68522a67abb40d4c2` |
| Ledger | 62,865,799 |
| Stellar Expert | https://stellar.expert/explorer/public/tx/2ae6f9a67bbab0fa121ddaf704948e5bea68fdb0395093e68522a67abb40d4c2 |

**Evidence to attach (operator):** screenshot of a settlement execution / receipt in the app.

---

## Deliverable 3 — Settlement Dashboard & Audit Evidence Package

**A dashboard + evidence package showing settlement lifecycle states (registered, pending,
executed, confirmed, failed, canceled) with logs, screenshots, demo video, GitHub repo, and
testnet transaction evidence.**

**Implemented — status: COMPLETE (docs + screenshots to attach).**

| Capability | Where |
|---|---|
| Operations dashboard (KPIs, live settlement feed, treasury, telemetry) | `src/routes/index.tsx` |
| Audit & compliance view (immutable trail, explorer links) | `src/routes/audit.tsx` |
| Settlement lifecycle state machine + movements per contract | `src/routes/contracts.index.tsx`, `backend/src/routes/contracts.js` |
| Evidence package (this document) + testnet artifacts | `docs/EVIDENCE.md`, `scripts/testnet-evidence/` |

### Settlement lifecycle states

```
CREATED → VALIDATED → PENDING_SIGNATURE → BROADCASTING → CONFIRMED → SETTLED
                                                        ↘ FAILED
DRAFT → (all parties approve) → ACTIVE → PENDING → SETTLED | FAILED | CANCELED
```

Each settlement record carries: settlement ID, contract reference, source/destination,
asset, amount, transaction hash, ledger, status, timestamp, memo, and a Stellar Expert link —
connecting an in-platform event to an externally verifiable on-chain transaction.

**Evidence to attach (operator):** demo video link, screenshot of the dashboard/audit view,
this README/EVIDENCE doc, and the transaction logs above.

---

## Reproduce the testnet evidence yourself

```bash
# From the repo root (Node 18+). Testnet only — no real funds.
node scripts/testnet-settlement-evidence.mjs
# Prints the settlement hash/ledger/memo/destination/Stellar Expert link and
# writes scripts/testnet-evidence/settlement-<ref>.{json,log}
```

Each run provisions fresh Friendbot-funded testnet accounts, establishes EPWR trustlines,
issues the tokenized energy, and executes the settlement — so reviewers can regenerate
independent evidence on demand.

---

## What is real vs. simulated

**Real / implemented:** contract registry (register + list + detail), settlement rail on
Stellar (testnet evidence above; mainnet over-delivery), tx hash / ledger / memo / Stellar
Expert verification, audit-oriented settlement records, role-based authorization, Supabase
persistence, deployed frontend.

**Simulated / out of production scope:** regulated clearing-house activity, production custody,
bank/PIX/ERP integration, KYC/KYB, and regulated market-operator integration. Some market-data
values (e.g. PLD reference) are illustrative.

**Not claimed:** EnergyPay is not a licensed clearing house, regulated payment institution, or
live energy-market operator. The testnet rail is for technical validation; the mainnet activity
is controlled-value over-delivery, not a regulated production service.

---

## Reviewer verification flow

1. Open the GitHub repo and the live demo (links above).
2. Register a bilateral contract (`/contracts/new`) and view it in the registry (`/contracts`).
3. Open the testnet settlement Stellar Expert link and confirm hash, ledger, memo, destination,
   amount and status — or run `node scripts/testnet-settlement-evidence.mjs` to generate your own.
4. Review the dashboard/audit views and the lifecycle states.
5. (Optional) Verify the mainnet over-delivery transaction on Stellar Expert.
