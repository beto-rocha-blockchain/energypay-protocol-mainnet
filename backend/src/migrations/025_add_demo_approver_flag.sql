-- 025_add_demo_approver_flag.sql
--
-- Scoped DEMO capability (NOT a platform role). A user flagged demo_approver can
-- approve ANY contract — force-approving every pending party so a live demo never
-- stalls waiting on a counterparty (see the approve handler in
-- backend/src/routes/contracts.js). It deliberately does NOT grant platform-admin
-- access.
--
-- The capability is also gated at RUNTIME by the DEMO_MODE env var: setting
-- DEMO_MODE=false disables it globally without any DB change.
--
-- ⚠️ DEMO / EVENT ONLY. Disable before any production use, via either:
--     UPDATE users SET demo_approver = false;     -- data-level kill switch
--     # or set DEMO_MODE=false in the backend environment   -- runtime kill switch
--
-- Applied to Supabase project reunojgfqgcakxiqlyih via apply_migration
-- (migration name: add_demo_approver_flag). This file makes the schema change
-- reproducible from a clean checkout.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS demo_approver boolean NOT NULL DEFAULT false;
