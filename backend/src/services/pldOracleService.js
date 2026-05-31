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
 * Best-effort fetch of the OFFICIAL CCEE PLD from the Dados Abertos CKAN portal.
 *
 * ⚠️ Two caveats, both known: (1) the portal sits behind an Akamai WAF that 403s
 * datacenter IPs (e.g. Vercel), so this will usually throw in production until we
 * have a Brazilian/allowlisted egress; (2) the exact dataset field names are not
 * yet verified from a non-blocked egress, so extraction is defensive. On ANY
 * failure this throws so callers fall back to the ONS proxy.
 */
export async function fetchCceeOfficial({ submarket, referenceDate, hour }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  const headers = { Accept: "application/json", "User-Agent": "Mozilla/5.0 EnergyPay-Oracle" };
  try {
    const pkgRes = await fetch(`${CCEE_API}/package_show?id=pld_horario`, { signal: controller.signal, headers });
    if (!pkgRes.ok) throw new Error(`CCEE package_show HTTP ${pkgRes.status}`);
    const pkg = await pkgRes.json();
    const resources = pkg?.result?.resources || [];
    const resourceId =
      resources.find((r) => /datastore|csv/i.test(`${r.format || ""}${r.datastore_active || ""}`))?.id ||
      resources[0]?.id;
    if (!resourceId) throw new Error("CCEE: no datastore resource on pld_horario");

    const dsRes = await fetch(
      `${CCEE_API}/datastore_search?resource_id=${encodeURIComponent(resourceId)}&limit=5000`,
      { signal: controller.signal, headers },
    );
    if (!dsRes.ok) throw new Error(`CCEE datastore_search HTTP ${dsRes.status}`);
    const ds = await dsRes.json();
    const records = ds?.result?.records || [];
    if (!records.length) throw new Error("CCEE: empty datastore result");

    // Defensive field mapping — confirm column names once a non-blocked egress exists.
    const pick = (rec, names) => {
      for (const n of names) {
        const key = Object.keys(rec).find((k) => k.toLowerCase() === n);
        if (key != null && rec[key] != null && rec[key] !== "") return rec[key];
      }
      return undefined;
    };
    const SM = ["submercado", "nom_submercado", "submarket", "id_submercado"];
    const PR = ["pld", "preco", "valor", "vlr_pld", "preco_pld", "val_pld"];
    const DT = ["data", "din_referencia", "data_referencia", "dat_referencia", "din_instante"];
    const HR = ["hora", "num_hora", "hour", "patamar"];

    const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z]/g, "");
    const wantSm = norm(submarket);
    const match = records.find((rec) => {
      const sm = norm(pick(rec, SM));
      const dt = String(pick(rec, DT) ?? "").slice(0, 10);
      const hr = pick(rec, HR);
      const smOk = sm.includes(wantSm) || wantSm.includes(sm);
      const dtOk = !referenceDate || dt === String(referenceDate).slice(0, 10);
      const hrOk = hour == null || String(hr) === String(hour);
      return smOk && dtOk && hrOk;
    });
    if (!match) throw new Error("CCEE: no record matched submarket/date/hour");
    const priceBrl = Number(String(pick(match, PR)).replace(",", "."));
    if (!Number.isFinite(priceBrl)) throw new Error("CCEE: price field not parseable");
    return { priceBrl, datasetVersion: ds?.result?.resource_id || resourceId };
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
