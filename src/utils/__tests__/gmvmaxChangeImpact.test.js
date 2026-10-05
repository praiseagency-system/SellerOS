import { describe, it, expect } from 'vitest'
import {
  addDays, wibDate, wibTime, changeDayOf, buildEvents, mixedWith, planRows,
  computeImpact, impactVerdict, impactSentence,
} from '../gmvmaxChangeImpact'
import { buildChangeLog, dropBackfilledSnapshots } from '../gmvmaxCampaignDiff'

const hari = (from, vals) => new Map(vals.map(([cost, revenue, orders = 0, videoCost = 0, videoRevenue = 0], i) =>
  [addDays(from, i), { cost, revenue, orders, videoCost, videoRevenue }]))
const tanggal = (from, n) => new Set(Array.from({ length: n }, (_, i) => addDays(from, i)))

// Deret ASLI campaign GMV Max Update (1855452438084706) 22 Sep–4 Okt 2026,
// dibaca dari produksi 5 Okt 2026. Target ROAS 12 → 9,6 pada 29 Sep 22.19 WIB.
const UPDATE = hari('2026-09-22', [
  [62690, 413361, 5], [100073, 873851, 9], [47485, 421371, 5], [158534, 1926632, 19],
  [124097, 1119307, 12], [135676, 1612601, 18], [63462, 661901, 7],
  [83922, 793530, 8], // 29 Sep = hari perubahan
  [65431, 372747, 4], [116165, 1480605, 16], [97064, 924199, 10], [155073, 2193471, 23], [158051, 1599620, 16],
])

describe('waktu WIB', () => {
  it('menggeser cap waktu TikTok ke tanggal & jam WIB', () => {
    expect(wibDate('2026-10-04T16:04:01+00:00')).toBe('2026-10-04')
    expect(wibTime('2026-10-04T16:04:01+00:00')).toBe('23.04')
    // 18.30 UTC = 01.30 WIB keesokan harinya
    expect(wibDate('2026-09-29T18:30:00+00:00')).toBe('2026-09-30')
  })
})

describe('changeDayOf', () => {
  it('memakai tanggal modify_time bila jatuh di antara dua potret', () => {
    expect(changeDayOf({ date: '2026-09-29', prev_date: '2026-09-28', modify_time: '2026-09-29T15:19:57+00:00' }))
      .toEqual({ day: '2026-09-29', timeKnown: true })
  })
  // Potret 3 Okt bolong: perubahan terlihat di potret 4 Okt, tapi TikTok
  // mencatatnya 4 Okt 23.04 — hari perubahan harus 4 Okt, bukan label potret lain.
  it('tetap benar saat ada potret yang terlewat', () => {
    expect(changeDayOf({ date: '2026-10-04', prev_date: '2026-10-02', modify_time: '2026-10-04T16:04:01+00:00' }).day)
      .toBe('2026-10-04')
  })
  it('kembali ke label potret bila modify_time tak masuk akal atau kosong', () => {
    expect(changeDayOf({ date: '2026-09-29', prev_date: '2026-09-28', modify_time: '2026-09-18T10:47:54+00:00' }))
      .toEqual({ day: '2026-09-29', timeKnown: false })
    expect(changeDayOf({ date: '2026-09-29', prev_date: '2026-09-28', modify_time: null }).day).toBe('2026-09-29')
  })
})

describe('computeImpact', () => {
  it('mereproduksi angka GMV Max Update (target ROAS 12 → 9,6)', () => {
    const r = computeImpact({
      day: '2026-09-29', series: UPDATE, snapshotDates: tanggal('2026-09-22', 13),
      lastDataDate: '2026-10-04', budgetOf: () => 160000,
    })
    expect(r.state).toBe('PARTIAL')
    expect(r.before.days).toBe(7)
    expect(r.after.days).toBe(5)
    expect(Math.round(r.before.cost)).toBe(98860)
    expect(Math.round(r.after.cost)).toBe(118357)
    expect(Math.round(r.before.revenue)).toBe(1004146)
    expect(Math.round(r.after.revenue)).toBe(1314128)
    expect(r.before.roas).toBeCloseTo(10.16, 2)
    expect(r.after.roas).toBeCloseTo(11.10, 2)
    expect(r.delta.cost).toBeCloseTo(0.197, 3)
    expect(r.delta.revenue).toBeCloseTo(0.309, 3)
    expect(Math.round(r.before.cpo)).toBe(9227)
    expect(Math.round(r.after.cpo)).toBe(8577)
    expect(r.before.budgetUse).toBeCloseTo(0.62, 2)
    expect(r.after.budgetUse).toBeCloseTo(0.74, 2)
  })

  it('hari perubahan tidak masuk jendela mana pun', () => {
    const s = new Map(UPDATE); s.set('2026-09-29', { cost: 9e9, revenue: 9e9, orders: 9e9, videoCost: 0, videoRevenue: 0 })
    const r = computeImpact({ day: '2026-09-29', series: s, snapshotDates: tanggal('2026-09-22', 13), lastDataDate: '2026-10-04' })
    expect(Math.round(r.before.cost)).toBe(98860)
    expect(Math.round(r.after.cost)).toBe(118357)
  })

  it('WAITING sampai hari penuh pertama punya snapshot', () => {
    const r = computeImpact({ day: '2026-10-04', series: new Map(), snapshotDates: tanggal('2026-09-27', 8), lastDataDate: '2026-10-04' })
    expect(r.state).toBe('WAITING')
    expect(r.after.days).toBe(0)
    expect(r.firstFullDay).toBe('2026-10-05')
    expect(r.firstArrives).toBe('2026-10-06')
    expect(r.delta).toBeNull()
  })

  it('FINAL setelah tujuh hari sesudah lewat', () => {
    const r = computeImpact({ day: '2026-09-23', series: UPDATE, snapshotDates: tanggal('2026-09-16', 19), lastDataDate: '2026-10-04' })
    expect(r.state).toBe('FINAL')
    expect(r.after.days).toBe(7)
  })

  // Hari bolong DILEWATI, bukan dihitung nol — kalau dihitung nol, rata-rata
  // "sebelum" turun dan dampak tampak lebih besar dari aslinya.
  it('melewati hari tanpa snapshot dan melaporkannya', () => {
    const dates = tanggal('2026-09-22', 13); dates.delete('2026-09-27')
    const r = computeImpact({ day: '2026-09-29', series: UPDATE, snapshotDates: dates, lastDataDate: '2026-10-04' })
    expect(r.before.days).toBe(6)
    expect(r.before.missing).toBe(1)
    expect(Math.round(r.before.cost)).toBe(Math.round((62690 + 100073 + 47485 + 158534 + 124097 + 63462) / 6))
  })

  it('hari ber-snapshot tanpa baris campaign = nol sungguhan', () => {
    const r = computeImpact({ day: '2026-09-29', series: new Map(), snapshotDates: tanggal('2026-09-22', 13), lastDataDate: '2026-10-04' })
    expect(r.before.days).toBe(7)
    expect(r.before.cost).toBe(0)
    expect(r.before.roas).toBeNull()
  })

  it('memisah porsi video dan kartu produk', () => {
    const s = hari('2026-09-22', [[100, 1000, 1, 40, 400], [100, 1000, 1, 60, 600]])
    const r = computeImpact({ day: '2026-09-29', series: s, snapshotDates: tanggal('2026-09-22', 2), lastDataDate: '2026-09-23' })
    expect(r.before.videoCost).toBe(50)
    expect(r.before.cardCost).toBe(50)
    expect(r.before.cardRevenue).toBe(500)
  })
})

describe('buildEvents & mixedWith', () => {
  const ch = (o) => ({ campaign_id: 'C1', campaign_name: 'Custom MAG', prev_date: addDays(o.date, -1), modify_time: null, ...o })
  it('menggabung bidang yang berubah bersamaan menjadi satu kejadian', () => {
    const ev = buildEvents([
      ch({ date: '2026-09-20', field: 'budget', label: 'Budget' }),
      ch({ date: '2026-09-20', field: 'roas_bid', label: 'Target ROAS' }),
    ])
    expect(ev.size).toBe(1)
    expect([...ev.values()][0].changes).toHaveLength(2)
    expect([...ev.values()][0].scope).toBe('campaign')
  })
  it('status → cakupan toko; campaign baru → tak diukur', () => {
    const ev = buildEvents([
      ch({ date: '2026-09-23', field: 'operation_status', label: 'Status' }),
      ch({ campaign_id: 'C9', date: '2026-09-23', field: '_new', label: 'Campaign baru' }),
    ])
    expect(ev.get('C1|2026-09-23').scope).toBe('store')
    expect(ev.get('C9|2026-09-23').scope).toBe('none')
  })
  it('menandai perubahan lain pada campaign yang sama di dalam jendela', () => {
    const ev = buildEvents([
      ch({ date: '2026-09-23', field: 'budget', label: 'Budget' }),
      ch({ date: '2026-09-29', field: 'budget', label: 'Budget' }),
      ch({ date: '2026-09-10', field: 'budget', label: 'Budget' }),            // di luar jendela
      ch({ campaign_id: 'C2', date: '2026-09-28', field: 'budget', label: 'Budget' }), // campaign lain
    ])
    const m = mixedWith(ev.get('C1|2026-09-29'), ev)
    expect(m).toEqual([{ day: '2026-09-23', side: 'before', labels: ['Budget'] }])
    expect(mixedWith(ev.get('C1|2026-09-23'), ev)[0].side).toBe('after')
  })
})

describe('planRows', () => {
  const ch = (o) => ({ campaign_id: 'C1', campaign_name: 'Custom MAG', prev_date: addDays(o.date, -1), modify_time: null, ...o })
  it('strip dampak hanya di baris pertama tiap kejadian; rentang data mundur 7 hari', () => {
    const p = planRows([
      ch({ date: '2026-09-29', field: 'budget', label: 'Budget' }),
      ch({ date: '2026-09-20', field: 'roas_bid', label: 'Target ROAS' }),
      ch({ date: '2026-09-20', field: 'budget', label: 'Budget' }),
      ch({ campaign_id: 'C9', date: '2026-09-12', field: '_new', label: 'Campaign baru' }),
    ])
    expect(p.rows.map(r => r.first)).toEqual([true, true, false, true])
    expect(p.from).toBe('2026-09-13') // campaign baru tak diukur → tak ikut menarik rentang
  })
  it('kejadian di luar baris yang tampil tetap ikut dibangun', () => {
    const p = planRows([
      ch({ date: '2026-09-29', field: 'budget', label: 'Budget' }),
      ch({ date: '2026-09-25', field: 'budget', label: 'Budget' }),
    ], 1)
    expect(p.rows).toHaveLength(1)
    expect(mixedWith(p.rows[0].e, p.events)).toHaveLength(1)
  })
  it('tanpa perubahan → tak ada rentang', () => {
    expect(planRows([])).toMatchObject({ rows: [], from: null })
  })
})

describe('impactVerdict & impactSentence', () => {
  const upd = computeImpact({ day: '2026-09-29', series: UPDATE, snapshotDates: tanggal('2026-09-22', 13), lastDataDate: '2026-10-04' })
  it('mendeskripsikan gerak, tanpa klaim sebab', () => {
    expect(impactVerdict(upd)).toEqual({ text: 'Belanja naik, ROAS bertahan', tone: 'good' })
    expect(impactSentence(upd)).toBe('Sesudah perubahan, belanja naik 20% dan omzet naik 31% di campaign ini. ROAS bertahan: 10,2 menjadi 11,1.')
  })
  it('menahan kesimpulan bila tercampur', () => {
    expect(impactVerdict(upd, [{ day: '2026-09-23', side: 'before', labels: ['Budget'] }])).toEqual({ text: 'Tercampur', tone: 'warn' })
  })
  it('gerak di bawah 10% = hampir tak berubah', () => {
    const flat = hari('2026-09-22', Array.from({ length: 13 }, (_, i) => [100000 + i * 300, 800000 + i * 2000, 8]))
    const r = computeImpact({ day: '2026-09-29', series: flat, snapshotDates: tanggal('2026-09-22', 13), lastDataDate: '2026-10-04' })
    expect(impactVerdict(r)).toEqual({ text: 'Hampir tak berubah', tone: 'mute' })
  })
  it('menunggu & tanpa pembanding', () => {
    const w = computeImpact({ day: '2026-10-04', series: UPDATE, snapshotDates: tanggal('2026-09-22', 13), lastDataDate: '2026-10-04' })
    expect(impactVerdict(w).text).toBe('Menunggu data')
    const baru = computeImpact({ day: '2026-09-21', series: hari('2026-09-22', [[100, 900, 1]]), snapshotDates: tanggal('2026-09-14', 13), lastDataDate: '2026-09-26' })
    expect(impactVerdict(baru).text).toBe('Belum ada pembanding')
  })
})

describe('potret hasil backfill', () => {
  const row = (date, budget, o = {}) => ({
    snapshot_date: date, campaign_id: 'LIVE', campaign_name: 'LIVE GMV MAX | NEW', budget, roas_bid: 6.7,
    operation_status: 'ENABLE', item_group_ids: [], auto_budget: {},
    created_at: `${addDays(date, 1)}T00:33:00+00:00`, modify_time: '2026-09-18T10:57:44+00:00', ...o,
  })
  // Kejadian nyata 5 Okt 2026: potret 3 Okt diisi backfill dengan keadaan 5 Okt,
  // sehingga kenaikan budget 4 Okt 23.04 tertulis terjadi 3 Okt.
  const rows = [
    row('2026-10-02', 100000),
    row('2026-10-03', 200000, { created_at: '2026-10-05T09:32:08+00:00', modify_time: '2026-10-04T16:04:01+00:00' }),
    row('2026-10-04', 200000, { modify_time: '2026-10-04T16:04:01+00:00' }),
  ]
  it('tanpa penyaring, perubahan menempel di tanggal yang salah', () => {
    expect(buildChangeLog(rows).map(c => c.date)).toEqual(['2026-10-03'])
  })
  it('potret yang dibuat belakangan dibuang → tanggal & hari perubahan benar', () => {
    const log = buildChangeLog(dropBackfilledSnapshots(rows))
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ date: '2026-10-04', prev_date: '2026-10-02', from: 100000, to: 200000 })
    expect(changeDayOf(log[0])).toEqual({ day: '2026-10-04', timeKnown: true })
  })
  it('potret lama yang DITIMPA backfill ketahuan dari modify_time', () => {
    const timpa = [
      row('2026-10-02', 100000),
      row('2026-10-03', 200000, { modify_time: '2026-10-05T03:00:00+00:00' }), // created_at tetap lama
      row('2026-10-04', 200000, { modify_time: '2026-10-04T16:04:01+00:00' }),
    ]
    expect(dropBackfilledSnapshots(timpa).map(r => r.snapshot_date)).toEqual(['2026-10-02', '2026-10-04'])
  })
  it('potret normal tidak tersentuh', () => {
    const normal = [row('2026-10-01', 100000), row('2026-10-02', 100000)]
    expect(dropBackfilledSnapshots(normal)).toBe(normal)
  })
})
