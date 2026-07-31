// Hitungan untuk 3 tab detail Kuadran Traffic: Funnel, Tren, dan Aksi.
// Semuanya dari data yang SUDAH ada di snapshot periode — tak ada import baru.

import { getQuadrant } from './quadrantUtils'

// ── Funnel ──────────────────────────────────────────────────────────────────
// Bentuk corong berbeda per sumber data, jadi jangan dipaksa seragam:
//
//   TikTok (punya CTR)  : Impresi → Klik → Keranjang → Pesanan
//   Shopee (tanpa CTR)  : Pengunjung → Keranjang → Pesanan
//
// Catatan penting soal penyebut: di TikTok, %ATC dan CR(=CTOR) sama-sama
// dihitung terhadap KLIK, bukan bertingkat. Jadi pesanan bukan "keranjang ×
// CR" — keduanya cabang dari klik. Di Shopee keduanya terhadap pengunjung.
// Impresi bisa dipulihkan dari klik ÷ CTR walau kolom tayangan tak disimpan.

export function productFunnel(p) {
  if (!p) return null
  const ctr = p.ctr
  const klik = p.klik_produk
  const hasClick = ctr != null && ctr > 0 && klik != null && klik > 0

  const stages = []
  let base
  if (hasClick) {
    const impresi = Math.round((klik / ctr) * 100)
    stages.push({ key: 'impresi', label: 'Impresi', value: impresi, rate: null })
    stages.push({ key: 'klik', label: 'Klik', value: klik, rate: ctr, rateLabel: 'CTR' })
    base = klik
  } else {
    if (!(p.pengunjung > 0)) return null
    stages.push({ key: 'pengunjung', label: 'Pengunjung', value: p.pengunjung, rate: null })
    base = p.pengunjung
  }

  if (p.atc_rate != null) {
    stages.push({
      key: 'keranjang', label: 'Keranjang',
      value: Math.round(base * (p.atc_rate / 100)), rate: p.atc_rate, rateLabel: '%ATC',
    })
  }
  // Pesanan: pakai angka asli kalau ada, kalau tidak turunkan dari CR.
  const pesanan = p.pesanan != null ? p.pesanan
    : (p.conversion_rate != null ? Math.round(base * (p.conversion_rate / 100)) : null)
  if (pesanan != null) {
    stages.push({
      key: 'pesanan', label: 'Pesanan', value: pesanan,
      rate: p.conversion_rate, rateLabel: 'CR',
    })
  }
  if (stages.length < 2) return null

  // Kebocoran = penurunan terbesar antar tahap berurutan (dalam jumlah orang).
  let leak = null
  for (let i = 1; i < stages.length; i++) {
    const from = stages[i - 1], to = stages[i]
    const lost = from.value - to.value
    const pct = from.value > 0 ? (lost / from.value) * 100 : 0
    stages[i].dropPct = pct
    stages[i].lost = lost
    if (!leak || lost > leak.lost) leak = { from: from.label, to: to.label, lost, pct }
  }
  return { stages, leak, derived: !!p.ctr_derived, hasClick }
}

// Tahap terlemah SATU produk tak berguna kalau diukur dari jumlah yang gugur —
// tahap pertama hampir selalu menang, itu sifat corong, bukan temuan. Yang
// informatif: tahap mana yang paling tertinggal dibanding produk lain di
// periode yang sama.
export function stageMedians(products) {
  const pick = key => {
    const v = (products || []).map(p => p[key]).filter(x => x != null && x > 0).sort((a, b) => a - b)
    return v.length ? v[Math.floor(v.length / 2)] : null
  }
  return { ctr: pick('ctr'), atc_rate: pick('atc_rate'), conversion_rate: pick('conversion_rate') }
}

export function weakestStage(p, med) {
  const cands = [
    { key: 'klik', label: 'Klik', metric: 'CTR', rate: p.ctr, mid: med?.ctr },
    { key: 'keranjang', label: 'Keranjang', metric: '%ATC', rate: p.atc_rate, mid: med?.atc_rate },
    { key: 'pesanan', label: 'Pesanan', metric: 'CR', rate: p.conversion_rate, mid: med?.conversion_rate },
  ].filter(c => c.rate != null && c.mid > 0)
  if (!cands.length) return null
  for (const c of cands) c.ratio = c.rate / c.mid
  cands.sort((a, b) => a.ratio - b.ratio)
  const w = cands[0]
  return { ...w, behind: (1 - w.ratio) * 100 }
}

// Corong gabungan: jumlahkan tiap tahap dari produk yang bentuk corongnya sama.
// Produk yang tak punya tahap klik dihitung terpisah supaya tak mencampur
// "impresi" dengan "pengunjung" jadi satu angka yang tak bermakna.
export function aggregateFunnel(products) {
  const withClick = [], withoutClick = []
  for (const p of products || []) {
    const f = productFunnel(p)
    if (!f) continue
    ;(f.hasClick ? withClick : withoutClick).push(f)
  }
  const sum = list => {
    if (!list.length) return null
    const keys = []
    const totals = new Map()
    for (const f of list) {
      for (const s of f.stages) {
        if (!totals.has(s.key)) { totals.set(s.key, { key: s.key, label: s.label, value: 0 }); keys.push(s.key) }
        totals.get(s.key).value += s.value
      }
    }
    const stages = keys.map(k => totals.get(k))
    let leak = null
    for (let i = 1; i < stages.length; i++) {
      const from = stages[i - 1], to = stages[i]
      const lost = from.value - to.value
      stages[i].dropPct = from.value > 0 ? (lost / from.value) * 100 : 0
      stages[i].lost = lost
      // Tahap pertama selalu turun paling banyak secara jumlah; yang menarik
      // justru kebocoran SETELAH orang menunjukkan minat, jadi tahap ke-2
      // (impresi→klik) tak ikut dilombakan kalau ada tahap lain.
      if (i > 1 && (!leak || lost > leak.lost)) leak = { from: from.label, to: to.label, lost, pct: stages[i].dropPct }
    }
    if (!leak && stages.length > 1) {
      const s = stages[1]
      leak = { from: stages[0].label, to: s.label, lost: s.lost, pct: s.dropPct }
    }
    // Persentase konversi tahap dihitung ulang dari total (bukan rata-rata
    // persen tiap produk — itu bias ke produk kecil).
    const base = stages.find(s => s.key === 'klik') || stages[0]
    for (const s of stages) {
      s.rateOfBase = base.value > 0 && s !== base ? (s.value / base.value) * 100 : null
    }
    return { stages, leak, count: list.length }
  }
  return { tiktok: sum(withClick), tanpaKlik: sum(withoutClick) }
}

// ── Tren lintas periode ─────────────────────────────────────────────────────
// Sesi periode sudah dimuat semua di QuadrantContext; di sini cuma disusun
// jadi baris per produk. Hanya sesi platform yang sama yang boleh disandingkan.

const Q_SCORE = { 1: 4, 2: 3, 3: 2, 4: 1 }

export function buildTrend(sessions, platform, settings, limit = 6) {
  const rel = (sessions || [])
    .filter(s => s.platform === platform)
    .slice()
    .sort((a, b) => String(a.periodValue || a.label).localeCompare(String(b.periodValue || b.label)))
    .slice(-limit)
  if (rel.length < 2) return { periods: rel, rows: [], enough: false }

  const byProduct = new Map()
  rel.forEach((s, si) => {
    for (const p of s.products || []) {
      if (!byProduct.has(p.kode_produk)) {
        byProduct.set(p.kode_produk, { kode_produk: p.kode_produk, nama_produk: p.nama_produk, cells: new Array(rel.length).fill(null) })
      }
      const row = byProduct.get(p.kode_produk)
      row.nama_produk = p.nama_produk || row.nama_produk
      row.cells[si] = {
        quadrant: p.quadrant ?? getQuadrant(p, s.settings || settings),
        pengunjung: p.pengunjung ?? null,
        ctr: p.ctr ?? null,
        conversion_rate: p.conversion_rate ?? null,
        total_penjualan: p.total_penjualan ?? null,
      }
    }
  })

  const rows = [...byProduct.values()].map(row => {
    const seen = row.cells.filter(Boolean)
    const scores = seen.map(c => Q_SCORE[c.quadrant] ?? 0)
    row.verdict = readTrend(scores)
    row.last = seen[seen.length - 1] || null
    row.periodsSeen = seen.length
    return row
  })
  // Urut: yang paling perlu diperhatikan dulu (memburuk), lalu omzet terbesar.
  const order = { turun: 0, 'naik-turun': 1, stabil: 2, membaik: 3, baru: 4 }
  rows.sort((a, b) =>
    (order[a.verdict.key] - order[b.verdict.key]) ||
    ((b.last?.total_penjualan || 0) - (a.last?.total_penjualan || 0)))
  return { periods: rel, rows, enough: true }
}

// Baca arah dari deretan skor kuadran. Turun/naik berturut-turut dianggap
// struktural; selebihnya fluktuasi.
function readTrend(scores) {
  if (scores.length < 2) return { key: 'baru', label: 'data belum cukup' }
  let down = 0, up = 0
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] < scores[i - 1]) { down++; up = 0 } else if (scores[i] > scores[i - 1]) { up++; down = 0 } else { down = 0; up = 0 }
    if (down >= 2) return { key: 'turun', label: `turun ${down + 1} periode` }
    if (up >= 2) return { key: 'membaik', label: `naik ${up + 1} periode` }
  }
  const first = scores[0], last = scores[scores.length - 1]
  if (last < first) return { key: 'turun', label: 'lebih rendah dari awal' }
  if (last > first) return { key: 'membaik', label: 'membaik' }
  const varied = new Set(scores).size > 1
  return varied ? { key: 'naik-turun', label: 'naik-turun' } : { key: 'stabil', label: 'stabil' }
}

// ── Aksi ────────────────────────────────────────────────────────────────────
// Menerjemahkan kuadran + arah CTR/CR jadi satu tindakan. Aturannya sengaja
// sedikit & eksplisit supaya bisa diperdebatkan tim, bukan kotak hitam.

export function actionFor(p, ctx = {}) {
  const q = p.quadrant
  const dCtr = p.delta_ctr ?? null
  const dCr = p.delta_conversion ?? null
  const ctrLow = ctx.medianCtr != null && p.ctr != null && p.ctr < ctx.medianCtr

  // Sinyal yang menimpa saran dasar kuadran, karena penyebabnya lebih spesifik.
  if (dCtr != null && dCtr <= -1) {
    return { key: 'ctr-drop', urgency: 'high', kondisi: `CTR turun ${Math.abs(dCtr).toFixed(2)} poin`,
      aksi: 'Ganti thumbnail & judul dulu — orang berhenti mengklik, bukan berhenti membeli' }
  }
  if (q === 3 && p.atc_rate != null && p.conversion_rate != null && p.atc_rate >= p.conversion_rate * 3) {
    return { key: 'checkout', urgency: 'high', kondisi: 'Banyak masuk keranjang, sedikit dibayar',
      aksi: 'Periksa ongkir, voucher, dan alur checkout — minat sudah ada' }
  }

  switch (q) {
    case 1:
      return { key: 'scale', urgency: 'low', kondisi: 'Traffic & konversi sama-sama sehat',
        aksi: 'Jaga stok dan harga; jangan diutak-atik' }
    case 2:
      return ctrLow
        ? { key: 'ctr-fix', urgency: 'medium', kondisi: 'Konversi bagus tapi CTR di bawah rata-rata',
          aksi: 'Perbaiki thumbnail & judul dulu, baru tambah budget' }
        : { key: 'scale-ads', urgency: 'medium', kondisi: 'Konversi bagus, traffic kurang',
          aksi: 'Tambah budget iklan — halaman sudah terbukti menutup' }
    case 3:
      return { key: 'page-fix', urgency: 'medium', kondisi: 'Ramai diklik, sepi dibeli',
        aksi: 'Periksa harga, ulasan, dan halaman produk' }
    case 4:
    default:
      return dCr != null && dCr > 0
        ? { key: 'watch', urgency: 'low', kondisi: 'Masih lemah tapi konversi mulai naik',
          aksi: 'Amati satu periode lagi sebelum diputuskan' }
        : { key: 'cut', urgency: 'high', kondisi: 'Traffic & konversi sama-sama rendah',
          aksi: 'Kandidat stop — kecuali produk baru rilis' }
  }
}

export function buildActions(products) {
  const ctrs = (products || []).map(p => p.ctr).filter(v => v != null).sort((a, b) => a - b)
  const medianCtr = ctrs.length ? ctrs[Math.floor(ctrs.length / 2)] : null
  const rank = { high: 0, medium: 1, low: 2 }
  return (products || [])
    .map(p => ({ ...p, action: actionFor(p, { medianCtr }) }))
    .sort((a, b) =>
      (rank[a.action.urgency] - rank[b.action.urgency]) ||
      ((b.total_penjualan || 0) - (a.total_penjualan || 0)))
}
