/**
 * Market context configuration — single source of truth for
 * country-specific energy market data throughout the platform.
 *
 * The platform detects the operator's market from their country field
 * and adapts labels, currencies, regulatory references, and sub-market
 * breakdowns accordingly.
 */

export type SubMarket = {
  /** ONS/clearing-house subsystem code */
  id: string;
  /** Short display label shown in badges and chart legends */
  label: string;
  /** Full official region name */
  name: string;
  /** Chart colour (oklch) */
  color: string;
};

export type MarketConfig = {
  /** ISO 3166-1 alpha-2 country code */
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
  energyUnit: string;
  /** BCP-47 locale for number/date formatting */
  locale: string;
  referencePrice: {
    /** Short label used in UI (e.g. "PLD") */
    label: string;
    fullName: string;
    /** Marginal cost label (e.g. "CMO") */
    costLabel: string;
    costFullName: string;
    source: string;
    sourceUrl: string;
  };
  clearingHouse: {
    name: string;
    fullName: string;
    url: string;
  };
  regulator: {
    name: string;
    fullName: string;
    url: string;
  };
  gridOperator: {
    name: string;
    fullName: string;
    url: string;
  };
  /** Energy sub-markets / pricing zones in display order */
  subMarkets: SubMarket[];
  /** Pre-settlement horizon (e.g. "D+1") */
  settlementCycle: string;
  /** End-of-day clearing window (e.g. "17:00 BRT") */
  settlementWindow: string;
  /** Human-readable market type name */
  marketType: string;
};

// ─── Brazil ───────────────────────────────────────────────────────────────────
// CCEE (Câmara de Comercialização de Energia Elétrica)
// ONS (Operador Nacional do Sistema Elétrico)
// 4 sub-markets: NE, N, SE/CO (Sudeste + Centro-Oeste combined), S

export const BRAZIL_MARKET: MarketConfig = {
  code: "BR",
  name: "Brazil",
  currency: "BRL",
  currencySymbol: "R$",
  energyUnit: "MWh",
  locale: "pt-BR",
  referencePrice: {
    label: "PLD",
    fullName: "Preço de Liquidação das Diferenças",
    costLabel: "CMO",
    costFullName: "Custo Marginal de Operação",
    source: "ONS",
    sourceUrl: "https://dados.ons.org.br/dataset/cmo-semi-horario",
  },
  clearingHouse: {
    name: "CCEE",
    fullName: "Câmara de Comercialização de Energia Elétrica",
    url: "https://www.ccee.org.br",
  },
  regulator: {
    name: "ANEEL",
    fullName: "Agência Nacional de Energia Elétrica",
    url: "https://www.gov.br/aneel",
  },
  gridOperator: {
    name: "ONS",
    fullName: "Operador Nacional do Sistema Elétrico",
    url: "https://www.ons.org.br",
  },
  // Brazil has 4 pricing sub-markets. SE/CO is a single combined zone
  // (Sudeste + Centro-Oeste) — there is no separate Centro-Oeste zone.
  subMarkets: [
    { id: "NE", label: "NE",    name: "Nordeste",              color: "oklch(0.66 0.22 25)" },
    { id: "N",  label: "N",     name: "Norte",                 color: "oklch(0.82 0.16 75)" },
    { id: "SE", label: "SE/CO", name: "Sudeste/Centro-Oeste",  color: "oklch(0.78 0.13 215)" },
    { id: "S",  label: "S",     name: "Sul",                   color: "oklch(0.76 0.16 150)" },
  ],
  settlementCycle: "D+1",
  settlementWindow: "17:00 BRT",
  marketType: "Mercado Livre de Energia (MLE)",
};

// ─── Generic / International fallback ────────────────────────────────────────

export const DEFAULT_MARKET: MarketConfig = {
  code: "INTL",
  name: "International",
  currency: "USD",
  currencySymbol: "$",
  energyUnit: "MWh",
  locale: "en-US",
  referencePrice: {
    label: "Market Price",
    fullName: "Wholesale Market Reference Price",
    costLabel: "Spot",
    costFullName: "Spot Market Price",
    source: "Market Operator",
    sourceUrl: "",
  },
  clearingHouse: {
    name: "Clearing House",
    fullName: "Energy Clearing House",
    url: "",
  },
  regulator: {
    name: "Regulator",
    fullName: "Energy Regulatory Authority",
    url: "",
  },
  gridOperator: {
    name: "Grid Operator",
    fullName: "National Grid Operator",
    url: "",
  },
  subMarkets: [],
  settlementCycle: "D+1",
  settlementWindow: "EOD",
  marketType: "Wholesale Energy Market",
};

// ─── Country → Market lookup ──────────────────────────────────────────────────

const MARKET_BY_COUNTRY: Record<string, MarketConfig> = {
  // Brazil — accept ISO alpha-2, alpha-3, and common name variants
  BR: BRAZIL_MARKET,
  BRA: BRAZIL_MARKET,
  BRAZIL: BRAZIL_MARKET,
  BRASIL: BRAZIL_MARKET,
};

/**
 * Return the market configuration for the given country code or name.
 * Falls back to DEFAULT_MARKET for unknown/unsupported markets.
 */
export function getMarketConfig(country?: string | null): MarketConfig {
  if (!country) return DEFAULT_MARKET;
  const key = country.trim().toUpperCase();
  return MARKET_BY_COUNTRY[key] ?? DEFAULT_MARKET;
}

/**
 * Find the sub-market entry that matches a given subsystem code.
 * Returns undefined if not found (caller should fall back gracefully).
 */
export function findSubMarket(
  market: MarketConfig,
  subsistema: string,
): SubMarket | undefined {
  return market.subMarkets.find(
    (sm) => sm.id.toUpperCase() === subsistema.toUpperCase(),
  );
}
