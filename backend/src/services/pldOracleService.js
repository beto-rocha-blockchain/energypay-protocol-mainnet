/**
 * PLD Oracle Service — the platform's "price truth" layer.
 *
 * Responsibilities (institutional, not decorative):
 *   1. Source      — where the PLD came from (taxonomy below).
 *   2. Normalization — one internal shape: submarket, date, hour, price, unit.
 *   3. Validation  — within ANEEL floor/ceiling, complete, deduped.
 *   4. Auditability — immutable, versioned snapshots; settlement pins one.
 *
 * GOVERNANCE: the ONS-CMO-bounded value is a PLD PROXY / indicative price, NOT
 * the official CCEE PLD. `source` and `is_official` make this explicit on every
 * snapshot so UI / audit / risk can show origin, mode, freshness and official-
 * vs-proxy clearly. Settlement consumes ONLY a validated, immutable snapshot id.
 */

import crypto from "node:crypto";
import { supabase } from "../lib/supabase.js";
import { getPldLimits, boundCmoToPld, isWithinPldLimits } from "../lib/pldLimits.js";
import { fetchLatestCmoBySubmarket } from "../lib/onsCmo.js";

// Canonical PLD source taxonomy + governance metadata.
export const PLD_SOURCES = {
  CCEE_PLD_OFFICIAL: { official: true, mode: "automatic" },      // official CCEE dataset
  CCEE_CSV_OFFICIAL: { official: true, mode: "csv_upload" },      // official CSV upload
  ONS_CMO_BOUNDED: { official: false, mode: "automatic" },        // PROXY / indicative
  MANUAL_OVERRIDE: { official: false, mode: "manual_override" },  // audited manual input
  MOCK: { official: false, mode: "mock" },                        // last-resort fallback
};

const VALID_SUBMARKETS = new Set(["SE/CO", "S", "NE", "N"]);
const CCEE_API = "https://dadosabertos.ccee.org.br/api/3/action";

// EnergyPay submarket code → CCEE SUBMERCADO label used in the pld_horario dataset.
const CCEE_SUBMARKET = { "SE/CO": "SUDESTE", S: "SUL", NE: "NORDESTE", N: "NORTE" };

// Browser-like UA — CCEE's Akamai WAF 403s default clients (verified).
const CCEE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function refYear(referenceDate) {
  return Number(String(referenceDate).slice(0, 4)) || new Date().getFullYear();
}

function makeSnapshotId({ submarket, referenceDate, hour, source }) {
  const sm = submarket.replace(/[^A-Z]/gi, "").toUpperCase();
  const h = hour == null ? "D" : String(hour).padStart(2, "0");
  return `PLD-${sm}-${referenceDate}-${h}-${source}-${crypto.randomBytes(3).toString("hex")}`;
}

/** Match a row by hour, treating null correctly (Supabase .eq won't match NULL). */
function withHour(query, hour) {
  return hour == null ? query.is("hour", null) : query.eq("hour", hour);
}

/**
 * Validate + bound + persist an IMMUTABLE PLD snapshot. Returns the stored row.
 * For ONS_CMO_BOUNDED the input price is treated as CMO and clamped to ANEEL limits.
 */
export async function createSnapshot({
  submarket,
  referenceDate,
  hour = null,
  priceBrl,
  rawCmoBrl = null,
  source,
  ingestionMode = null,
  datasetVersion = null,
  ingestedBy = null,
}) {
  const meta = PLD_SOURCES[source];
  if (!meta) throw new Error(`Unknown PLD source: ${source}`);
  if (!VALID_SUBMARKETS.has(submarket)) throw new Error(`Unknown submarket: ${submarket}`);
  if (!referenceDate) throw new Error("referenceDate is required");

  const year = refYear(referenceDate);
  const limits = getPldLimits(year);

  let price = Number(priceBrl);
  if (!Number.isFinite(price)) throw new Error("priceBrl must be a number");

  // ONS proxy: input is CMO → bound to ANEEL limits to derive the PLD proxy.
  let raw = rawCmoBrl;
  if (source === "ONS_CMO_BOUNDED") {
    raw = price;
    price = boundCmoToPld(price, year);
  }

  // Validation: within ANEEL floor/ceiling (PLD horário). Outside ⇒ failed.
  const withinLimits = isWithinPldLimits(price, year);
  const status = !withinLimits
    ? "failed"
    : source === "MANUAL_OVERRIDE"
      ? "manual_override"
      : "validated";

  // A new VALID snapshot supersedes prior ones for the same (submarket, date, hour).
  if (status === "validated" || status === "manual_override") {
    await withHour(
      supabase
        .from("pld_snapshots")
        .update({ superseded: true })
        .eq("submarket", submarket)
        .eq("reference_date", referenceDate)
        .eq("superseded", false),
      hour,
    );
  }

  const row = {
    snapshot_id: makeSnapshotId({ submarket, referenceDate, hour, source }),
    submarket,
    reference_date: referenceDate,
    hour,
    price_brl: price,
    raw_cmo_brl: raw,
    unit: "BRL/MWh",
    source,
    ingestion_mode: ingestionMode || meta.mode,
    is_official: meta.official,
    status,
    pld_min_brl: limits.min,
    pld_max_brl: limits.maxHourly,
    dataset_version: datasetVersion,
    dataset_hash: crypto
      .createHash("sha256")
      .update(JSON.stringify({ submarket, referenceDate, hour, price, source }))
      .digest("hex")
      .slice(0, 32),
    ingested_by: ingestedBy,
  };

  const { data, error } = await supabase.from("pld_snapshots").insert(row).select().single();
  if (error) throw new Error(`Snapshot persist failed: ${error.message}`);
  return data;
}

export async function getSnapshot(id) {
  const { data, error } = await supabase.from("pld_snapshots").select("*").eq("id", id).single();
  if (error) return null;
  return data;
}

/** Latest non-superseded VALIDATED snapshot for a key; prefers official over proxy. */
export async function getLatestValidatedSnapshot({ submarket, referenceDate, hour = null }) {
  const { data, error } = await withHour(
    supabase
      .from("pld_snapshots")
      .select("*")
      .eq("submarket", submarket)
      .eq("reference_date", referenceDate)
      .eq("superseded", false)
      .in("status", ["validated", "manual_override"])
      .order("is_official", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
    hour,
  );
  if (error || !data || !data.length) return null;
  return data[0];
}

export async function listSnapshots({ submarket = null, referenceDate = null, limit = 100 } = {}) {
  let q = supabase.from("pld_snapshots").select("*").order("created_at", { ascending: false }).limit(limit);
  if (submarket) q = q.eq("submarket", submarket);
  if (referenceDate) q = q.eq("reference_date", referenceDate);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Fetch the OFFICIAL CCEE PLD from the Dados Abertos CKAN portal (pld_horario).
 *
 * Verified schema — resource `pld_horario_<year>`, fields: MES_REFERENCIA
 * (YYYYMM), SUBMERCADO (SUDESTE|SUL|NORDESTE|NORTE), DIA, HORA (0-23),
 * PLD_HORA (R$/MWh).
 *
 * ⚠️ CCEE's Akamai WAF 403s default clients; a browser User-Agent is required,
 * and even then datacenter IPs (e.g. Vercel) are blocked — this works from a
 * BR/residential or allowlisted egress. On ANY failure it throws so callers
 * fall back to the ONS proxy.
 */
export async function fetchCceeOfficial({ submarket, referenceDate, hour }) {
  const cceeSm = CCEE_SUBMARKET[submarket];
  if (!cceeSm) throw new Error(`CCEE: unmapped submarket ${submarket}`);
  if (hour == null) throw new Error("CCEE official PLD is hourly; hour is required");

  const date = String(referenceDate);
  const year = date.slice(0, 4);
  const mesRef = date.slice(0, 4) + date.slice(5, 7);
  const dayPadded = date.slice(8, 10);
  const dayPlain = String(Number(dayPadded));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  const headers = { Accept: "application/json", "User-Agent": CCEE_UA };
  try {
    const pkgRes = await fetch(`${CCEE_API}/package_show?id=pld_horario`, { signal: controller.signal, headers });
    if (!pkgRes.ok) throw new Error(`CCEE package_show HTTP ${pkgRes.status}`);
    const pkg = await pkgRes.json();
    const resource = (pkg?.result?.resources || []).find((r) => r.name === `pld_horario_${year}`);
    if (!resource?.id) throw new Error(`CCEE: no resource pld_horario_${year}`);

    const filters = encodeURIComponent(
      JSON.stringify({ SUBMERCADO: cceeSm, MES_REFERENCIA: mesRef, HORA: Number(hour) }),
    );
    const dsRes = await fetch(
      `${CCEE_API}/datastore_search?resource_id=${resource.id}&filters=${filters}&limit=100`,
      { signal: controller.signal, headers },
    );
    if (!dsRes.ok) throw new Error(`CCEE datastore_search HTTP ${dsRes.status}`);
    const ds = await dsRes.json();
    const records = ds?.result?.records || [];
    const rec = records.find((r) => String(r.DIA) === dayPlain || String(r.DIA) === dayPadded);
    if (!rec) throw new Error(`CCEE: no record for ${submarket} ${date} h${hour} (${records.length} rows)`);

    const priceBrl = Number(String(rec.PLD_HORA).replace(",", "."));
    if (!Number.isFinite(priceBrl)) throw new Error("CCEE: PLD_HORA not parseable");
    return { priceBrl, datasetVersion: `${resource.name}#${rec._id ?? ""}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a VALIDATED, immutable snapshot for a submarket/date/hour. Order:
 *   1. existing validated snapshot (covers CCEE/CSV/manual already ingested);
 *   2. CCEE official (live CKAN — usually 403 from datacenter egress → falls through);
 *   3. ONS CMO bounded by ANEEL limits — PROXY (works from datacenter egress);
 *   4. MOCK — only when allowMock (demo); otherwise returns null and settlement blocks.
 */
export async function resolveValidatedSnapshot({
  submarket,
  referenceDate,
  hour = null,
  allowMock = false,
  ingestedBy = null,
}) {
  const existing = await getLatestValidatedSnapshot({ submarket, referenceDate, hour });
  if (existing) return existing;

  try {
    const off = await fetchCceeOfficial({ submarket, referenceDate, hour });
    if (off && Number.isFinite(Number(off.priceBrl))) {
      return await createSnapshot({
        submarket,
        referenceDate,
        hour,
        priceBrl: off.priceBrl,
        source: "CCEE_PLD_OFFICIAL",
        datasetVersion: off.datasetVersion || null,
        ingestedBy,
      });
    }
  } catch (err) {
    console.warn("[pldOracle] CCEE official unavailable, falling back to ONS proxy:", err.message);
  }

  try {
    const ons = await fetchLatestCmoBySubmarket();
    const cmo = ons.bySubmarket?.[submarket];
    if (Number.isFinite(cmo)) {
      return await createSnapshot({
        submarket,
        referenceDate,
        hour,
        priceBrl: cmo,
        source: "ONS_CMO_BOUNDED",
        datasetVersion: ons.updatedAt || null,
        ingestedBy,
      });
    }
  } catch (err) {
    console.warn("[pldOracle] ONS proxy unavailable:", err.message);
  }

  if (allowMock) {
    const limits = getPldLimits(refYear(referenceDate));
    const demo = Math.round(((limits.min + limits.maxHourly) / 8) * 100) / 100;
    return await createSnapshot({
      submarket,
      referenceDate,
      hour,
      priceBrl: demo,
      source: "MOCK",
      ingestedBy,
    });
  }

  return null; // settlement must block: no validated PLD snapshot available
}
