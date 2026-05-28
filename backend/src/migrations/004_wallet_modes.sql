-- Migration 004: Wallet modes — PLATFORM_MANAGED / USER_CONTROLLED
-- Run this on Supabase SQL editor before deploying the new backend build.
--
-- IMPORTANT: After running this SQL migration, run the companion Node.js script:
--   node backend/src/migrations/run-004-encrypt-secrets.js
-- That script re-encrypts any plaintext secret keys still stored in the DB.

-- 1. Add wallet_mode column (default PLATFORM_MANAGED for all existing users)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wallet_mode TEXT NOT NULL DEFAULT 'PLATFORM_MANAGED'
    CHECK (wallet_mode IN ('PLATFORM_MANAGED', 'USER_CONTROLLED'));

-- 2. Add wallet_status column
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wallet_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (wallet_status IN (
      'PENDING', 'ACTIVE', 'ACCOUNT_NOT_FOUND', 'TRUSTLINE_REQUIRED',
      'PENDING_SIGNATURE', 'SIGNATURE_REQUIRED', 'READY_FOR_SETTLEMENT', 'FAILED'
    ));

-- 3. Add wallet_network column (always PUBLIC for mainnet)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wallet_network TEXT NOT NULL DEFAULT 'PUBLIC';

-- 4. Ensure all existing users are correctly classified as PLATFORM_MANAGED
--    (they all have stellar_secret_encrypted set, even if plaintext for now)
UPDATE users
  SET wallet_mode = 'PLATFORM_MANAGED'
  WHERE stellar_secret_encrypted IS NOT NULL
    AND wallet_mode != 'PLATFORM_MANAGED';

-- 5. USER_CONTROLLED users should never have a stored secret
--    (enforced at application level; this UPDATE cleans up any inconsistency)
UPDATE users
  SET stellar_secret_encrypted = NULL
  WHERE wallet_mode = 'USER_CONTROLLED';
