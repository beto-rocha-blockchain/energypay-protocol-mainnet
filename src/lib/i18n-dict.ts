/**
 * Portuguese (pt-BR) translations, keyed by the English SOURCE string.
 *
 * Missing keys fall back to the English source, so partial coverage NEVER breaks
 * the UI — untranslated text simply renders in English until an entry is added.
 *
 * Proper nouns and technical terms are intentionally NOT translated and must be
 * kept verbatim: EnergyPay, Stellar, Stellar Mainnet, EPWR, x402, ed25519,
 * Horizon, PLD, txHash, ledger, "settlement", "clearing", etc.
 */
export const PT: Record<string, string> = {
  // ── Language gate ──
  "Choose your language": "Escolha seu idioma",

  // ── Login ──
  "Operator Access · Pilot Environment": "Acesso do operador · Ambiente piloto",
  "Programmable settlement": "Settlement programável",
  "for energy markets.": "para mercados de energia.",
  "Operator Email": "E-mail do operador",
  Password: "Senha",
  "Access Clearing Environment": "Acessar ambiente de Clearing",
  "Authenticating…": "Autenticando…",
  "Authenticated against the EnergyPay clearing backend. Sessions are scoped to this browser tab.":
    "Autenticado no backend de clearing da EnergyPay. As sessões são restritas a esta aba do navegador.",
  "First time here?": "Primeira vez aqui?",
  "Provision new settlement identity": "Provisionar nova identidade de settlement",
  "Create your operator account · ed25519 keypair · market roles":
    "Crie sua conta de operador · keypair ed25519 · papéis de mercado",
  "Guided tour · how to sign in": "Tutorial guiado · como entrar",
  "Forgot password →": "Esqueceu a senha →",
  "Operator email and password are required.": "E-mail e senha do operador são obrigatórios.",
  "Authentication failed": "Falha na autenticação",
};
