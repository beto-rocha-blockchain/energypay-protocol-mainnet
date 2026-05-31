-- ─────────────────────────────────────────────────────────────────────────────
-- 018_partial_settlement_supply_cap.sql
--
-- Per-contract supply cap + partial settlement. settled_mwh accumulates the
-- energy already tokenized/settled; each settlement tranche must keep
-- settled_mwh + tranche ≤ volume_mwh (the contracted volume = the cap).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS settled_mwh NUMERIC(18, 6) NOT NULL DEFAULT 0;

-- Backfill: existing fully-settled contracts have their full volume settled, so
-- the accumulator is accurate and they can't be re-settled past the cap.
UPDATE contracts SET settled_mwh = volume_mwh WHERE status = 'SETTLED' AND settled_mwh = 0;
