-- ─────────────────────────────────────────────────────────────────────────────
-- 017_settlement_pld_pin.sql
--
-- Pin a validated PLD snapshot to each settlement (audit anchor), and store the
-- PLD reference coordinates a contract settles against. Settlement resolves a
-- validated snapshot from the PLD Oracle and never reads "the current PLD".
-- (contracts.pld_snapshot_id was already added in migration 016.)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE contracts   ADD COLUMN IF NOT EXISTS submarket       TEXT;      -- SE/CO | S | NE | N
ALTER TABLE contracts   ADD COLUMN IF NOT EXISTS settlement_hour INTEGER;   -- 0..23 PLD reference hour
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS pld_snapshot_id UUID REFERENCES pld_snapshots(id);
