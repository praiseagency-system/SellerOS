// Agregasi GMV Max: rollup baris kreatif → per video (lifetime + per-periode),
// per campaign, per kreator, per hook. Analisis hanya memakai baris Video;
// Product card dipisah sebagai agregat penempatan kartu (revenue ter-atribusi).
//
// Setiap baris input boleh membawa `period` (kunci bulan, mis. '2026-06-01') &
// `periodName` (mis. 'Jun 2026'). Tanpa itu, semua dianggap satu periode 'all'.

import { videoStatus, qualityTier, DEFAULT_THRESHOLDS } from './gmvmaxClassify'

const NO_CREATOR = '__toko__' // kunci grup untuk video tanpa kreator

function blankAgg() {
  return { cost: 0, revenue: 0, orders: 0, impressions: 0, clicks: 0,
           vr2s: 0, vr6s: 0, vr25: 0, vr50: 0, vr75: 0, vr100: 0, _n: 0 }
}
function addInto(a, r) {
  a.cost += r.cost ?? 0
  a.revenue += r.grossRevenue ?? 0
  a.orders += r.skuOrders ?? 0
  a.impressions += r.impressions ?? 0
  a.clicks += r.clicks ?? 0
  // view-rate: rata-rata tertimbang impresi (fallback rata-rata sederhana)
  const w = r.impressions ?? 1
  for (const k of ['vr2s', 'vr6s', 'vr25', 'vr50', 'vr75', 'vr100']) {
    if (r[k] != null) a[k] += r[k] * w
  }
  a._n += 1
  a._w = (a._w ?? 0) + (r.impressions != null ? w : 0)
}
function finalize(a) {
  const roas = a.cost > 0 ? a.revenue / a.cost : null
  const ctr = a.impressions > 0 ? a.clicks / a.impressions : null
  const cvr = a.clicks > 0 ? a.orders / a.clicks : null
  const cpo = a.orders > 0 ? a.cost / a.orders : null
  const wv = a._w || a._n || 1
  const funnel = {}
  for (const k of ['vr2s', 'vr6s', 'vr25', 'vr50', 'vr75', 'vr100']) {
    funnel[k] = a[k] > 0 ? a[k] / wv : null
  }
  return {
    cost: a.cost, revenue: a.revenue, orders: a.orders,
    impressions: a.impressions, clicks: a.clicks,
    roas, ctr, cvr, cpo, funnel, count: a._n,
  }
}

const periodOf = (r) => r.period || 'all'

// ─── Per video (lifetime + per-periode) ──────────────────────────────────────
export function rollupVideos(rows, thresholds = DEFAULT_THRESHOLDS) {
  const videos = rows.filter(r => r.creativeType === 'Video' && r.videoId)
  const byId = new Map()
  for (const r of videos) {
    let v = byId.get(r.videoId)
    if (!v) {
      v = {
        videoId: r.videoId,
        title: r.videoTitle || '',
        account: r.tiktokAccount || null,
        hook: r.hookTag || 'lainnya',
        productId: r.productId || null,
        campaign: r.campaignName || '',
        timePosted: r.timePosted || null,
        _life: blankAgg(),
        _periods: new Map(),
      }
      byId.set(r.videoId, v)
    }
    addInto(v._life, r)
    const p = periodOf(r)
    if (!v._periods.has(p)) v._periods.set(p, { period: p, periodName: r.periodName || p, agg: blankAgg() })
    addInto(v._periods.get(p).agg, r)
    if (r.timePosted && (!v.timePosted || r.timePosted < v.timePosted)) v.timePosted = r.timePosted
  }

  return [...byId.values()].map(v => {
    const lifetime = finalize(v._life)
    const periods = [...v._periods.values()]
      .map(p => ({ period: p.period, periodName: p.periodName, ...finalize(p.agg) }))
      .sort((a, b) => (a.period < b.period ? -1 : 1))
    const trend = periodTrend(periods)
    const status = videoStatus({ roas: lifetime.roas, cost: lifetime.cost, trend }, thresholds)
    return {
      videoId: v.videoId, title: v.title, account: v.account, hook: v.hook,
      productId: v.productId, campaign: v.campaign, timePosted: v.timePosted,
      lifetime, periods, trend, status,
      tier: qualityTier(lifetime.roas, thresholds),
    }
  })
}

// Arah tren ROAS antar-periode (dua periode terakhir).
function periodTrend(periods) {
  if (periods.length < 2) return null
  const a = periods[periods.length - 2].roas
  const b = periods[periods.length - 1].roas
  if (a == null || b == null) return null
  if (b > a * 1.05) return 'up'
  if (b < a * 0.95) return 'down'
  return 'flat'
}

// ─── Per campaign (video vs card dipisah, transparan) ────────────────────────
export function rollupCampaigns(rows) {
  const byName = new Map()
  for (const r of rows) {
    const key = r.campaignName || '(tanpa campaign)'
    if (!byName.has(key)) byName.set(key, { campaign: key, _video: blankAgg(), _card: blankAgg() })
    const c = byName.get(key)
    if (r.creativeType === 'Product card') addInto(c._card, r)
    else addInto(c._video, r)
  }
  return [...byName.values()].map(c => ({
    campaign: c.campaign,
    video: finalize(c._video),
    card: finalize(c._card),
  })).sort((a, b) => (b.card.revenue + b.video.revenue) - (a.card.revenue + a.video.revenue))
}

// ─── Per kreator (video only; null → "Akun toko") ────────────────────────────
export function rollupCreators(rows, thresholds = DEFAULT_THRESHOLDS) {
  const videos = rows.filter(r => r.creativeType === 'Video')
  const byAcct = new Map()
  for (const r of videos) {
    const key = r.tiktokAccount || NO_CREATOR
    if (!byAcct.has(key)) byAcct.set(key, { account: key === NO_CREATOR ? null : key, _agg: blankAgg(), videos: new Set() })
    const c = byAcct.get(key)
    addInto(c._agg, r)
    if (r.videoId) c.videos.add(r.videoId)
  }
  return [...byAcct.values()].map(c => {
    const m = finalize(c._agg)
    return {
      account: c.account,
      isStore: c.account === null,
      videoCount: c.videos.size,
      ...m,
      tier: qualityTier(m.roas, thresholds),
    }
  }).sort((a, b) => b.revenue - a.revenue)
}

// ─── Per hook ────────────────────────────────────────────────────────────────
export function rollupHooks(rows, thresholds = DEFAULT_THRESHOLDS) {
  const videos = rows.filter(r => r.creativeType === 'Video')
  const byHook = new Map()
  for (const r of videos) {
    const key = r.hookTag || 'lainnya'
    if (!byHook.has(key)) byHook.set(key, { hook: key, _agg: blankAgg(), videos: new Set() })
    const h = byHook.get(key)
    addInto(h._agg, r)
    if (r.videoId) h.videos.add(r.videoId)
  }
  return [...byHook.values()].map(h => ({
    hook: h.hook, videoCount: h.videos.size, ...finalize(h._agg),
    tier: qualityTier(finalize(h._agg).roas, thresholds),
  })).sort((a, b) => b.revenue - a.revenue)
}

// ─── Ringkasan dashboard (video only) ────────────────────────────────────────
export function dashboardSummary(videos, thresholds = DEFAULT_THRESHOLDS) {
  // Totals: semua video ber-spend (cocok "Total Cost" referensi).
  const spend = videos.filter(v => v.lifetime.cost > 0)
  let cost = 0, revenue = 0, orders = 0
  for (const v of spend) {
    cost += v.lifetime.cost
    revenue += v.lifetime.revenue
    orders += v.lifetime.orders
  }
  // Tier: hanya video yang menghasilkan penjualan (revenue>0) — sisanya spray
  // budget nol-revenue, tak diklasifikasi (cocok count referensi 156/9/19).
  const classified = spend.filter(v => v.lifetime.revenue > 0)
  const tiers = { bagus: [], sedang: [], buruk: [] }
  let potensiCount = 0 // ROAS tinggi tapi spend < lantai (info; tetap dihitung di bagus)
  for (const v of classified) {
    const roas = v.lifetime.roas
    if (roas == null || (roas >= thresholds.roasBad && roas < thresholds.roasGood)) tiers.sedang.push(v)
    else if (roas >= thresholds.roasGood) {
      tiers.bagus.push(v)
      if (v.lifetime.cost < thresholds.spendFloor) potensiCount++
    } else tiers.buruk.push(v)
  }
  // ROAS agregat (rev/cost) — robust terhadap outlier spend-receh, tak seperti mean.
  const wRoas = (arr) => {
    const c = arr.reduce((s, v) => s + v.lifetime.cost, 0)
    const r = arr.reduce((s, v) => s + v.lifetime.revenue, 0)
    return c > 0 ? r / c : null
  }
  const top = (arr, n = 5) => [...arr].sort((a, b) => b.lifetime.revenue - a.lifetime.revenue).slice(0, n)
  const worst = (arr, n = 5) => [...arr].sort((a, b) => (a.lifetime.roas ?? 99) - (b.lifetime.roas ?? 99)).slice(0, n)
  return {
    totals: { cost, revenue, orders, roas: cost > 0 ? revenue / cost : null, videoCount: spend.length, potensiCount },
    tiers: {
      bagus:  { count: tiers.bagus.length,  roas: wRoas(tiers.bagus),  top: top(tiers.bagus) },
      sedang: { count: tiers.sedang.length, roas: wRoas(tiers.sedang), top: top(tiers.sedang) },
      buruk:  { count: tiers.buruk.length,  roas: wRoas(tiers.buruk),  top: worst(tiers.buruk) },
    },
  }
}
