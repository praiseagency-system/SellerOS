// GMV Max — CANONICAL DAILY FACTS (Phase 3A Increment 2A).
// Implements docs/gmvmax-skills/01 §9 + 02 §8 + 91 (data dependency).
//
// Pure & deterministic. NO TikTok call, NO canonical write, NO LLM, NO DB.
// Workspace- & date-scoped. Idempotent. NULL ≠ ZERO: unavailable stays null
// (measurement_label UNKNOWN); a legitimate zero stays zero (MEASURED).
//
// Input is CANONICAL DATA ONLY, already loaded by the caller (readers live in
// src/data/gmvmaxImports.js etc.). This module never touches the network/DB so
// it is trivially testable and reproducible.
import { MeasurementLabel as ML, ScopeType } from './contract.mjs'

// ── Status classification (English-normalized; missing ≠ inactive) ───────────
const DELIVERING = new Set(['DELIVERING'])
const LEARNING = new Set(['LEARNING'])
const INACTIVE = new Set(['NOT_ACTIVE', 'NOT_DELIVERING', 'EXCLUDED', 'REJECTED', 'UNAVAILABLE', 'INACTIVE'])
const normStatus = (s) => (s == null || s === '' ? null : String(s).toUpperCase().trim().replace(/\s+/g, '_'))

// ── Number helpers (null-aware) ──────────────────────────────────────────────
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)
// Sum a key across rows. No rows OR all-null → { value:null, label:UNKNOWN }.
// A present numeric 0 is preserved (label MEASURED).
function aggSum(rows, key) {
  if (!rows || rows.length === 0) return { value: null, label: ML.UNKNOWN }
  const vals = rows.map(r => r[key]).filter(isNum)
  if (vals.length === 0) return { value: null, label: ML.UNKNOWN }
  return { value: vals.reduce((a, b) => a + b, 0), label: ML.MEASURED }
}
// Derived ratio. Null propagates; zero denominator → null + note.
function ratio(numAgg, denAgg) {
  const n = numAgg.value, d = denAgg.value
  if (n == null || d == null) return { value: null, label: ML.UNKNOWN, note: 'komponen tak tersedia' }
  if (d === 0) return { value: null, label: ML.NOT_MEASURABLE, note: 'penyebut nol' }
  return { value: n / d, label: ML.DERIVED }
}

// ── Fact factory ─────────────────────────────────────────────────────────────
// fact_id deterministik & stabil: date:scope_type:scope_id:metric.
function mkFact(date, scopeType, scopeId, metric, value, unit, label, sourceIds, note) {
  const f = {
    fact_id: `${date}:${scopeType}:${scopeId}:${metric}`,
    metric, value: value ?? null, unit,
    measurement_label: label,
    scope_type: scopeType, scope_id: scopeId,
    source_snapshot_ids: [...(sourceIds || [])].filter(Boolean).sort(),
  }
  if (note) f.notes = note
  return f
}

// ── ROI with explicit zero-cost semantics (spec 02 §8.1) ─────────────────────
function computeRoi(revAgg, costAgg) {
  if (revAgg.value == null || costAgg.value == null) return { value: null, label: ML.UNKNOWN, note: 'DATA_INSUFFICIENT' }
  if (costAgg.value === 0) {
    return revAgg.value > 0
      ? { value: null, label: ML.NOT_MEASURABLE, note: 'ROI_UNDEFINED_WITH_ZERO_COST' }
      : { value: null, label: ML.NOT_MEASURABLE, note: 'NO_ACTIVITY' }
  }
  return { value: revAgg.value / costAgg.value, label: ML.DERIVED }
}

const distinct = (rows, key) => new Set(rows.map(r => r[key]).filter(v => v != null && v !== 'N/A' && v !== ''))

// ── Main builder ─────────────────────────────────────────────────────────────
export function buildDailyFacts(input) {
  const {
    workspaceId, storeId, date,
    canonicalData = null, campaignSettings = null,
    featureRegistry = null, syncMetadata = null, comparisonData = null,
  } = input || {}

  const facts = []
  const missing = []
  const S = ScopeType.STORE
  const sid = storeId
  const snapId = canonicalData?.snapshotId ?? null
  const src = snapId ? [snapId] : []
  const creatives = canonicalData?.creatives ?? null
  const currency = canonicalData?.currency ?? 'IDR'
  const push = (...a) => facts.push(mkFact(date, ...a))

  // ══ BUSINESS ═══════════════════════════════════════════════════════════════
  const rows = Array.isArray(creatives) ? creatives : []
  const hasCanonical = Array.isArray(creatives)
  if (!hasCanonical) missing.push('canonical_snapshot')

  const rev = aggSum(rows, 'grossRevenue')
  const cost = aggSum(rows, 'cost')
  const orders = aggSum(rows, 'skuOrders')
  push(S, sid, 'gross_revenue', rev.value, currency, hasCanonical ? rev.label : ML.UNKNOWN, src)
  push(S, sid, 'cost', cost.value, currency, hasCanonical ? cost.label : ML.UNKNOWN, src)
  push(S, sid, 'orders', orders.value, 'orders', hasCanonical ? orders.label : ML.UNKNOWN, src)
  // net revenue/net cost are NOT in the canonical export → explicit UNKNOWN, never 0.
  push(S, sid, 'net_revenue', null, currency, ML.UNKNOWN, src, 'tak ada di export kanonik')
  push(S, sid, 'net_cost', null, currency, ML.UNKNOWN, src, 'tak ada di export kanonik')
  const roi = computeRoi(rev, cost)
  push(S, sid, 'roi', roi.value, 'x', hasCanonical ? roi.label : ML.UNKNOWN, src, roi.note)
  const aov = ratio(rev, orders)
  push(S, sid, 'aov', aov.value, currency, hasCanonical ? aov.label : ML.UNKNOWN, src, aov.note)

  // Campaign counts
  const campaignIds = distinct(rows, 'campaignId')
  const spendByCampaign = new Map()
  for (const r of rows) if (r.campaignId) spendByCampaign.set(r.campaignId, (spendByCampaign.get(r.campaignId) || 0) + (isNum(r.cost) ? r.cost : 0))
  const activeCampaignsFromSpend = [...spendByCampaign.values()].filter(v => v > 0).length
  push(S, sid, 'campaign_count', hasCanonical ? campaignIds.size : null, 'campaigns', hasCanonical ? ML.MEASURED : ML.UNKNOWN, src)
  // Prefer settings operation_status when available; else spend-derived.
  let activeCampaigns = null, activeLabel = ML.UNKNOWN
  if (Array.isArray(campaignSettings)) {
    activeCampaigns = campaignSettings.filter(c => normStatus(c.operation_status) === 'ENABLE').length
    activeLabel = ML.MEASURED
  } else if (hasCanonical) { activeCampaigns = activeCampaignsFromSpend; activeLabel = ML.DERIVED }
  push(S, sid, 'active_campaign_count', activeCampaigns, 'campaigns', activeLabel, src)

  // Budget utilization = Σcost / Σbudget (settings only)
  if (Array.isArray(campaignSettings)) {
    const budget = campaignSettings.map(c => c.budget).filter(isNum).reduce((a, b) => a + b, 0)
    const util = budget > 0 && cost.value != null ? { value: cost.value / budget, label: ML.DERIVED } : { value: null, label: ML.UNKNOWN }
    push(S, sid, 'daily_budget', campaignSettings.some(c => isNum(c.budget)) ? budget : null, currency, campaignSettings.some(c => isNum(c.budget)) ? ML.MEASURED : ML.UNKNOWN, src)
    push(S, sid, 'budget_utilization', util.value, 'ratio', util.label, src)
  } else {
    missing.push('campaign_settings')
    push(S, sid, 'daily_budget', null, currency, ML.UNKNOWN, src)
    push(S, sid, 'budget_utilization', null, 'ratio', ML.UNKNOWN, src)
  }

  // ══ CREATIVE ═══════════════════════════════════════════════════════════════
  const videoRows = rows.filter(r => r.videoId && r.videoId !== 'N/A')
  const cnt = (pred) => hasCanonical ? videoRows.filter(pred).length : null
  const cLabel = hasCanonical ? ML.MEASURED : ML.UNKNOWN
  push(S, sid, 'total_creatives', hasCanonical ? distinct(videoRows, 'videoId').size : null, 'creatives', cLabel, src)
  push(S, sid, 'spending_creatives', cnt(r => isNum(r.cost) && r.cost > 0), 'creatives', cLabel, src)
  push(S, sid, 'delivering_creatives', cnt(r => DELIVERING.has(normStatus(r.status))), 'creatives', cLabel, src)
  push(S, sid, 'learning_creatives', cnt(r => LEARNING.has(normStatus(r.status))), 'creatives', cLabel, src)
  push(S, sid, 'inactive_creatives', cnt(r => INACTIVE.has(normStatus(r.status))), 'creatives', cLabel, src)
  // new creatives require a comparable prior snapshot's video ids
  const priorVids = comparisonData?.priorVideoIds instanceof Set ? comparisonData.priorVideoIds : null
  if (priorVids) push(S, sid, 'new_creatives', [...distinct(videoRows, 'videoId')].filter(v => !priorVids.has(v)).length, 'creatives', ML.MEASURED, src)
  else push(S, sid, 'new_creatives', null, 'creatives', ML.UNKNOWN, src, 'butuh snapshot pembanding')
  // top creative contribution + concentration (HHI over revenue)
  const revByVid = new Map()
  for (const r of videoRows) if (isNum(r.grossRevenue)) revByVid.set(r.videoId, (revByVid.get(r.videoId) || 0) + r.grossRevenue)
  const totVidRev = [...revByVid.values()].reduce((a, b) => a + b, 0)
  if (hasCanonical && totVidRev > 0) {
    const shares = [...revByVid.values()].map(v => v / totVidRev)
    push(S, sid, 'top_creative_contribution', Math.max(...shares), 'ratio', ML.DERIVED, src)
    push(S, sid, 'creative_concentration_hhi', shares.reduce((a, s) => a + s * s, 0), 'hhi', ML.DERIVED, src)
  } else {
    push(S, sid, 'top_creative_contribution', null, 'ratio', ML.UNKNOWN, src)
    push(S, sid, 'creative_concentration_hhi', null, 'hhi', ML.UNKNOWN, src)
  }

  // ══ PRODUCT ════════════════════════════════════════════════════════════════
  const byProduct = new Map()
  for (const r of rows) {
    if (!r.productId) continue
    const p = byProduct.get(r.productId) || { cost: 0, rev: 0, orders: 0, any: false }
    if (isNum(r.cost)) { p.cost += r.cost; p.any = true }
    if (isNum(r.grossRevenue)) { p.rev += r.grossRevenue; p.any = true }
    if (isNum(r.skuOrders)) { p.orders += r.skuOrders; p.any = true }
    byProduct.set(r.productId, p)
  }
  const prods = [...byProduct.values()]
  const pLabel = hasCanonical ? ML.MEASURED : ML.UNKNOWN
  push(S, sid, 'active_products', hasCanonical ? byProduct.size : null, 'products', pLabel, src)
  push(S, sid, 'products_with_spend', hasCanonical ? prods.filter(p => p.cost > 0).length : null, 'products', pLabel, src)
  push(S, sid, 'products_with_orders', hasCanonical ? prods.filter(p => p.orders > 0).length : null, 'products', pLabel, src)
  push(S, sid, 'products_spend_no_orders', hasCanonical ? prods.filter(p => p.cost > 0 && p.orders === 0).length : null, 'products', pLabel, src)
  const totProdRev = prods.reduce((a, p) => a + p.rev, 0)
  push(S, sid, 'top_product_contribution', hasCanonical && totProdRev > 0 ? Math.max(...prods.map(p => p.rev / totProdRev)) : null, 'ratio', hasCanonical && totProdRev > 0 ? ML.DERIVED : ML.UNKNOWN, src)
  const impr = aggSum(rows, 'impressions'), clk = aggSum(rows, 'clicks')
  push(S, sid, 'impressions', impr.value, 'impressions', hasCanonical ? impr.label : ML.UNKNOWN, src)
  push(S, sid, 'clicks', clk.value, 'clicks', hasCanonical ? clk.label : ML.UNKNOWN, src)
  const ctr = ratio(clk, impr)
  push(S, sid, 'ctr', ctr.value, 'ratio', hasCanonical ? ctr.label : ML.UNKNOWN, src, ctr.note)
  const cvr = ratio(orders, clk)
  push(S, sid, 'cvr', cvr.value, 'ratio', hasCanonical ? cvr.label : ML.UNKNOWN, src, cvr.note)

  // ══ SETTINGS & FEATURES ══════════════════════════════════════════════════════
  // Target ROI from settings (single value when uniform; else range note).
  if (Array.isArray(campaignSettings) && campaignSettings.length) {
    const bids = campaignSettings.map(c => c.roas_bid).filter(isNum)
    const uniq = [...new Set(bids)]
    push(S, sid, 'target_roi', uniq.length === 1 ? uniq[0] : null, 'x', bids.length ? (uniq.length === 1 ? ML.MEASURED : ML.UNKNOWN) : ML.UNKNOWN, src, uniq.length > 1 ? `beragam: ${uniq.join('/')}` : undefined)
    push(S, sid, 'roi_protection_enabled', campaignSettings.some(c => c.roi_protection_enabled === true), 'bool', ML.MEASURED, src)
    push(S, sid, 'auto_budget_increase_enabled', campaignSettings.some(c => c?.auto_budget?.auto_budget_enabled === true), 'bool', ML.MEASURED, src)
  } else {
    push(S, sid, 'target_roi', null, 'x', ML.UNKNOWN, src)
    push(S, sid, 'roi_protection_enabled', null, 'bool', ML.UNKNOWN, src)
    push(S, sid, 'auto_budget_increase_enabled', null, 'bool', ML.UNKNOWN, src)
  }
  // recommended ROI is a separate MCP call (bid_recommend) → not in canonical.
  push(S, sid, 'recommended_roi', null, 'x', ML.UNKNOWN, src, 'sumber: bid_recommend (tak dimuat)')
  // Feature capabilities from registry — availability/enabled kept as-is (null-safe).
  const featOf = (code) => Array.isArray(featureRegistry) ? featureRegistry.find(f => f.feature_code === code) : null
  const FEATURES = ['MAX_DELIVERY', 'AUTO_BUDGET_INCREASE', 'PROMOTION_DAYS', 'ROI_PROTECTION', 'ACCELERATE_TESTING', 'CREATIVE_BOOST']
  if (!Array.isArray(featureRegistry)) missing.push('feature_registry')
  for (const code of FEATURES) {
    const f = featOf(code)
    const avail = f ? !['NOT_AVAILABLE', 'PERMISSION_DENIED', 'AUTHORIZATION_MISMATCH'].includes(f.availability_status) : null
    push(S, sid, `feature.${code}.available`, avail, 'bool', f ? ML.MEASURED : ML.UNKNOWN, src, f ? f.availability_status : 'registry tak tersedia')
    push(S, sid, `feature.${code}.enabled`, f ? (f.enabled ?? null) : null, 'bool', f && f.enabled != null ? ML.MEASURED : ML.UNKNOWN, src)
  }

  // ══ DATA QUALITY ═════════════════════════════════════════════════════════════
  const sm = syncMetadata || null
  if (!sm) missing.push('sync_metadata')
  const freshness = freshnessHours(canonicalData?.generatedAt, date, canonicalData?.timezone)
  push(S, sid, 'freshness_hours', freshness, 'hours', freshness == null ? ML.UNKNOWN : ML.DERIVED, src, freshness == null ? 'generated_at/tz tak tersedia' : undefined)
  const paginationComplete = canonicalData?.paginationComplete ?? (sm ? sm.paginationComplete : null)
  push(S, sid, 'pagination_complete', paginationComplete ?? null, 'bool', paginationComplete == null ? ML.UNKNOWN : ML.MEASURED, src)
  push(S, sid, 'sources_expected', sm?.sourcesExpected ?? null, 'sources', sm?.sourcesExpected != null ? ML.MEASURED : ML.UNKNOWN, src)
  push(S, sid, 'sources_processed', sm?.sourcesProcessed ?? null, 'sources', sm?.sourcesProcessed != null ? ML.MEASURED : ML.UNKNOWN, src)
  push(S, sid, 'sources_failed', sm?.sourcesFailed ?? null, 'sources', sm?.sourcesFailed != null ? ML.MEASURED : ML.UNKNOWN, src)
  push(S, sid, 'parity_status', sm?.parityStatus ?? null, 'enum', sm?.parityStatus != null ? ML.MEASURED : ML.UNKNOWN, src)
  push(S, sid, 'canonical_status', canonicalData?.canonicalStatus ?? null, 'enum', canonicalData?.canonicalStatus != null ? ML.MEASURED : ML.UNKNOWN, src)
  const lineage = sm?.advertiserLineage ?? null
  push(S, sid, 'source_lineage_count', Array.isArray(lineage) ? lineage.length : null, 'sources', Array.isArray(lineage) ? ML.MEASURED : ML.UNKNOWN, src)

  // ══ COMPARISONS (only when comparable value is provided & non-null) ══════════
  const cmp = comparisonData || null
  const deliveringCount = cnt(r => DELIVERING.has(normStatus(r.status)))
  addComparison(push, S, sid, 'previous_day', 'gross_revenue', rev.value, cmp?.previousDay?.grossRevenue, currency, src)
  addComparison(push, S, sid, 'previous_day', 'cost', cost.value, cmp?.previousDay?.cost, currency, src)
  addComparison(push, S, sid, 'previous_day', 'orders', orders.value, cmp?.previousDay?.orders, 'orders', src)
  addComparison(push, S, sid, 'previous_day', 'roi', roi.value, cmp?.previousDay?.roi, 'x', src)
  addComparison(push, S, sid, 'previous_day', 'cvr', cvr.value, cmp?.previousDay?.cvr, 'ratio', src)
  addComparison(push, S, sid, 'previous_day', 'delivering_creatives', deliveringCount, cmp?.previousDay?.deliveringCreatives, 'creatives', src)
  addComparison(push, S, sid, 'trailing3_avg', 'gross_revenue', rev.value, cmp?.trailing3?.grossRevenue, currency, src)
  addComparison(push, S, sid, 'trailing7_avg', 'gross_revenue', rev.value, cmp?.trailing7?.grossRevenue, currency, src)
  addComparison(push, S, sid, 'same_weekday', 'gross_revenue', rev.value, cmp?.sameWeekday?.grossRevenue, currency, src)

  return {
    workspace_id: workspaceId, store_id: storeId, date,
    scope_type: S, scope_id: sid,
    currency, timezone: canonicalData?.timezone ?? 'Asia/Jakarta',
    source_snapshot_ids: src,
    facts,
    missing_data: [...new Set(missing)],
    // structured view (derived from the same facts) for downstream skills
    structured: {
      hasCanonical, snapshotId: snapId,
      business: { grossRevenue: rev.value, cost: cost.value, orders: orders.value, roi: roi.value, roiNote: roi.note, campaigns: campaignIds.size, activeCampaigns },
      creative: { total: hasCanonical ? distinct(videoRows, 'videoId').size : null, delivering: cnt(r => DELIVERING.has(normStatus(r.status))), learning: cnt(r => LEARNING.has(normStatus(r.status))), spending: cnt(r => isNum(r.cost) && r.cost > 0) },
      product: { active: hasCanonical ? byProduct.size : null, withSpend: hasCanonical ? prods.filter(p => p.cost > 0).length : null, withOrders: hasCanonical ? prods.filter(p => p.orders > 0).length : null },
      dataQuality: {
        paginationComplete: paginationComplete ?? null,
        sourcesExpected: sm?.sourcesExpected ?? null, sourcesProcessed: sm?.sourcesProcessed ?? null, sourcesFailed: sm?.sourcesFailed ?? null,
        parityStatus: sm?.parityStatus ?? null, canonicalStatus: canonicalData?.canonicalStatus ?? null,
        freshnessHours: freshness, lineage,
      },
      settingsAvailable: Array.isArray(campaignSettings), featureRegistryAvailable: Array.isArray(featureRegistry),
    },
  }
}

// Facts subset with comparison delta; only emitted when both sides are numeric.
function addComparison(push, S, sid, window, metric, current, prior, unit, src) {
  if (!isNum(current) || !isNum(prior)) {
    push(S, sid, `cmp.${window}.${metric}.delta`, null, unit, ML.UNKNOWN, src, 'jendela tak dapat dibandingkan')
    return
  }
  push(S, sid, `cmp.${window}.${metric}.delta`, current - prior, unit, ML.DERIVED, src)
  if (prior !== 0) push(S, sid, `cmp.${window}.${metric}.pct`, (current - prior) / prior, 'ratio', ML.DERIVED, src)
}

// Maturity age in hours = generated_at − end-of-source-date (workspace tz).
// Deterministic; returns null when inputs are missing (never fabricated).
function freshnessHours(generatedAt, date, timezone) {
  if (!generatedAt || !date) return null
  const gen = Date.parse(generatedAt)
  // End of source date in UTC as a stable proxy (tz offset handling is a
  // TBD refinement; we approximate end-of-day UTC to stay deterministic).
  const end = Date.parse(`${date}T23:59:59Z`)
  if (Number.isNaN(gen) || Number.isNaN(end)) return null
  void timezone
  return Math.round((gen - end) / 36e5)
}
