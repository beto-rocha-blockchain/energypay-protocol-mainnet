-- 023_add_energy_types_array.sql
--
-- Generators may operate more than one generation source (e.g. a hybrid
-- solar + wind site, or thermal + cogeneration). The single users.energy_type
-- column only captured one. This adds users.energy_types TEXT[] to hold the full
-- set the generator selects at registration, while energy_type (single) is kept
-- as the PRIMARY source (energy_types[0]) for backward-compatible readers — the
-- grid map (/api/auth/grid-participants) and legacy rows.
--
-- Additive and non-destructive: the column is nullable, existing single-value
-- rows are backfilled into a one-element array, and a CHECK keeps every element
-- within the same vocabulary as users_energy_type_check (migration 021).
--
-- Applied to Supabase project reunojgfqgcakxiqlyih via apply_migration.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS energy_types TEXT[];

-- Backfill: existing generators with a single energy_type become a 1-element array.
UPDATE public.users
   SET energy_types = ARRAY[energy_type]
 WHERE energy_type IS NOT NULL
   AND (energy_types IS NULL OR array_length(energy_types, 1) IS NULL);

-- Every element must be one of the allowed generation sources (NULL/empty allowed).
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_energy_types_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_energy_types_check
  CHECK (
    energy_types IS NULL OR energy_types <@ ARRAY[
      'SOLAR','HYDRO','SMALL_HYDRO','WIND','BIOMASS',
      'NATURAL_GAS','NUCLEAR','THERMAL','COGENERATION','GRID'
    ]::text[]
  );
