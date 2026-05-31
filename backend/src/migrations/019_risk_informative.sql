-- ─────────────────────────────────────────────────────────────────────────────
-- 019_risk_informative.sql
--
-- Risk is now INFORMATIVE: EPWR = energy, not collateral, so settlement is never
-- blocked for collateral — only objective violations (missing/invalid PLD
-- snapshot, supply cap exceeded, invalid contract) block. Store the financial
-- exposure (volume × PLD) and an informational risk band for the UI / audit.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS exposure_brl NUMERIC(18, 2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS risk_band    TEXT;   -- LOW | MEDIUM | HIGH | UNKNOWN
