/**
 * ONS CMO fetch helper — used by the PLD oracle's ONS_CMO_BOUNDED adapter.
 *
 * Returns the CMO (Custo Marginal de Operação, R$/MWh) per submarket. CMO is the
 * BASIS for the PLD, not the PLD itself: the caller bounds it by the ANEEL
 * floor/ceiling (see pldLimits.js) to derive a PLD PROXY — never the official
 * CCEE PLD.
 *
 * Decoupled from routes/oracle.js (which keeps its own cache for the public
 * /pld feed) to avoid a circular import with pldOracleService.js.
 */

const ONS_BASE = "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/cmo_tm";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const SUBSISTEMA_MAP = { SE: "SE/CO", S: "S", NE: "NE", N: "N" };

const yearCache = {}; // { [year]: { fetchedAt, rows } }

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
      timestamp: parts[2].trim(), // BRT "YYYY-MM-DD HH:MM:SS"
      cmo: parseFloat(parts[3].trim()),
    });
  }
  return rows;
}

async function getRowsForYear(year) {
  const now = Date.now();
  const entry = yearCache[year];
  if (entry && now - entry.fetchedAt < CACHE_TTL_MS) return entry.rows;
  try {
    const rows = await fetchCmoRows(year);
    yearCache[year] = { fetchedAt: now, rows };
    return rows;
  } catch (err) {
    if (entry) return entry.rows; // stale beats nothing
    throw err;
  }
}

/**
 * CMO per submarket for a SPECIFIC date (+ optional hour), from the ONS
 * semi-hourly series. ONS timestamps are BRT "YYYY-MM-DD HH:MM:SS". With an
 * hour, averages that hour's half-hour rows; without, averages the whole day.
 * Returns found=false when that date/hour is absent from the series (e.g. a
 * future date) so the caller can fall through and the settlement can block.
 *
 * @returns {Promise<{ found: boolean, year: number, bySubmarket: Record<string, number> }>}
 */
export async function getCmoForDateHour({ referenceDate, hour = null }) {
  const datePrefix = String(referenceDate).slice(0, 10); // YYYY-MM-DD
  const year = Number(datePrefix.slice(0, 4)) || new Date().getFullYear();
  const hh = hour == null ? null : String(hour).padStart(2, "0");

  let rows;
  try {
    rows = await getRowsForYear(year);
  } catch {
    return { found: false, year, bySubmarket: {} };
  }

  const acc = {}; // submarket -> { sum, count }
  for (const r of rows) {
    if (r.timestamp.slice(0, 10) !== datePrefix) continue;
    if (hh != null && r.timestamp.slice(11, 13) !== hh) continue;
    if (!Number.isFinite(r.cmo)) continue;
    const sm = SUBSISTEMA_MAP[r.subsistema] || r.subsistema;
    if (!acc[sm]) acc[sm] = { sum: 0, count: 0 };
    acc[sm].sum += r.cmo;
    acc[sm].count += 1;
  }

  const bySubmarket = {};
  for (const [sm, v] of Object.entries(acc)) {
    bySubmarket[sm] = Math.round((v.sum / v.count) * 100) / 100;
  }
  return { found: Object.keys(bySubmarket).length > 0, year, bySubmarket };
}

/**
 * Latest CMO per submarket (most recent timestamp). For callers that want the
 * current value rather than a specific period.
 * @returns {Promise<{ updatedAt: string|null, year: number, bySubmarket: Record<string, number> }>}
 */
export async function fetchLatestCmoBySubmarket() {
  const currentYear = new Date().getFullYear();
  let rows;
  try {
    rows = await getRowsForYear(currentYear);
  } catch {
    return { updatedAt: null, year: currentYear, bySubmarket: {} };
  }
  const latestTs = rows.reduce((max, r) => (r.timestamp > max ? r.timestamp : max), "");
  const bySubmarket = {};
  for (const r of rows) {
    if (r.timestamp !== latestTs) continue;
    const sm = SUBSISTEMA_MAP[r.subsistema] || r.subsistema;
    if (Number.isFinite(r.cmo)) bySubmarket[sm] = r.cmo;
  }
  return {
    updatedAt: latestTs || null,
    year: Number((latestTs || "").slice(0, 4)) || currentYear,
    bySubmarket,
  };
}
