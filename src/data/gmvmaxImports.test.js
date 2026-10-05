import { describe, it, expect, vi, beforeEach } from 'vitest'

// Klien tiruan yang MENIRU batas PostgREST: tiap permintaan paling banyak CAP
// baris, sisanya dipotong DIAM-DIAM tanpa galat. Tanpa batas ini tes "lebih dari
// 1000 baris" lulus juga pada kode yang belum mem-paginasi.
const CAP = 1000
let imports = []
let creatives = []
let log = [] // satu entri per permintaan ke gmvmax_creatives
let failWith = null

function query(table) {
  const q = { table, eqs: {}, ins: {}, ordered: [], range: null, lim: null }
  const api = {
    select: () => api,
    eq: (c, v) => { q.eqs[c] = v; return api },
    in: (c, v) => { q.ins[c] = v; return api },
    order: (c) => { q.ordered.push(c); return api },
    range: (a, b) => { q.range = [a, b]; return api },
    limit: (n) => { q.lim = n; return api },
    then: (ok, fail) => Promise.resolve(run(q)).then(ok, fail),
  }
  return api
}
function run(q) {
  if (q.table === 'gmvmax_imports') return { data: imports, error: null }
  log.push(q)
  if (failWith) return { data: null, error: failWith }
  let rows = creatives.filter(r =>
    Object.entries(q.eqs).every(([c, v]) => r[c] === v) &&
    Object.entries(q.ins).every(([c, v]) => v.includes(r[c])))
  if (q.ordered.includes('id')) rows = [...rows].sort((a, b) => a.id - b.id)
  if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1)
  if (q.lim != null) rows = rows.slice(0, q.lim)
  return { data: rows.slice(0, CAP), error: null }
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (t) => query(t) } }))
vi.mock('../utils/workspace', () => ({ getCurrentWorkspaceId: () => 'ws-1' }))

const { loadExperimentDaily, loadVideosDaily } = await import('./gmvmaxImports')

// n import harian berurutan mulai 1 Sep 2026; listImports mengembalikan terbaru dulu.
const day = (i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10)
const makeImports = (n) => Array.from({ length: n }, (_, i) => ({ id: `imp-${i}`, snapshot_date: day(i) })).reverse()

let nextId = 1
const add = (import_id, extra, times = 1) => {
  for (let k = 0; k < times; k++) {
    creatives.push({
      id: nextId++, import_id, video_id: null, product_id: null, campaign_id: null,
      cost: 0, gross_revenue: 0, sku_orders: 0, impressions: 0, clicks: 0,
      vr_2s: null, vr_6s: null, vr_25: null, vr_50: null, vr_75: null, vr_100: null,
      ...extra,
    })
  }
}
const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0)

// Pola yang terukur lambat lalu HTTP 500 di produksi: banyak import dalam satu
// query DIGABUNG order/range (Postgres menyusuri indeks id seisi tabel).
const forbidden = () => log.filter(q => (q.ins.import_id?.length || 0) > 1 && (q.range || q.ordered.length))
const perImport = () => log.filter(q => q.eqs.import_id)
const chunked = () => log.filter(q => q.ins.import_id)

beforeEach(() => { imports = []; creatives = []; log = []; failWith = null; nextId = 1 })

describe('loadExperimentDaily — sasaran campaign/produk (lebar)', () => {
  // Angka nyata 5 Okt 2026: campaign Exotic Blue 4.374 baris di 25 import terbaru.
  it('campaign >1000 baris per 25 import terjumlah utuh, tiap hari hadir', async () => {
    imports = makeImports(30)
    for (const imp of imports) {
      add(imp.id, { campaign_id: 'C1', cost: 1, gross_revenue: 3, sku_orders: 1, impressions: 10, clicks: 2 }, 175)
      add(imp.id, { campaign_id: 'LAIN', cost: 999, gross_revenue: 999 }, 20)
    }
    const out = await loadExperimentDaily({ campaignId: 'C1' })
    expect(out.map(r => r.date)).toEqual(Array.from({ length: 30 }, (_, i) => day(i)))
    expect(out.every(r => r.cost === 175 && r.revenue === 525 && r.orders === 175)).toBe(true)
    expect(sum(out, 'cost')).toBe(5250)
    expect(sum(out, 'impressions')).toBe(52500)
    expect(forbidden()).toEqual([])
    expect(perImport()).toHaveLength(30) // satu import per query
    expect(chunked()).toHaveLength(0)
  })

  it('satu import >1000 baris → halaman berikutnya ikut diambil', async () => {
    imports = makeImports(2)
    add('imp-0', { campaign_id: 'C1', cost: 1 }, 2300)
    add('imp-1', { campaign_id: 'C1', cost: 1 }, 5)
    const out = await loadExperimentDaily({ campaignId: 'C1' })
    expect(out).toMatchObject([{ date: day(0), cost: 2300 }, { date: day(1), cost: 5 }])
    expect(log.filter(q => q.range[0] > 0).map(q => q.range)).toEqual([[1000, 1999], [2000, 2999]])
    expect(log.every(q => q.ordered.includes('id'))).toBe(true) // range tanpa urutan = halaman tak stabil
  })

  it('tepat 1000 baris di satu import → tak ada yang hilang, tak ada yang dobel', async () => {
    imports = makeImports(1)
    add('imp-0', { campaign_id: 'C1', cost: 1 }, 1000)
    const out = await loadExperimentDaily({ campaignId: 'C1' })
    expect(out[0].cost).toBe(1000)
  })

  it('sasaran produk memakai jalur yang sama', async () => {
    imports = makeImports(26)
    for (const imp of imports) add(imp.id, { product_id: 'P1', campaign_id: 'C1', cost: 2 }, 60)
    const out = await loadExperimentDaily({ productId: 'P1' })
    expect(out).toHaveLength(26)
    expect(sum(out, 'cost')).toBe(26 * 60 * 2)
    expect(forbidden()).toEqual([])
  })

  it('from membatasi snapshot yang diambil — import lebih tua tak disentuh', async () => {
    imports = makeImports(40)
    for (const imp of imports) add(imp.id, { campaign_id: 'C1', cost: 1 }, 3)
    const out = await loadExperimentDaily({ campaignId: 'C1', from: day(30) })
    expect(out.map(r => r.date)).toEqual(Array.from({ length: 10 }, (_, i) => day(30 + i)))
    expect(perImport().map(q => q.eqs.import_id).sort()).toEqual(imports.slice(0, 10).map(i => i.id).sort())
  })
})

describe('loadExperimentDaily — sasaran video (sempit)', () => {
  it('video biasa: tetap 25 import per permintaan, tanpa order/range', async () => {
    imports = makeImports(60)
    for (const imp of imports) {
      add(imp.id, { video_id: 'V1', campaign_id: 'C1', cost: 4, gross_revenue: 8 })
      add(imp.id, { video_id: 'V1', campaign_id: 'C2', cost: 6, gross_revenue: 2 })
      add(imp.id, { video_id: 'V2', campaign_id: 'C1', cost: 500 })
    }
    const out = await loadExperimentDaily({ videoId: 'V1' })
    expect(out).toHaveLength(60)
    expect(out.every(r => r.cost === 10 && r.revenue === 10)).toBe(true) // 2 campaign per hari dijumlah
    expect(log).toHaveLength(3) // 60 import / 25
    expect(perImport()).toHaveLength(0)
    expect(forbidden()).toEqual([])
  })

  it('chunk yang penuh satu halaman diambil ulang per import — tak terpotong', async () => {
    imports = makeImports(30)
    for (const imp of imports) add(imp.id, { video_id: 'V1', cost: 1 }, 40) // 25 import = tepat 1000
    const out = await loadExperimentDaily({ videoId: 'V1' })
    expect(out).toHaveLength(30)
    expect(out.every(r => r.cost === 40)).toBe(true)
    expect(chunked()).toHaveLength(2)
    expect(perImport()).toHaveLength(25) // hanya chunk pertama; chunk kedua (200 baris) lolos
    expect(forbidden()).toEqual([])
  })

  it('video diutamakan atas produk & campaign', async () => {
    imports = makeImports(1)
    add('imp-0', { video_id: 'V1', product_id: 'P1', campaign_id: 'C1', cost: 1 })
    add('imp-0', { video_id: 'V2', product_id: 'P1', campaign_id: 'C1', cost: 100 })
    const out = await loadExperimentDaily({ videoId: 'V1', productId: 'P1', campaignId: 'C1' })
    expect(out[0].cost).toBe(1)
  })
})

describe('loadExperimentDaily — bentuk & aturan rasio', () => {
  it('rasio dari Σ, retensi tertimbang impresi lalu jadi fraksi', async () => {
    imports = makeImports(1)
    add('imp-0', { campaign_id: 'C1', cost: '100', gross_revenue: '900', sku_orders: '3', impressions: '1000', clicks: '50', vr_2s: '40', vr_100: '4' })
    add('imp-0', { campaign_id: 'C1', cost: '300', gross_revenue: '300', sku_orders: '1', impressions: '3000', clicks: '30', vr_2s: '20', vr_100: null })
    add('imp-0', { campaign_id: 'C1', cost: '0', impressions: '0', vr_2s: '99' }) // tanpa impresi → tak ikut menimbang
    const [r] = await loadExperimentDaily({ campaignId: 'C1' })
    expect(r).toMatchObject({ date: day(0), cost: 400, revenue: 1200, orders: 4, impressions: 4000, clicks: 80 })
    expect(r.roi).toBe(3)
    expect(r.ctr).toBe(0.02)
    expect(r.cvr).toBe(0.05)
    expect(r.vr[0]).toBeCloseTo(0.25) // (40×1000 + 20×3000) / 4000 / 100
    expect(r.vr[5]).toBeCloseTo(0.01) // null tak menyumbang pembilang
  })

  it('hari tanpa belanja/impresi → rasio null, bukan NaN', async () => {
    imports = makeImports(1)
    add('imp-0', { campaign_id: 'C1' })
    const [r] = await loadExperimentDaily({ campaignId: 'C1' })
    expect(r).toMatchObject({ roi: null, ctr: null, cvr: null, vr: null })
  })

  it('import tanpa tanggal snapshot dilewati', async () => {
    imports = [{ id: 'imp-x', snapshot_date: null }, ...makeImports(1)]
    add('imp-x', { campaign_id: 'C1', cost: 777 })
    add('imp-0', { campaign_id: 'C1', cost: 1 })
    const out = await loadExperimentDaily({ campaignId: 'C1' })
    expect(out).toMatchObject([{ date: day(0), cost: 1 }])
  })

  it('tanpa sasaran / tanpa import → [] tanpa menyentuh creatives', async () => {
    imports = makeImports(3)
    expect(await loadExperimentDaily({})).toEqual([])
    imports = []
    expect(await loadExperimentDaily({ campaignId: 'C1' })).toEqual([])
    expect(log).toHaveLength(0)
  })

  it('galat server dilempar, bukan ditelan jadi deret kosong', async () => {
    imports = makeImports(2)
    failWith = { message: 'boom' }
    await expect(loadExperimentDaily({ campaignId: 'C1' })).rejects.toMatchObject({ message: 'boom' })
    await expect(loadExperimentDaily({ videoId: 'V1' })).rejects.toMatchObject({ message: 'boom' })
  })
})

describe('loadVideosDaily', () => {
  it('daftar video panjang (>1000 baris per 25 import) kembali utuh', async () => {
    imports = makeImports(25)
    const ids = Array.from({ length: 50 }, (_, i) => `V${i}`)
    for (const imp of imports) {
      for (const v of ids) add(imp.id, { video_id: v, cost: 2, gross_revenue: 6, sku_orders: 1 })
      add(imp.id, { video_id: 'BUKAN-DAFTAR', cost: 999 })
    }
    const m = await loadVideosDaily(ids) // 1250 baris dalam satu chunk
    expect(m.size).toBe(50)
    for (const v of ids) {
      const rows = m.get(v)
      expect(rows).toHaveLength(25)
      expect(new Set(rows.map(r => r.date)).size).toBe(25)
      expect(sum(rows, 'cost')).toBe(50)
      expect(sum(rows, 'revenue')).toBe(150)
      expect(sum(rows, 'orders')).toBe(25)
    }
    expect(forbidden()).toEqual([])
  })

  it('daftar pendek: satu permintaan per 25 import', async () => {
    imports = makeImports(50)
    for (const imp of imports) add(imp.id, { video_id: 'V1', cost: 1 })
    const m = await loadVideosDaily(['V1', 'V1', null, 'V-kosong'])
    expect(m.get('V1')).toHaveLength(50)
    expect(m.get('V-kosong')).toEqual([])
    expect(log).toHaveLength(2)
    expect(perImport()).toHaveLength(0)
  })

  it('daftar kosong → Map kosong tanpa permintaan', async () => {
    imports = makeImports(3)
    expect((await loadVideosDaily([])).size).toBe(0)
    expect(log).toHaveLength(0)
  })
})
