// Agregasi MURNI untuk tool AI Assistant (tanpa jaringan) supaya bisa diuji.
// Bentuk data mengikuti penulisnya di src/: compactProduct (storage.js),
// baris Performa Toko (storeIngest.js), facts GMV Max (skills/dailyFacts.mjs).

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d

export const QUADRANT_LABEL = {
  1: 'Q1 traffic tinggi & konversi tinggi (bintang)',
  2: 'Q2 traffic rendah & konversi tinggi (butuh traffic)',
  3: 'Q3 traffic tinggi & konversi rendah (perbaiki halaman)',
  4: 'Q4 traffic rendah & konversi rendah (evaluasi)',
}

/** Baris products → bentuk ringkas yang aman dikirim ke model. */
export function compactRow(r) {
  const d = r.raw_data || {}
  const q = Number(r.quadrant ?? d.quadrant) || null
  return {
    nama: r.name || d.nama_produk || '',
    kode: d.kode_produk ?? null,
    pengunjung: num(r.traffic_value ?? d.pengunjung),
    konversi_pct: round(num(r.conversion_value ?? d.conversion_rate), 2),
    penjualan: num(d.total_penjualan),
    pesanan: num(d.pesanan),
    harga: d.harga != null ? num(d.harga) : null,
    stok: d.stok != null ? num(d.stok) : null,
    roas: d.roas != null ? round(num(d.roas), 2) : null,
    kuadran: q,
  }
}

/** Ringkasan kuadran satu periode: jumlah & penjualan per kuadran + top produk. */
export function summarizeQuadrant(rows, settings = {}) {
  const items = rows.map(compactRow)
  const per = {}
  for (const q of [1, 2, 3, 4]) per[q] = { kuadran: q, label: QUADRANT_LABEL[q], produk: 0, pengunjung: 0, penjualan: 0, pesanan: 0 }
  let tanpaKuadran = 0
  for (const it of items) {
    const b = per[it.kuadran]
    if (!b) { tanpaKuadran++; continue }
    b.produk++; b.pengunjung += it.pengunjung; b.penjualan += it.penjualan; b.pesanan += it.pesanan
  }
  const totalPenjualan = items.reduce((s, i) => s + i.penjualan, 0)
  const totalPengunjung = items.reduce((s, i) => s + i.pengunjung, 0)
  const top = [...items].sort((a, b) => b.penjualan - a.penjualan).slice(0, 5)
  const ambangTraffic = settings.targetHarian && settings.periodDays ? num(settings.targetHarian) * num(settings.periodDays) : null
  return {
    total_produk: items.length,
    total_pengunjung: totalPengunjung,
    total_penjualan: totalPenjualan,
    ambang: { traffic_pengunjung: ambangTraffic, konversi_pct: settings.conversionThreshold ?? null },
    per_kuadran: Object.values(per),
    tanpa_kuadran: tanpaKuadran,
    top_penjualan: top,
  }
}

const SORT_KEY = { pengunjung: 'pengunjung', penjualan: 'penjualan', konversi: 'konversi_pct', pesanan: 'pesanan' }
export function pickProducts(rows, { quadrant, sortBy = 'penjualan', limit = 15, search } = {}) {
  let items = rows.map(compactRow)
  if (quadrant) items = items.filter(i => i.kuadran === Number(quadrant))
  if (search) { const q = String(search).toLowerCase(); items = items.filter(i => i.nama.toLowerCase().includes(q)) }
  const key = SORT_KEY[sortBy] || 'penjualan'
  items.sort((a, b) => b[key] - a[key])
  return { cocok: items.length, produk: items.slice(0, Math.min(Number(limit) || 15, 30)) }
}

// ── Performa Toko ─────────────────────────────────────────────────────────────
const WIB_MS = 7 * 60 * 60 * 1000
export const monthKeyWib = (t) => new Date(num(t) + WIB_MS).toISOString().slice(0, 7)
const fingerprint = (l) => [l.o, l.kid, l.k, l.v, l.q, l.r, l.t].join('|')

/** Dedupe baris antar file (aturan sama dengan src/utils/storeData.js) lalu saring bulan. */
export function summarizeStore(lines, { month, topN = 10 } = {}) {
  const seen = new Set()
  const rows = []
  for (const l of lines) {
    const fp = fingerprint(l)
    if (seen.has(fp)) continue
    seen.add(fp)
    if (month && monthKeyWib(l.t) !== month) continue
    rows.push(l)
  }
  const ok = rows.filter(l => l.ok !== false)
  const gmv = ok.reduce((s, l) => s + num(l.r), 0)
  const units = ok.reduce((s, l) => s + num(l.q), 0)
  const orders = new Set(ok.map(l => l.o)).size
  const buyers = new Set(ok.map(l => l.b).filter(Boolean)).size
  const allOrders = new Set(rows.map(l => l.o)).size
  const cancelled = allOrders - orders
  const by = (keyFn) => {
    const m = new Map()
    for (const l of ok) {
      const k = keyFn(l); if (k == null || k === '') continue
      const b = m.get(k) || { key: k, gmv: 0, units: 0, orders: new Set() }
      b.gmv += num(l.r); b.units += num(l.q); b.orders.add(l.o); m.set(k, b)
    }
    return [...m.values()].map(b => ({ ...b, orders: b.orders.size })).sort((a, b) => b.gmv - a.gmv)
  }
  const products = by(l => l.p).slice(0, topN).map(b => ({ produk: b.key, gmv: b.gmv, unit: b.units, pesanan: b.orders }))
  const marketplaces = by(l => l.src || l.m).map(b => ({ marketplace: b.key, gmv: b.gmv, pesanan: b.orders }))
  const weekly = by(l => l.w).sort((a, b) => a.key - b.key).map(b => ({ minggu_ke: b.key, gmv: b.gmv, pesanan: b.orders }))
  const provinces = by(l => l.pr).slice(0, 5).map(b => ({ provinsi: b.key, gmv: b.gmv, pesanan: b.orders }))
  return {
    bulan: month || 'semua',
    gmv, pesanan: orders, unit: units, pembeli: buyers,
    aov: orders ? Math.round(gmv / orders) : 0,
    pesanan_batal: cancelled,
    batal_pct: allOrders ? round((cancelled / allOrders) * 100, 1) : 0,
    per_marketplace: marketplaces,
    per_minggu: weekly,
    top_produk: products,
    top_provinsi: provinces,
  }
}

// ── GMV Max ───────────────────────────────────────────────────────────────────
const FACT_KEYS = ['gross_revenue', 'cost', 'orders', 'roi', 'aov', 'impressions', 'clicks', 'ctr', 'cvr',
  'active_campaign_count', 'daily_budget', 'budget_utilization', 'spending_creatives', 'delivering_creatives',
  'products_with_orders', 'products_spend_no_orders']

/** facts[] satu hari → objek metrik datar. null tetap null (bukan 0) — itu invarian builder. */
export function flattenFacts(facts) {
  const out = {}
  for (const f of facts || []) {
    if (f?.scope_type && f.scope_type !== 'STORE') continue
    if (FACT_KEYS.includes(f?.metric)) out[f.metric] = f.value ?? null
  }
  return out
}

/** Baris gmvmax_daily_facts (bisa beberapa versi per hari) → satu baris terbaru per (store, tanggal). */
export function latestFactsPerDay(rows) {
  const m = new Map()
  for (const r of rows) {
    const k = `${r.store_id}|${r.fact_date}`
    const cur = m.get(k)
    if (!cur || String(r.generated_at) > String(cur.generated_at)) m.set(k, r)
  }
  return [...m.values()].sort((a, b) => (a.fact_date < b.fact_date ? 1 : -1))
}

export function summarizeGmvMax(rows, { days = 7 } = {}) {
  const daily = latestFactsPerDay(rows).slice(0, days).map(r => ({
    tanggal: r.fact_date, store_id: r.store_id, ...flattenFacts(r.facts),
  }))
  const sum = (k) => daily.reduce((s, d) => s + (d[k] == null ? 0 : num(d[k])), 0)
  const cost = sum('cost'), rev = sum('gross_revenue')
  const latest = daily[0] || null
  const cmp = {}
  if (rows.length) {
    const src = latestFactsPerDay(rows)[0]
    for (const f of src?.comparisons || []) {
      if (/^cmp\.trailing7_avg\.(gross_revenue|cost|roi|orders)\.pct$/.test(f.metric)) cmp[f.metric.replace('cmp.trailing7_avg.', '')] = f.value
    }
  }
  return {
    hari: daily.length,
    total: { belanja: cost, gmv: rev, pesanan: sum('orders'), roas: cost ? round(rev / cost, 2) : null },
    hari_terakhir: latest,
    vs_rata7hari_pct: cmp,
    harian: daily,
  }
}
