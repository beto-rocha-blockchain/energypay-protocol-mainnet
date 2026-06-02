-- 020_enable_rls_public_tables.sql
--
-- Security hardening: enable Row Level Security (RLS) on the remaining public
-- tables that were exposed to the Supabase public REST API (PostgREST) without
-- it. Supabase Security Advisor flagged these as "RLS Disabled in Public"
-- (ERROR) — anyone with the anon key could read/modify every row.
--
-- Why this is safe for EnergyPay:
--   * The backend connects with the SERVICE_ROLE key, which BYPASSES RLS, so it
--     keeps full access.
--   * The frontend never talks to Supabase directly (no client / anon key in the
--     app) — all data access goes through the Express backend.
--   * Core tables (settlements, users, contracts, notifications, operators, ...)
--     already run exactly this way: RLS enabled, no policies. This migration just
--     brings the remaining tables to the same state.
--
-- Effect: with RLS enabled and NO policies, the anon/authenticated roles are
-- denied all access (public API closed) while the service_role backend is
-- unaffected. Add explicit policies only if a table ever needs direct
-- anon/authenticated access (e.g. exposing subscription_plans to the public
-- frontend without going through the backend).
--
-- Applied to Supabase project reunojgfqgcakxiqlyih via apply_migration.

ALTER TABLE public.admin_audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_payment_invoices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_payment_cards         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_tax_profile        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_certificate_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pld_snapshots              ENABLE ROW LEVEL SECURITY;
