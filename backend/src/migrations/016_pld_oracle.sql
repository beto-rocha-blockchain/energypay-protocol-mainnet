-- ─────────────────────────────────────────────────────────────────────────────
-- 016_pld_oracle.sql
--
-- PLD Oracle — validated, versioned, IMMUTABLE PLD snapshots.
--
-- Institutional rule: a settlement never uses "the current PLD"; it pins a
-- specific snapshot (contracts.pld_snapshot_id) so any liquidation can be
-- re-audited later against the exact PLD value, source, mode and version used.
--
-- Source pipeline: CCEE Dados Abertos / ONS CMO (bounded by ANEEL limits) /
-- CSV upload / manual override / mock  →  normalize → validate → snapshot.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pld_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id     TEXT UNIQUE,                       -- audit id, e.g. PLD-SECO-2026-05-31-14
  submarket       TEXT NOT NULL,                      -- SE/CO | S | NE | N
  reference_date  DATE NOT NULL,
  hour            INTEGER,                            -- 0..23 (NULL = daily/aggregate)
  price_brl       NUMERIC(18, 2) NOT NULL,            -- PLD R$/MWh (already bounded)
  raw_cmo_brl     NUMERIC(18, 2),                     -- CMO before bounding (audit trail)
  unit            TEXT NOT NULL DEFAULT 'BRL/MWh',
  source          TEXT NOT NULL,                      -- CCEE_DADOS_ABERTOS | ONS_CMO_BOUNDED | CSV_UPLOAD | MANUAL | MOCK
  ingestion_mode  TEXT NOT NULL,                      -- automatic | csv_upload | manual_override | mock
  is_official     BOOLEAN NOT NULL DEFAULT FALSE,     -- TRUE only for CCEE_PLD_OFFICIAL / CCEE_CSV_OFFICIAL
  status          TEXT NOT NULL DEFAULT 'pending',    -- validated | stale | failed | pending | manual_override
  pld_min_brl     NUMERIC(18, 2),                     -- ANEEL limits in force when snapshotted
  pld_max_brl     NUMERIC(18, 2),
  dataset_version TEXT,
  dataset_hash    TEXT,                               -- integrity hash of the source batch
  superseded      BOOLEAN NOT NULL DEFAULT FALSE,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingested_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pld_snapshots_lookup
  ON pld_snapshots (submarket, reference_date, hour, status);

-- Patch pre-existing pld_snapshots tables (is_official added after initial create).
ALTER TABLE pld_snapshots ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT FALSE;

-- The PLD snapshot a contract settlement was pinned to (audit anchor).
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pld_snapshot_id UUID REFERENCES pld_snapshots(id);
