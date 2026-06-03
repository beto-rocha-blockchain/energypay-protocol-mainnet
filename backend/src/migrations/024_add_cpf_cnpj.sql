-- 024_add_cpf_cnpj.sql
--
-- The onboarding wizard captures a participant's document (CPF/CNPJ) and the
-- register handler inserts users.cpf_cnpj (the document number) alongside
-- document_type / document_name / document_path. Those document_* columns exist,
-- but the cpf_cnpj column itself was never created — so once the document-capture
-- code shipped, every registration that reached the INSERT failed with PostgREST
-- "Could not find the 'cpf_cnpj' column of 'users' in the schema cache" (PGRST204),
-- surfacing in the UI as the generic "Settlement backend error".
--
-- The graceful column-fallback retries in auth.js only cover
-- energy_type / energy_types / state / phone (and key on Postgres code 42703),
-- so this PostgREST-cache error for cpf_cnpj was never caught and returned HTTP 500.
--
-- Fix: add the missing column. Nullable TEXT — existing rows have no document
-- number (all current users have document_type NULL). Independent of energy_types
-- (migration 023); this is a pre-existing gap from the document-capture feature.
--
-- Applied to Supabase project reunojgfqgcakxiqlyih via apply_migration.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;
