-- ─────────────────────────────────────────────────────────────────────────────
-- 007_verification_tokens.sql
--
-- Moves all in-memory token/code storage to the database so that Vercel
-- serverless function instances share state correctly.
--
-- Fixes:
--   • Phone verification codes (phoneVerificationCodes Map → users columns)
--   • Password reset tokens (resetTokens Map → password_reset_tokens table)
--   • Password reset phone OTPs (resetPhoneCodes Map → password_reset_tokens columns)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Phone verification codes — stored directly on the user row.
--    A single active code per user is all that's ever needed.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verification_code       TEXT,
  ADD COLUMN IF NOT EXISTS phone_verification_expires_at TIMESTAMPTZ;

-- 2. Password reset tokens table.
--    Stores the reset token plus the optional phone OTP step.
--    hashed_password is written in step 1 (POST /reset-password) and committed
--    only after the phone OTP is confirmed (POST /reset-password/confirm-phone).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token                  TEXT        PRIMARY KEY,
  user_id                UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at             TIMESTAMPTZ NOT NULL,
  -- Phone OTP step (populated when user has a verified phone)
  phone_code             TEXT,
  phone_code_expires_at  TIMESTAMPTZ,
  hashed_password        TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_prt_user_id    ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_prt_expires_at ON password_reset_tokens(expires_at);

-- 4. Auto-cleanup: delete tokens older than 2 hours (Postgres cron or periodic vacuum).
--    For Vercel / Supabase deployments we rely on explicit DELETEs in the app code
--    plus the fact that we always check expires_at before trusting a token.
--    This statement is idempotent — it deletes expired rows if any exist on migration run.
DELETE FROM password_reset_tokens WHERE expires_at < NOW();
