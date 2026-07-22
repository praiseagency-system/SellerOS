// Agregasi GMV Max: rollup baris kreatif → per video (lifetime + per-periode),
// per campaign, per kreator, per hook. Analisis hanya memakai baris Video;
// Product card dipisah sebagai agregat penempatan kartu (revenue ter-atribusi).
//
// Setiap baris input boleh membawa `period` (kunci bulan, mis. '2026-06-01') &
// `periodName` (mis. 'Jun 2026'). Tanpa itu, semua dianggap satu periode 'all'.

import { videoStatus, qualityTier, DEFAULT_THRESHOLDS } from './gmvmaxClassify'

const NO_CREATOR = '__toko__' // kunci grup untuk video tanpa kreator

// Status pengiriman (delivery) GMV Max dari kolom "Status" → 3 bucket yang
// dipantau tim: Delivering (tayang), In queue (antre), Learning (belajar).
// Sisanya (Not active, Unavailable, Not delivering, dst.) masuk 'other' & tak
// ditampilkan. Satu video bisa punya banyak baris/status lintas periode →
// pakai status periode terbaru; bila periode sama, menang yang paling "aktif".
const DELIVERY_RANK = { delivering: 3, learning: 2, in_queue: 1, other: 0 }
export function normDeliveryStatus(s) {
  const t = (s || '').toLowerCase().trim()
  if (!t || t === '-' || t === 'n/a') return null
  if (t.includes('learning') || t.includes('mempelajari') || t.includes('belajar')) return 'learning'
  if (t.includes('queue') || t.includes('antrean')) return 'in_queue'
  // "delivering"/"ditayangkan" — kecualikan "not delivering"/"tidak ditayangkan".
  if ((t.includes('deliver') || t.includes('ditayangkan')) && !t.includes('not') && !t.includes('tidak')) return 'delivering'
  return 'other'
}
const deliveryRank = (c) => (c == null ? -1 : (DELIVERY_RANK[c] ?? 0))
function tallyDelivery(vidStatus) {
  const c = { delivering: 0, in_queue: 0, learning: 0, other: 0 }
  for (const v of vidStatus.values()) if (v.canon) c[v.canon] = (c[v.canon] || 0) + 1
  return c
}

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

// ─── Channel GMV Max (Video / Product card / Live) ───────────────────────────
// Sinyal: campaign LIVE (nama campaign memuat token "LIVE") = channel Live;
// sisanya creative_type Video → 'video', selain itu → 'card'. Dipusatkan di sini
// agar mudah diganti ke promotion_type bila kelak tersimpan per baris.
export function channelOf(r) {
  if (/\blive\b/i.test(r.campaignName || '')) return 'live'
  return r.creativeType === 'Video' ? 'video' : 'card'
}
export const CHANNELS = ['video', 'card', 'live']
export const CHANNEL_LABEL = { video: 'Video', card: 'Product card', live: 'Live' }

// Rollup metrik per channel + share revenue. → { video, card, live, total }.
export function rollupChannels(rows) {
  const agg = { video: blankAgg(), card: blankAgg(), live: blankAgg() }
  for (const r of rows) addInto(agg[channelOf(r)], r)
  const out = {}
  let total = 0
  for (const k of CHANNELS) { out[k] = finalize(agg[k]); total += out[k].revenue }
  out.total = total
  for (const k of CHANNELS) out[k].share = total > 0 ? out[k].revenue / total : 0
  return out
}

// Tren revenue harian per channel (untuk grafik stacked). → [{ date, video, card, live, total }]
export function channelDailyTrend(rows) {
  const byDate = new Map()
  for (const r of rows) {
    const d = r.snapshotDate
    if (!d) continue
    let e = byDate.get(d)
    if (!e) { e = { date: d, video: 0, card: 0, live: 0, total: 0 }; byDate.set(d, e) }
    const v = r.grossRevenue ?? 0
    e[channelOf(r)] += v
    e.total += v
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
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
        _delRank: -2,               // rank status pengiriman "paling aktif"
        _delRaw: null,              // teks status mentah (mis. "Delivering", "Excluded")
        _life: blankAgg(),
        _periods: new Map(),
      }
      byId.set(r.videoId, v)
    }
    // Status pengiriman video = status baris paling "aktif" (delivering > learning
    // > in_queue > lainnya spt Excluded/Not active). Simpan teks mentahnya.
    if (r.status) {
      const rank = deliveryRank(normDeliveryStatus(r.status))
      if (rank > v._delRank) { v._delRank = rank; v._delRaw = r.status }
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
      delivery: v._delRaw, deliveryCanon: normDeliveryStatus(v._delRaw),
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
// Kunci utama campaignId (bukan nama) agar bisa di-join ke setting campaign
// (gmvmax_campaign_settings) yang ber-id. Nama di-trim — sumbernya kadang punya
// spasi ekor (mis. "GMV MAX | Update "). Fallback ke nama bila id kosong.
export function rollupCampaigns(rows) {
  const byId = new Map()
  for (const r of rows) {
    const name = (r.campaignName || '(tanpa campaign)').trim()
    const key = r.campaignId || name
    if (!byId.has(key)) byId.set(key, { campaignId: r.campaignId || null, campaign: name, _video: blankAgg(), _card: blankAgg(), _all: blankAgg() })
    const c = byId.get(key)
    if (r.creativeType === 'Product card') addInto(c._card, r)
    else addInto(c._video, r)
    addInto(c._all, r)
  }
  return [...byId.values()].map(c => ({
    campaignId: c.campaignId,
    campaign: c.campaign,
    video: finalize(c._video),
    card: finalize(c._card),
    total: finalize(c._all),
  })).sort((a, b) => b.total.revenue - a.total.revenue)
}

// ─── Per produk (semua creative; kunci product_id ↔ kode_produk menu Produk) ──
export function rollupProducts(rows) {
  const byId = new Map()
  for (const r of rows) {
    const key = r.productId || '__none__'
    if (!byId.has(key)) byId.set(key, { productId: r.productId || null, _agg: blankAgg(), videos: new Set(), campaigns: new Set(), _vidStatus: new Map() })
    const p = byId.get(key)
    addInto(p._agg, r)
    if (r.creativeType === 'Video' && r.videoId) {
      p.videos.add(r.videoId)
      const canon = normDeliveryStatus(r.status)
      const per = periodOf(r)
      const cur = p._vidStatus.get(r.videoId)
      if (!cur || per > cur.period || (per === cur.period && deliveryRank(canon) > deliveryRank(cur.canon))) {
        p._vidStatus.set(r.videoId, { period: per, canon })
      }
    }
    if (r.campaignName) p.campaigns.add(r.campaignName)
  }
  return [...byId.values()].map(p => ({
    productId: p.productId,
    videoCount: p.videos.size,
    statusCounts: tallyDelivery(p._vidStatus),
    campaigns: [...p.campaigns],
    ...finalize(p._agg),
  })).sort((a, b) => b.revenue - a.revenue)
}

// Per PRODUK dari channel PRODUCT CARD saja (bukan Video/Live). Baris Product card
// = agregat per-campaign TANPA product_id; dialokasikan ke produk berdasarkan
// PORSI REVENUE VIDEO tiap produk dalam campaign yang sama (fallback: rata bila
// campaign tanpa revenue video). Live (nama campaign memuat "LIVE") dikecualikan
// sepenuhnya. Produk tanpa iklan Product-card → tak muncul (revenue 0).
// Catatan: untuk campaign multi-produk, angka per-produk bersifat ALOKASI (estimasi).
export function rollupProductsCard(rows) {
  const camps = new Map()             // campaign → { card agg, vidRev per produk }
  const info = new Map()              // produk → { videos, vidStatus, campaigns }
  for (const r of rows) {
    const cid = r.campaignId || r.campaignName || '__none__'
    let c = camps.get(cid)
    if (!c) { c = { card: blankAgg(), vidRev: new Map() }; camps.set(cid, c) }
    if (channelOf(r) === 'card') addInto(c.card, r)
    if (r.creativeType === 'Video' && r.productId) {
      c.vidRev.set(r.productId, (c.vidRev.get(r.productId) || 0) + (r.grossRevenue ?? 0))
      let pi = info.get(r.productId)
      if (!pi) { pi = { videos: new Set(), vidStatus: new Map(), campaigns: new Set() }; info.set(r.productId, pi) }
      if (r.videoId) {
        pi.videos.add(r.videoId)
        const canon = normDeliveryStatus(r.status), per = periodOf(r)
        const cur = pi.vidStatus.get(r.videoId)
        if (!cur || per > cur.period || (per === cur.period && deliveryRank(canon) > deliveryRank(cur.canon))) pi.vidStatus.set(r.videoId, { period: per, canon })
      }
      if (r.campaignName) pi.campaigns.add(r.campaignName)
    }
  }
  const byProduct = new Map()         // produk → { cost, revenue, orders } (alokasi card)
  for (const c of camps.values()) {
    if (c.card.revenue === 0 && c.card.cost === 0 && c.card.orders === 0) continue
    const entries = [...c.vidRev.entries()]
    if (!entries.length) continue     // card campaign tanpa produk video → tak terpetakan
    const tot = entries.reduce((s, [, v]) => s + v, 0)
    const weights = tot > 0 ? entries.map(([p, v]) => [p, v / tot]) : entries.map(([p]) => [p, 1 / entries.length])
    for (const [pid, w] of weights) {
      let a = byProduct.get(pid)
      if (!a) { a = { cost: 0, revenue: 0, orders: 0 }; byProduct.set(pid, a) }
      a.cost += c.card.cost * w
      a.revenue += c.card.revenue * w
      a.orders += c.card.orders * w
    }
  }
  return [...byProduct.entries()].map(([productId, a]) => {
    const pi = info.get(productId) || { videos: new Set(), vidStatus: new Map(), campaigns: new Set() }
    const orders = Math.round(a.orders)
    return {
      productId,
      videoCount: pi.videos.size,
      statusCounts: tallyDelivery(pi.vidStatus),
      campaigns: [...pi.campaigns],
      cost: a.cost, revenue: a.revenue, orders,
      roas: a.cost > 0 ? a.revenue / a.cost : null,
      cpo: orders > 0 ? a.cost / orders : null,
      ctr: null, cvr: null, funnel: {}, count: pi.videos.size,
      allocated: true, // penanda angka hasil alokasi (untuk UI bila perlu)
    }
  }).sort((a, b) => b.revenue - a.revenue)
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
