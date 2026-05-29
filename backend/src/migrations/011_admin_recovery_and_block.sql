-- ─────────────────────────────────────────────────────────────────────────────
-- 011_admin_recovery_and_block.sql
--
-- Admin user-management additions:
--   1. account_status — block/unblock a user account (blocked = cannot log in).
--   2. Seed the OWNER-recovery link: every PLATFORM_OWNER becomes recoverable
--      ONLY by roberto.blockchainresources@gmail.com (the designated owner-
--      recovery agent / fail-safe). The set-password endpoint enforces this via
--      account_recovery_links for OWNER targets.
--
-- Recovery permission model (enforced in code — backend/src/routes/admin.js):
--   • common USER  → recovered only by PLATFORM_OWNER
--   • PLATFORM_ADMIN → recovered by PLATFORM_OWNER or any PLATFORM_ADMIN (admin↔admin)
--   • PLATFORM_OWNER → recovered ONLY by an account with a recovery-link to it
--                       (seeded below: roberto)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Block/unblock
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (account_status IN ('ACTIVE', 'BLOCKED'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at     TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_account_status
  ON users(account_status) WHERE account_status <> 'ACTIVE';

-- 2. Seed owner-recovery link(s): every PLATFORM_OWNER recoverable by roberto.
INSERT INTO account_recovery_links (account_id, recovery_account_id, created_by)
SELECT o.id, r.id, r.id
FROM users o
CROSS JOIN users r
WHERE o.platform_role = 'PLATFORM_OWNER'
  AND r.email = 'roberto.blockchainresources@gmail.com'
  AND o.id <> r.id
ON CONFLICT (account_id, recovery_account_id) DO NOTHING;
