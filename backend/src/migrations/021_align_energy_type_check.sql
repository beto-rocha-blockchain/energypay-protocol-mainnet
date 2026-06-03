-- 021_align_energy_type_check.sql
--
-- Fix: register (PLATFORM_MANAGED) returned HTTP 500 for a GENERATOR whose
-- generation source was SMALL_HYDRO / BIOMASS / NATURAL_GAS / NUCLEAR /
-- COGENERATION. The users.energy_type CHECK constraint only allowed
-- SOLAR/HYDRO/WIND/THERMAL/GRID, but the onboarding generation-source picker
-- (register.tsx §03b) and the backend VALID_ENERGY_TYPES (auth.js) both offer
-- 10 types. The mismatched value violated the CHECK → insert failed → 500.
--
-- This aligns the DB constraint with the code. NULL stays allowed (non-
-- generators). The new list is a superset of the old, so all existing rows pass.
--
-- Applied to Supabase project reunojgfqgcakxiqlyih via apply_migration.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_energy_type_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_energy_type_check
  CHECK (
    energy_type IS NULL OR energy_type = ANY (ARRAY[
      'SOLAR','HYDRO','SMALL_HYDRO','WIND','BIOMASS','NATURAL_GAS','NUCLEAR','THERMAL','COGENERATION','GRID'
    ]::text[])
  );
