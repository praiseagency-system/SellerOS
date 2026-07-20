// GMV Max — PARITY TOOLING (Phase 2, Part 10).
// Bandingkan snapshot KANONIK (A: upload manual / import) vs snapshot SHADOW
// (B: read-only MCP) per workspace/tanggal/campaign. READ-ONLY: tooling ini
// TIDAK menulis apa pun & TIDAK menimpa data kanonik — hanya mengklasifikasi.
//
// Prinsip drift GMV Max (terbukti runtime Phase 0/DESIGN.md):
//   - `cost`/`net_cost` = spend, IMMUTABLE → beda di luar toleransi = HARD_MISMATCH.
//   - `gross_revenue`/`orders`/ROI bisa NAIK dalam attribution window → kenaikan
//     wajar (B ≥ A) = LATE_ATTRIBUTION_DRIFT, bukan mismatch.
//   - Setting campaign (budget/target ROI/auto-budget/promotion/accelerate) =
//     current-state → beda = MAPPING_MISMATCH (bukan drift metrik).

export const PARITY_CLASS = Object.freeze({
  MATCH: 'MATCH',
  ACCEPTABLE_DRIFT: 'ACCEPTABLE_DRIFT',
  LATE_ATTRIBUTION_DRIFT: 'LATE_ATTRIBUTION_DRIFT',
  MISSING_IN_API: 'MISSING_IN_API',       // ada di import (A), tak ada di MCP (B)
  MISSING_IN_IMPORT: 'MISSING_IN_IMPORT', // ada di MCP (B), tak ada di import (A)
  PAGINATION_INCOMPLETE: 'PAGINATION_INCOMPLETE',
  MAPPING_MISMATCH: 'MAPPING_MISMATCH',
  HARD_MISMATCH: 'HARD_MISMATCH',
})

// Kategori field.
const IMMUTABLE_SPEND = new Set(['cost', 'net_cost'])
const GROWABLE = new Set(['gross_revenue', 'orders', 'roi', 'roas']) // boleh naik (late attribution)
const SETTING = new Set(['budget', 'target_roi', 'roas_bid', 'auto_budget', 'promotion_days', 'accelerate_testing'])

const num = (v) => (v == null || v === '' ? null : Number(v))
const rel = (a, b) => (a === 0 ? (b === 0 ? 0 : 1) : Math.abs(b - a) / Math.abs(a))

// Klasifikasi SATU field. opts.tolerance = drift relatif yang diterima (default 2%).
export function classifyMetric(field, oldVal, newVal, { tolerance = 0.02, incomplete = false } = {}) {
  if (incomplete) return PARITY_CLASS.PAGINATION_INCOMPLETE
  const a = num(oldVal), b = num(newVal)
  if (a == null && b == null) return PARITY_CLASS.MATCH
  if (a == null) return PARITY_CLASS.MISSING_IN_IMPORT
  if (b == null) return PARITY_CLASS.MISSING_IN_API

  // Setting current-state → boolean/exact.
  if (SETTING.has(field)) {
    if (typeof oldVal === 'boolean' || typeof newVal === 'boolean') return oldVal === newVal ? PARITY_CLASS.MATCH : PARITY_CLASS.MAPPING_MISMATCH
    return a === b ? PARITY_CLASS.MATCH : (rel(a, b) <= tolerance ? PARITY_CLASS.ACCEPTABLE_DRIFT : PARITY_CLASS.MAPPING_MISMATCH)
  }

  const d = rel(a, b)
  if (d <= tolerance) return PARITY_CLASS.MATCH
  if (IMMUTABLE_SPEND.has(field)) return PARITY_CLASS.HARD_MISMATCH // spend tak boleh drift
  if (GROWABLE.has(field)) {
    // Kenaikan wajar dalam window (B ≥ A) → late attribution. Turun signifikan = hard.
    if (b >= a) return PARITY_CLASS.LATE_ATTRIBUTION_DRIFT
    return d <= tolerance * 3 ? PARITY_CLASS.ACCEPTABLE_DRIFT : PARITY_CLASS.HARD_MISMATCH
  }
  return d <= tolerance * 2 ? PARITY_CLASS.ACCEPTABLE_DRIFT : PARITY_CLASS.HARD_MISMATCH
}

// Bandingkan satu campaign (A vs B) untuk daftar field metrik + setting.
// old/new = objek datar { cost, net_cost, gross_revenue, orders, roi, creativeCount,
//   spendingCreativeCount, product_impressions, product_clicks, ctr, cvr,
//   status_distribution, budget, target_roi, auto_budget, promotion_days, accelerate_testing }.
const DEFAULT_FIELDS = [
  'cost', 'net_cost', 'gross_revenue', 'orders', 'roi',
  'creativeCount', 'spendingCreativeCount', 'product_impressions', 'product_clicks', 'ctr', 'cvr',
  'budget', 'target_roi', 'auto_budget', 'promotion_days', 'accelerate_testing',
]
export function buildParityRow({ campaignId, old, shadow, fields = DEFAULT_FIELDS, tolerance = 0.02, incompleteFields = new Set() }) {
  const cells = {}
  let worst = PARITY_CLASS.MATCH
  const severity = { MATCH: 0, ACCEPTABLE_DRIFT: 1, LATE_ATTRIBUTION_DRIFT: 2, MISSING_IN_API: 3, MISSING_IN_IMPORT: 3, MAPPING_MISMATCH: 4, PAGINATION_INCOMPLETE: 5, HARD_MISMATCH: 6 }
  for (const f of fields) {
    const cls = classifyMetric(f, old?.[f], shadow?.[f], { tolerance, incomplete: incompleteFields.has(f) })
    cells[f] = { old: old?.[f] ?? null, new: shadow?.[f] ?? null, class: cls }
    if (severity[cls] > severity[worst]) worst = cls
  }
  return { campaignId, worst, cells }
}

// Dataset parity workspace/tanggal: daftar campaign (union A∪B).
export function buildParityDataset({ workspaceId, date, canonicalByCampaign = {}, shadowByCampaign = {}, tolerance = 0.02, incompleteCampaigns = new Set() }) {
  const ids = new Set([...Object.keys(canonicalByCampaign), ...Object.keys(shadowByCampaign)])
  const rows = []
  for (const id of ids) {
    rows.push(buildParityRow({
      campaignId: id, old: canonicalByCampaign[id], shadow: shadowByCampaign[id],
      tolerance, incompleteFields: incompleteCampaigns.has(id) ? new Set(['cost', 'gross_revenue', 'orders']) : new Set(),
    }))
  }
  const dist = {}
  for (const r of rows) dist[r.worst] = (dist[r.worst] || 0) + 1
  const hard = rows.filter(r => r.worst === PARITY_CLASS.HARD_MISMATCH || r.worst === PARITY_CLASS.MAPPING_MISMATCH).length
  const matchRate = rows.length ? (rows.filter(r => r.worst === PARITY_CLASS.MATCH || r.worst === PARITY_CLASS.LATE_ATTRIBUTION_DRIFT || r.worst === PARITY_CLASS.ACCEPTABLE_DRIFT).length / rows.length) : 1
  return { workspaceId, date, rows, distribution: dist, hardMismatchCount: hard, matchRate }
}
