import { describe, it, expect, vi, beforeEach } from 'vitest'

// Klien tiruan: rantai query yang bisa di-await dan mengembalikan halaman baris.
const calls = { rpc: 0, from: 0, ranges: [] }
let rpcResult = null
let creatives = []
const chain = (resolve) => {
  const q = {
    _range: null, _eq: null,
    select: () => q, order: () => q,
    eq: (_col, id) => { q._eq = id; return q },
    range: (a, b) => { q._range = [a, b]; calls.ranges.push([a, b]); return q },
    then: (ok, fail) => Promise.resolve(resolve(q)).then(ok, fail),
  }
  return q
}
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: () => { calls.rpc++; return chain(() => rpcResult) },
    from: () => {
      calls.from++
      return chain((q) => {
        const rows = creatives.filter(r => r.import_id === q._eq)
        return { data: rows.slice(q._range[0], q._range[1] + 1), error: null }
      })
    },
  },
}))
vi.mock('../utils/workspace', () => ({ getCurrentWorkspaceId: () => 'ws-1' }))

const { loadCampaignDaily } = await import('./gmvmaxCampaignDaily')

const imports = [
  { id: 'i3', snapshot_date: '2026-10-04' },
  { id: 'i2', snapshot_date: '2026-10-02' },
  { id: 'i1', snapshot_date: '2026-10-01' },
  { id: 'i0', snapshot_date: '2026-08-01' }, // di luar rentang
]
const opt = { from: '2026-09-25', to: '2026-10-05', imports }

beforeEach(() => { calls.rpc = 0; calls.from = 0; calls.ranges = []; rpcResult = null; creatives = [] })

describe('loadCampaignDaily', () => {
  it('jalur ringkas: memetakan baris fungsi + menjumlah toko', async () => {
    rpcResult = { error: null, data: [
      { snapshot_date: '2026-10-01', campaign_id: 'A', cost: '100', revenue: '900', orders: '3', video_cost: '40', video_revenue: '300' },
      { snapshot_date: '2026-10-01', campaign_id: 'B', cost: '50', revenue: '100', orders: '1', video_cost: '0', video_revenue: '0' },
    ] }
    const d = await loadCampaignDaily(opt)
    expect(d.source).toBe('rpc')
    expect(calls.from).toBe(0)
    expect(d.byCampaign.get('A').get('2026-10-01')).toMatchObject({ cost: 100, revenue: 900, orders: 3, videoCost: 40, videoRevenue: 300 })
    expect(d.store.get('2026-10-01')).toMatchObject({ cost: 150, revenue: 1000, orders: 4, videoCost: 40 })
    // 3 Okt tak punya snapshot → bukan anggota; snapshot terbaru dari SEMUA import.
    expect([...d.snapshotDates].sort()).toEqual(['2026-10-01', '2026-10-02', '2026-10-04'])
    expect(d.lastDataDate).toBe('2026-10-04')
  })

  it('fungsi belum ada → menjumlah sendiri, hasil sama bentuk', async () => {
    rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    creatives = [
      { import_id: 'i1', campaign_id: 'A', creative_type: 'Video', cost: '40', gross_revenue: '300', sku_orders: '1' },
      { import_id: 'i1', campaign_id: 'A', creative_type: 'Product card', cost: '60', gross_revenue: '600', sku_orders: '2' },
      { import_id: 'i2', campaign_id: 'A', creative_type: 'Video', cost: '10', gross_revenue: null, sku_orders: null },
      { import_id: 'i1', campaign_id: null, creative_type: 'Video', cost: '999', gross_revenue: '999', sku_orders: '9' },
      { import_id: 'i0', campaign_id: 'A', creative_type: 'Video', cost: '777', gross_revenue: '777', sku_orders: '7' },
    ]
    const d = await loadCampaignDaily(opt)
    expect(d.source).toBe('browser')
    expect(d.byCampaign.get('A').get('2026-10-01')).toMatchObject({ cost: 100, revenue: 900, orders: 3, videoCost: 40, videoRevenue: 300 })
    expect(d.byCampaign.get('A').get('2026-10-02')).toMatchObject({ cost: 10, revenue: 0, orders: 0 })
    expect(d.store.get('2026-10-01').cost).toBe(100) // baris tanpa campaign_id & import luar rentang tak ikut
  })

  // PostgREST memotong diam-diam di 1000 baris — tanpa paginasi, hari-hari
  // terakhir hilang dan rata-rata "sesudah" tampak anjlok.
  it('cadangan mem-paginasi lewat batas 1000 baris', async () => {
    rpcResult = { data: null, error: { message: 'x' } }
    creatives = Array.from({ length: 2300 }, () => ({ import_id: 'i1', campaign_id: 'A', creative_type: 'Video', cost: 1, gross_revenue: 2, sku_orders: 0 }))
    const d = await loadCampaignDaily(opt)
    expect(d.byCampaign.get('A').get('2026-10-01').cost).toBe(2300)
    // rpc 1× + import i1 tiga halaman + i2 & i3 masing-masing satu (urutan paralel bebas).
    expect(calls.ranges.filter(r => r[0] > 0)).toEqual([[1000, 1999], [2000, 2999]])
    expect(calls.from).toBe(5)
  })

  it('tanpa snapshot di rentang → kosong tanpa memanggil server', async () => {
    const d = await loadCampaignDaily({ ...opt, imports: [imports[3]] })
    expect(d.byCampaign.size).toBe(0)
    expect(calls.rpc + calls.from).toBe(0)
    expect(d.lastDataDate).toBe('2026-08-01')
  })
})
