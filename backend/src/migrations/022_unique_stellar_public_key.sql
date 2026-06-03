-- 022_unique_stellar_public_key.sql
--
-- Enforce one account per Stellar public key at the database level — a backstop
-- behind the application-level duplicate check added in /api/auth/register for
-- USER_CONTROLLED (link existing wallet). Prevents two accounts from sharing the
-- same public key even under a race between two simultaneous registrations.
--
-- Pre-checked before applying: 100 non-null stellar_public_key values, all
-- distinct (zero duplicates), so the constraint validates existing rows cleanly.
-- NULL keys stay allowed (multiple, per the SQL standard) for accounts without a
-- wallet provisioned yet. PLATFORM_MANAGED keys are unique by construction.
--
-- Applied to Supabase project reunojgfqgcakxiqlyih via apply_migration.

ALTER TABLE public.users
  ADD CONSTRAINT users_stellar_public_key_key UNIQUE (stellar_public_key);
