-- ─────────────────────────────────────────────────────────────────────────────
-- 015_settlements_audit_and_contract_docs.sql
--
-- Reconciles the `settlements` audit table with the columns the settlement code
-- actually writes, and documents the `contracts` bilateral-document columns.
-- Both already exist partially in the live DB (applied ad-hoc); this file makes
-- a fresh deploy reproducible and patches existing databases idempotently.
--
-- Note on units: epwr_amount stores the EPWR amount that actually moved on-chain,
-- which equals the contract volume in MWh (1 EPWR = 1 MWh). It is NOT a BRL value.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settlements (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id               TEXT,
  contract_id                 TEXT,
  buyer                       TEXT,
  seller                      TEXT,
  amount_brl                  NUMERIC(18, 2),
  volume_mwh                  NUMERIC(18, 6),
  pld                         NUMERIC(18, 2),
  energy_qty_mwh              NUMERIC(18, 6),
  epwr_amount                 NUMERIC(18, 7),   -- = volume_mwh (1 EPWR = 1 MWh)
  tx_hash                     TEXT,
  ledger                      BIGINT,
  finality_ms                 INTEGER,
  counterparty_risk_verified  BOOLEAN,
  risk_status                 TEXT,
  status                      TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patch pre-existing settlements tables that lack the energy/risk columns.
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS volume_mwh                 NUMERIC(18, 6);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS energy_qty_mwh             NUMERIC(18, 6);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS epwr_amount                NUMERIC(18, 7);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS finality_ms                INTEGER;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS counterparty_risk_verified BOOLEAN;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS risk_status                TEXT;

-- Contract bilateral-document columns (used by the contract document upload/retrieve endpoints).
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS document_path TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS document_name TEXT;
