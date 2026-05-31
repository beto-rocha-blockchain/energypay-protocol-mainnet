/**
 * ONS CMO fetch helper — used by the PLD oracle's ONS_CMO_BOUNDED adapter.
 *
 * Returns the latest CMO (Custo Marginal de Operação, R$/MWh) per submarket.
 * CMO is the BASIS for the PLD, not the PLD itself: the caller bounds it by the
 * ANEEL floor/ceiling (see pldLimits.js) to derive a PLD PROXY — never the
 * official CCEE PLD.
 *
 * Decoupled from routes/oracle.js (which keeps its own cache for the public
 * /pld feed) to avoid a circular import with pldOracleService.js.
 */

const ONS_BASE = "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/cmo_tm";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const SUBSISTEMA_MAP = { SE: "SE/CO", S: "S", NE: "NE", N: "N" };

let cache = null; // { fetchedAt, value }

async function fetchCmoRows(year) {
  const url = `${ONS_BASE}/CMO_SEMIHORARIO_${year}.csv`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`ONS returned HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split("\n");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(";");
    if (parts.length < 4) continue;
    rows.push({
      subsistema: parts[0].trim(),
      timestamp: parts[2].trim(),
      cmo: parseFloat(parts[3].trim()),
    });
  }
  return rows;
}

/**
 * Latest CMO per submarket.
 * @returns {Promise<{ updatedAt: string|null, year: number, bySubmarket: Record<string, number> }>}
 * Throws if ONS is unreachable and there is no cached value.
 */
export async function fetchLatestCmoBySubmarket() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.value;

  const currentYear = new Date().getFullYear();
  const rows = await fetchCmoRows(currentYear);
  const latestTs = rows.reduce((max, r) => (r.timestamp > max ? r.timestamp : max), "");

  const bySubmarket = {};
  for (const r of rows) {
    if (r.timestamp !== latestTs) continue;
    const sm = SUBSISTEMA_MAP[r.subsistema] || r.subsistema;
    if (Number.isFinite(r.cmo)) bySubmarket[sm] = r.cmo;
  }

  const value = {
    updatedAt: latestTs || null,
    year: Number((latestTs || "").slice(0, 4)) || currentYear,
    bySubmarket,
  };
  cache = { fetchedAt: now, value };
  return value;
}
