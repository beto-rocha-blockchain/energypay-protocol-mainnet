-- ─────────────────────────────────────────────────────────────────────────────
-- 013_add_pending_roles.sql
--
-- Privileged market roles (GENERATOR, SELLER/"Trader", UTILITY) require admin
-- approval before they become active. On registration they are parked here
-- (inactive); an admin moves them into `roles` via
-- POST /api/admin/users/:id/approve-roles. Non-privileged roles (INVESTOR,
-- USER/"Consumer") remain active immediately.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_roles TEXT[] NOT NULL DEFAULT '{}';
