/**
 * ANEEL PLD floor/ceiling (limites mínimo e máximo do PLD), set annually.
 *
 * PLD ("Preço de Liquidação das Diferenças") = the CMO (ONS marginal operating
 * cost) bounded by these regulatory limits, per submarket, per hour. CCEE
 * settles the official PLD; when we derive PLD from the ONS CMO feed we MUST
 * clamp it to the floor/ceiling below so it matches the regulated value.
 *
 * Source: ANEEL annual "Despacho" — PLDmín, PLDmáx estrutural, PLDmáx horário.
 * ⚠️ Update this table every year when ANEEL publishes the new limits.
 *   2025 — Despacho ANEEL nº 3.625/2024
 *   2026 — Despacho ANEEL nº 3.850/2025
 */

// R$/MWh
const PLD_LIMITS_BY_YEAR = {
  2025: { min: 58.6, maxStructural: 751.73, maxHourly: 1542.23 },
  2026: { min: 57.31, maxStructural: 785.27, maxHourly: 1611.04 },
};

// Fallback to the most recent known year if an unmapped year is requested.
const LATEST_KNOWN_YEAR = 2026;

export function getPldLimits(year) {
  return PLD_LIMITS_BY_YEAR[year] || PLD_LIMITS_BY_YEAR[LATEST_KNOWN_YEAR];
}

/**
 * Clamp a raw CMO value to the ANEEL PLD floor/ceiling (PLD horário) in force
 * for the given year. Returns the regulated PLD in R$/MWh (or null if invalid).
 */
export function boundCmoToPld(cmo, year) {
  const n = Number(cmo);
  if (!Number.isFinite(n)) return null;
  const { min, maxHourly } = getPldLimits(year);
  return Math.min(Math.max(n, min), maxHourly);
}

/** True when a price is within the ANEEL PLD floor/ceiling (PLD horário) for the year. */
export function isWithinPldLimits(priceBrl, year) {
  const n = Number(priceBrl);
  if (!Number.isFinite(n)) return false;
  const { min, maxHourly } = getPldLimits(year);
  return n >= min && n <= maxHourly;
}
