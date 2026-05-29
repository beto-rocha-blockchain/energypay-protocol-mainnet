-- =====================================================================
-- 010_admin_role.sql
-- Allow the internal "ADMIN" participant role on users.roles[].
--
-- ADMIN is a platform-administrator LABEL role. It is hidden from public
-- signup (the frontend role list filters it out and the backend register
-- route's ALLOWED_ROLES excludes it, so it can never be self-assigned).
-- It is granted only via privileged DB / admin provisioning.
--
-- The users.roles column has a CHECK constraint (users_roles_check) that
-- enumerates the permitted role values and did NOT include ADMIN, so any
-- attempt to add it failed with: violates check constraint "users_roles_check".
-- This migration widens that constraint and then grants ADMIN to platform
-- administrators. Idempotent — safe to run multiple times.
-- =====================================================================

-- 1. Widen the role check constraint to include ADMIN.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_check;
ALTER TABLE users ADD CONSTRAINT users_roles_check
  CHECK (roles <@ ARRAY[
    'GENERATOR',
    'SELLER',
    'INVESTOR',
    'USER',
    'UTILITY',
    'REGULATORY_AUTHORITY',
    'ADMIN'
  ]::text[]);

-- 2. Grant the ADMIN role to all platform administrators (idempotent).
--    platform_role <> 'USER' covers PLATFORM_OWNER / PLATFORM_ADMIN /
--    ACCOUNT_RECOVERY. Adjust the WHERE clause if you want to target
--    specific accounts only.
UPDATE users
SET roles = array_append(roles, 'ADMIN')
WHERE platform_role <> 'USER'
  AND NOT ('ADMIN' = ANY(roles));
