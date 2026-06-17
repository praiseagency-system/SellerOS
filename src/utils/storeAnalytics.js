// Analitik pure dari baris ternormalisasi (lihat storeIngest.js untuk bentuk baris).
// Hanya baris valid (l.ok) yang dihitung untuk GMV/orders.

function aggBucket(lines, keyFn) {
  const map = new Map()
  for (const l of lines) {
    const k = keyFn(l)
    if (!map.has(k)) map.set(k, { gmv: 0, units: 0, orderSet: new Set(), buyerSet: new Set() })
    const b = map.get(k)
    b.gmv += l.r; b.units += l.q; b.orderSet.add(l.o); if (l.b) b.buyerSet.add(l.b)
  }
  return map
}
const growth = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null)

export function computeStore(lines) {
  const valid = lines.filter(l => l.ok)
  const gmv = valid.reduce((s, l) => s + l.r, 0)
  const units = valid.reduce((s, l) => s + l.q, 0)
  const orders = new Set(valid.map(l => l.o)).size
  const buyers = new Set(valid.map(l => l.b).filter(Boolean)).size
  const cancelledOrders = new Set(lines.filter(l => !l.ok).map(l => l.o)).size

  const overview = {
    gmv, units, orders, buyers,
    aov: orders ? gmv / orders : 0,
    asp: units ? gmv / units : 0,
    cancelRate: (orders + cancelledOrders) ? (cancelledOrders / (orders + cancelledOrders)) * 100 : 0,
  }

  // Marketplace
  const mpMap = aggBucket(valid, l => l.m)
  const marketplaces = [...mpMap.entries()].map(([name, b]) => ({
    name, gmv: b.gmv, units: b.units, orders: b.orderSet.size, buyers: b.buyerSet.size,
    aov: b.orderSet.size ? b.gmv / b.orderSet.size : 0,
    share: gmv ? (b.gmv / gmv) * 100 : 0,
  })).sort((a, b) => b.gmv - a.gmv)

  // Weekly (vs minggu sebelumnya)
  const wkMap = aggBucket(valid, l => l.w)
  const weekly = [1, 2, 3, 4, 5].filter(w => wkMap.has(w)).map(w => {
    const b = wkMap.get(w)
    return { week: w, gmv: b.gmv, units: b.units, orders: b.orderSet.size, aov: b.orderSet.size ? b.gmv / b.orderSet.size : 0 }
  })
  weekly.forEach((wk, i) => {
    // Hanya bandingkan dengan minggu sebelumnya yang benar-benar berdekatan
    // (week - 1). Kalau ada gap (mis. minggu 3 kosong), tampilkan null bukan
    // perbandingan yang menyesatkan.
    const prev = weekly[i - 1]
    const isAdjacent = prev && prev.week === wk.week - 1
    wk.growthGmv    = isAdjacent ? growth(wk.gmv, prev.gmv) : null
    wk.growthOrders = isAdjacent ? growth(wk.orders, prev.orders) : null
    wk.growthAov    = isAdjacent ? growth(wk.aov, prev.aov) : null
  })

  const months = [...new Set(valid.map(l => {
    const d = new Date(l.t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }))].sort()

  // ── Produk + Pareto/ABC ──
  const prodMap = aggBucket(valid, l => l.p)
  let products = [...prodMap.entries()].map(([name, b]) => ({
    name, gmv: b.gmv, units: b.units, orders: b.orderSet.size,
    share: gmv ? (b.gmv / gmv) * 100 : 0,
  })).sort((a, b) => b.gmv - a.gmv)
  let cum = 0
  products.forEach(p => { cum += p.share; p.cum = cum; p.abc = cum <= 80 ? 'A' : cum <= 95 ? 'B' : 'C' })
  const top20Count = Math.max(1, Math.ceil(products.length * 0.2))
  const top20Share = products.slice(0, top20Count).reduce((s, p) => s + p.share, 0)

  // ── Kategori ──
  const catLines = valid.filter(l => l.c)
  const catGmvTotal = catLines.reduce((s, l) => s + l.r, 0)
  const catMap = aggBucket(catLines, l => l.c)
  const categories = [...catMap.entries()].map(([name, b]) => ({
    name, gmv: b.gmv, units: b.units, orders: b.orderSet.size,
    share: gmv ? (b.gmv / gmv) * 100 : 0,
  })).sort((a, b) => b.gmv - a.gmv)

  // ── Waktu (hari & jam) ──
  const DAY = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const byDay = Array.from({ length: 7 }, (_, i) => ({ i, day: DAY[i], gmv: 0, o: new Set() }))
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, gmv: 0, o: new Set() }))
  const heat = {}; let heatMax = 0
  for (const l of valid) {
    byDay[l.day].gmv += l.r; byDay[l.day].o.add(l.o)
    byHour[l.hr].gmv += l.r; byHour[l.hr].o.add(l.o)
    const k = `${l.day}-${l.hr}`; heat[k] = (heat[k] || 0) + l.r; if (heat[k] > heatMax) heatMax = heat[k]
  }
  const time = {
    byDay: byDay.map(d => ({ i: d.i, day: d.day, gmv: d.gmv, orders: d.o.size })),
    byHour: byHour.map(h => ({ hour: h.hour, gmv: h.gmv, orders: h.o.size })),
    heat, heatMax, dayNames: DAY,
  }
  time.bestDay = [...time.byDay].sort((a, b) => b.gmv - a.gmv)[0]
  time.bestHour = [...time.byHour].sort((a, b) => b.gmv - a.gmv)[0]

  // ── Lokasi ──
  const provMap = aggBucket(valid, l => l.pr)
  const provinces = [...provMap.entries()].map(([name, b]) => ({
    name, gmv: b.gmv, orders: b.orderSet.size, share: gmv ? (b.gmv / gmv) * 100 : 0,
  })).sort((a, b) => b.gmv - a.gmv)
  const cityMap = aggBucket(valid, l => l.ci)
  const cities = [...cityMap.entries()].map(([name, b]) => ({
    name, gmv: b.gmv, orders: b.orderSet.size, share: gmv ? (b.gmv / gmv) * 100 : 0,
  })).sort((a, b) => b.gmv - a.gmv)

  return {
    overview, marketplaces, weekly, months,
    products, top20Share, top20Count,
    categories, catGmvTotal,
    time, provinces, cities,
    flags: {
      hasCategory: categories.length > 0,
      hasMultiMarketplace: marketplaces.length > 1,
    },
  }
}

// Insight ringkas berbasis aturan (untuk Executive Summary)
export function quickInsights(stats) {
  const out = []
  const { overview, marketplaces, weekly, products, top20Share, time, provinces, categories } = stats
  if (marketplaces.length > 1) out.push(`${marketplaces[0].name} menyumbang ${marketplaces[0].share.toFixed(0)}% dari total GMV.`)
  const bestWk = [...weekly].sort((a, b) => b.gmv - a.gmv)[0]
  if (bestWk && weekly.length > 1) {
    const g = bestWk.growthGmv
    out.push(`Minggu ${bestWk.week} mencatat GMV tertinggi${g != null ? ` (${g >= 0 ? '+' : ''}${g.toFixed(0)}% vs minggu sebelumnya)` : ''}.`)
  }
  if (products?.length) {
    out.push(`"${products[0].name}" menyumbang ${products[0].share.toFixed(0)}% dari total penjualan.`)
    const top5 = products.slice(0, 5).reduce((s, p) => s + p.share, 0)
    if (products.length >= 5) out.push(`Top 5 produk menghasilkan ${top5.toFixed(0)}% dari total revenue.`)
  }
  if (typeof top20Share === 'number' && products?.length >= 5) out.push(`Top 20% produk menyumbang ${top20Share.toFixed(0)}% revenue (analisis Pareto).`)
  if (time?.bestDay && time?.bestHour) out.push(`Penjualan tertinggi di hari ${time.bestDay.day}, jam ${String(time.bestHour.hour).padStart(2, '0')}:00.`)
  if (provinces?.length) out.push(`${provinces[0].name} menghasilkan order/revenue tertinggi (${provinces[0].share.toFixed(0)}% GMV).`)
  if (categories?.length) out.push(`Kategori "${categories[0].name}" memimpin dengan ${categories[0].share.toFixed(0)}% GMV.`)
  if (overview.cancelRate > 15) out.push(`Tingkat pembatalan ${overview.cancelRate.toFixed(0)}% — perlu perhatian.`)
  out.push(`Rata-rata nilai pesanan (AOV) Rp${Math.round(overview.aov).toLocaleString('id-ID')} dari ${overview.orders.toLocaleString('id-ID')} pesanan.`)
  return out.slice(0, 9)
}
