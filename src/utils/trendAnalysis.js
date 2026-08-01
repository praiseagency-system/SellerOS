// Analisis Tren: menjelaskan MENGAPA kuadran sebuah produk berpindah.
//
// Perpindahan kuadran bisa terjadi karena tiga sebab yang sangat berbeda:
//   • performa traffic berubah
//   • performa konversi berubah
//   • ambang (benchmark) yang bergeser, sementara produknya diam
// Yang ketiga TIDAK boleh dilaporkan sebagai "membaik" atau "memburuk".

import { quadrantOf } from './quadrantBenchmark'

export const BENCHMARK_MODE = { DYNAMIC: 'dynamic', FIXED: 'fixed' }
export const BENCHMARK_HINT =
  'Benchmark dinamis menunjukkan posisi relatif di setiap periode. Benchmark tetap menunjukkan perubahan performa terhadap standar yang sama.'

export const CAUSE = {
  TRAFFIC: 'traffic',
  CONVERSION: 'conversion',
  BOTH: 'both',
  BENCHMARK: 'benchmark',
  MISSING: 'missing',
  NEW: 'new',
  INACTIVE: 'inactive',
  STABLE: 'stable',
}

const Q_SCORE = { 1: 4, 2: 3, 3: 2, 4: 1 }
const pct = (cur, prev) => (prev == null || !(prev > 0) || cur == null) ? null : ((cur - prev) / prev) * 100
const pp = (cur, prev) => (cur == null || prev == null) ? null : cur - prev

// Bandingkan dua titik periode untuk satu produk.
// benchFixed: kalau diberikan, kuadran kedua periode dihitung ulang memakai
// ambang yang sama — inilah cara membuktikan pergeseran murni karena benchmark.
export function explainMove(prevCell, curCell, opts = {}) {
  if (!prevCell && !curCell) return { cause: CAUSE.MISSING, label: 'data tidak tersedia' }
  if (!prevCell) return { cause: CAUSE.NEW, label: 'produk baru pada periode ini' }
  if (!curCell) return { cause: CAUSE.INACTIVE, label: 'tak ada data pada periode terbaru' }

  const dTraffic = pct(curCell.qualifiedTraffic, prevCell.qualifiedTraffic)
  const dCrPp = pp(curCell.conversionRate, prevCell.conversionRate)
  const from = prevCell.quadrant, to = curCell.quadrant
  const moved = from != null && to != null && from !== to

  // Uji ambang: kalau dengan benchmark yang SAMA kuadrannya tak berpindah,
  // berarti yang bergeser adalah ambangnya, bukan performanya.
  let benchmarkOnly = false
  if (moved && opts.fixedBenchmark) {
    const f = quadrantOf(prevCell.qualifiedTraffic, prevCell.conversionRate, opts.fixedBenchmark)
    const t = quadrantOf(curCell.qualifiedTraffic, curCell.conversionRate, opts.fixedBenchmark)
    if (f != null && t != null && f === t) benchmarkOnly = true
  }

  const trafficMoved = dTraffic != null && Math.abs(dTraffic) >= 10
  const crMoved = dCrPp != null && Math.abs(dCrPp) >= 0.3

  let cause = CAUSE.STABLE
  if (benchmarkOnly) cause = CAUSE.BENCHMARK
  else if (trafficMoved && crMoved) cause = CAUSE.BOTH
  else if (trafficMoved) cause = CAUSE.TRAFFIC
  else if (crMoved) cause = CAUSE.CONVERSION

  const better = moved ? (Q_SCORE[to] > Q_SCORE[from]) : null
  const headline = benchmarkOnly
    ? 'Benchmark berubah'
    : moved
      ? `${better ? 'Membaik' : 'Turun'} Q${from} → Q${to}`
      : `Stabil di Q${to ?? from}`

  return {
    cause,
    moved,
    better,
    from,
    to,
    headline,
    deltaTrafficPct: dTraffic,
    deltaConversionPp: dCrPp,
    benchmarkOnly,
    label: benchmarkOnly
      ? 'Performa produk relatif stabil. Perpindahan kuadran dipengaruhi perubahan benchmark.'
      : cause === CAUSE.BOTH ? 'traffic & konversi sama-sama bergerak'
        : cause === CAUSE.TRAFFIC ? 'digerakkan oleh traffic'
          : cause === CAUSE.CONVERSION ? 'digerakkan oleh konversi'
            : 'tidak ada perubahan berarti',
  }
}

// Satu baris tren per produk lintas periode, sudah dengan penjelasan.
// views: [{ periodValue, label, products: [...] }] urut kronologis.
export function buildTrendRows(views, opts = {}) {
  const mode = opts.benchmarkMode || BENCHMARK_MODE.DYNAMIC
  const periods = views.map(v => ({ periodValue: v.periodValue, label: v.label, benchmark: v.benchmark }))
  // Benchmark tetap: pakai periode terbaru, atau manual kalau ada.
  const fixed = opts.manualBenchmark || views[views.length - 1]?.benchmark || null

  const byProduct = new Map()
  views.forEach((v, vi) => {
    for (const p of v.products || []) {
      const key = p.canonicalProductId || p.kode_produk
      if (!byProduct.has(key)) {
        byProduct.set(key, {
          key,
          nama_produk: p.nama_produk,
          shortName: p.shortName || p.nama_produk,
          displayCode: p.displayCode,
          platforms: p.platforms,
          merged: p.merged,
          cells: new Array(views.length).fill(null),
        })
      }
      const row = byProduct.get(key)
      row.nama_produk = p.nama_produk
      row.shortName = p.shortName || row.shortName
      const bench = mode === BENCHMARK_MODE.FIXED ? fixed : v.benchmark
      row.cells[vi] = {
        periodValue: v.periodValue,
        qualifiedTraffic: p.qualifiedTraffic ?? null,
        conversionRate: p.conversionRate ?? null,
        ctr: p.ctrBlended ?? p.ctr ?? null,
        atcRate: p.atcRate ?? null,
        gmv: p.gmv ?? null,
        benchmark: bench,
        // Kuadran DIHITUNG ULANG sesuai mode benchmark yang dipilih.
        quadrant: quadrantOf(p.qualifiedTraffic, p.conversionRate, bench),
        confidence: p.confidenceLevel ?? null,
        platformsLabel: (p.platforms || []).map(x => x.platform).join('+'),
      }
    }
  })

  const rows = [...byProduct.values()].map(row => {
    // Bandingkan SLOT periode terakhir dengan slot sebelumnya — bukan dua data
    // terakhir yang kebetulan terisi. Produk yang hilang di periode terbaru
    // harus terbaca "tak lagi ada", bukan "produk baru".
    const lastIdx = row.cells.length - 1
    const last = row.cells[lastIdx] || null
    const prev = lastIdx > 0 ? (row.cells[lastIdx - 1] || null) : null
    const seen = row.cells.filter(Boolean)
    const move = explainMove(prev, last, { fixedBenchmark: fixed })
    return {
      ...row,
      last,
      prev,
      move,
      deltaGmvPct: prev ? pct(last?.gmv, prev?.gmv) : null,
      periodsSeen: seen.length,
      quadrantChanges: seen.reduce((n, c, i) => n + (i > 0 && seen[i - 1].quadrant !== c.quadrant ? 1 : 0), 0),
    }
  })
  return { periods, rows, fixedBenchmark: fixed, mode }
}

// Filter & urutan untuk tab Tren.
export const TREND_FILTERS = [
  { id: 'all', label: 'Semua' },
  { id: 'better', label: 'Membaik' },
  { id: 'worse', label: 'Memburuk' },
  { id: 'stable', label: 'Stabil' },
  { id: 'new', label: 'Produk baru' },
  { id: 'missing', label: 'Data hilang' },
]

export function filterTrendRows(rows, id) {
  switch (id) {
    case 'better': return rows.filter(r => r.move.moved && r.move.better && !r.move.benchmarkOnly)
    case 'worse': return rows.filter(r => r.move.moved && r.move.better === false && !r.move.benchmarkOnly)
    case 'stable': return rows.filter(r => !r.move.moved || r.move.benchmarkOnly)
    case 'new': return rows.filter(r => r.move.cause === CAUSE.NEW)
    case 'missing': return rows.filter(r => r.move.cause === CAUSE.MISSING || r.move.cause === CAUSE.INACTIVE)
    default: return rows
  }
}

export const TREND_SORTS = [
  { id: 'gmv', label: 'GMV terbesar' },
  { id: 'crDrop', label: 'Penurunan CR terbesar' },
  { id: 'trafficDrop', label: 'Penurunan traffic terbesar' },
  { id: 'gmvDrop', label: 'Penurunan GMV terbesar' },
  { id: 'changes', label: 'Perubahan kuadran terbanyak' },
]

export function sortTrendRows(rows, id) {
  const arr = [...rows]
  const num = v => (v == null ? Infinity : v)
  switch (id) {
    case 'crDrop': return arr.sort((a, b) => num(a.move.deltaConversionPp) - num(b.move.deltaConversionPp))
    case 'trafficDrop': return arr.sort((a, b) => num(a.move.deltaTrafficPct) - num(b.move.deltaTrafficPct))
    case 'gmvDrop': return arr.sort((a, b) => num(a.deltaGmvPct) - num(b.deltaGmvPct))
    case 'changes': return arr.sort((a, b) => b.quadrantChanges - a.quadrantChanges)
    default: return arr.sort((a, b) => (b.last?.gmv || 0) - (a.last?.gmv || 0))
  }
}
