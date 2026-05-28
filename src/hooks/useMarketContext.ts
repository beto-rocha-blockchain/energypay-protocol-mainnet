import { useOperator } from "@/store/operator";
import { getMarketConfig, type MarketConfig } from "@/lib/market";

/**
 * Returns the energy market configuration for the currently authenticated
 * operator, derived from their `country` field.
 *
 * No async calls — purely derived from the already-loaded operator state.
 * Defaults to the international fallback when the country is not recognised.
 */
export function useMarketContext(): MarketConfig {
  const country = useOperator((s) => s.operator?.country);
  return getMarketConfig(country);
}
