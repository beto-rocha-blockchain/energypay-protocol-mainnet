-- ─────────────────────────────────────────────────────────────────────────────
-- 006_platform_roles.sql
--
-- Introduces the internal platform-role system for admin accounts.
-- These roles are entirely separate from the market-participant roles
-- (GENERATOR, SELLER, etc.) stored in users.roles[].
--
-- Platform roles (lowest → highest privilege):
--   USER             — standard market participant (default for all existing rows)
--   ACCOUNT_RECOVERY — can reset/recover other accounts; no data access
--   PLATFORM_ADMIN   — read all users + edit profile data; commercial ops
--   PLATFORM_OWNER   — full admin: force password resets, role changes, audit
--
-- Also adds:
--   admin_audit_log       — immutable record of every admin action
--   account_recovery_links — approved recovery relationships between accounts
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Allow both wallet columns to be NULL so admin accounts can exist without
--    a Stellar wallet. Admin accounts never perform on-chain operations.
ALTER TABLE users
  ALTER COLUMN stellar_public_key       DROP NOT NULL;
ALTER TABLE users
  ALTER COLUMN stellar_secret_encrypted DROP NOT NULL;

-- 2. Platform role column (default USER for all existing rows)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'USER'
    CHECK (platform_role IN (
      'PLATFORM_OWNER',    -- Roberto Master — full platform control
      'PLATFORM_ADMIN',    -- Platform admin — commercial/ops access
      'ACCOUNT_RECOVERY',  -- Backup accounts — can recover assigned accounts
      'USER'               -- Standard market participant (default)
    ));

-- 3. Admin audit log — every admin action is written here (append-only by design)
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID        NOT NULL REFERENCES users(id),
  target_id   UUID                 REFERENCES users(id),  -- NULL for system-level actions
  action      TEXT        NOT NULL,   -- e.g. UPDATE_PROFILE, RESET_PASSWORD, SET_ROLE
  details     JSONB       NOT NULL DEFAULT '{}',           -- before/after snapshot (no secrets)
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Account recovery links — explicit "who can recover whom" relationships
CREATE TABLE IF NOT EXISTS account_recovery_links (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recovery_account_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by          UUID                 REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, recovery_account_id),
  CHECK  (account_id <> recovery_account_id)
);

-- 5. Indexes
-- Partial index — most users are 'USER', so the index stays small
CREATE INDEX IF NOT EXISTS idx_users_platform_role  ON users(platform_role) WHERE platform_role <> 'USER';
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor    ON admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target   ON admin_audit_log(target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_ts       ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_account     ON account_recovery_links(account_id);
CREATE INDEX IF NOT EXISTS idx_recovery_by_account  ON account_recovery_links(recovery_account_id);
