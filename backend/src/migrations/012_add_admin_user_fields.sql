-- ─────────────────────────────────────────────────────────────────────────────
-- 012_add_admin_user_fields.sql
--
-- The admin panel query (USER_SELECT in backend/src/routes/admin.js) and the
-- frontend AdminUser type reference columns that did not exist on the users
-- table, causing "column users.state does not exist" on user search/list.
--
-- Add them (additive, idempotent):
--   • state      — Brazilian state abbreviation (e.g. SP/MG/RS), used for the
--                  ANEEL submarket (submercado) mapping.
--   • funded     — wallet funded flag surfaced in the admin user view.
--   • updated_at — last profile-update timestamp.
--
-- NOTE: the cleanup-inactive-users endpoint previously selected a nonexistent
-- `stellar_funded` column; that dead select was removed in code (it was unused).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS state      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS funded     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
