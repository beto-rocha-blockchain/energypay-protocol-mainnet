-- Migration 005: Pre-settlement layer — counterparty risk verification
-- Run in Supabase SQL Editor before deploying.

-- Add risk columns to contracts table
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS risk_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (risk_status IN ('PENDING','CLEARED','INSUFFICIENT_COLLATERAL','NO_EPWR_TRUSTLINE','ACCOUNT_NOT_FOUND','VERIFICATION_FAILED','BYPASSED')),
  ADD COLUMN IF NOT EXISTS collateral_required_brl NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS collateral_available_epwr NUMERIC(18,7),
  ADD COLUMN IF NOT EXISTS coverage_ratio NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS risk_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_period TEXT;

-- Add pre-settlement columns to settlements table
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS epwr_amount NUMERIC(18,7),
  ADD COLUMN IF NOT EXISTS energy_qty_mwh NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS settlement_period TEXT,
  ADD COLUMN IF NOT EXISTS counterparty_risk_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS risk_status TEXT NOT NULL DEFAULT 'BYPASSED'
    CHECK (risk_status IN ('CLEARED','INSUFFICIENT_COLLATERAL','BYPASSED','VERIFICATION_FAILED')),
  ADD COLUMN IF NOT EXISTS finality_ms INTEGER;

-- Back-fill finality_ms from existing data (if settlements table already has it elsewhere)
-- No-op if column already existed
