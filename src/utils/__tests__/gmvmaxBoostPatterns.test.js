import { describe, it, expect } from 'vitest'
import { boostProfile, groupPatterns, MIN_JUDGED } from '../gmvmaxBoostPatterns'

const CFG = { roiFloor: 4, spendFloor: 50000 }
const day = (n) => new Date(Date.parse('2026-09-18T00:00:00Z') + (n - 1) * 86400000).toISOString().slice(0, 10)
const exp = (o = {}) => ({ id: 'e1', experiment_type: 'MANUAL_BOOST', creative_video_id: 'v1', campaign_id: 'c1', start_at: '2026-09-18T02:31:00Z', ...o })
// rows: [[hariKe, belanja, omzet, order, status], …] → { byDate, dates }
const world = (rows, extraDates = []) => {
  const byDate = new Map(), dates = new Set(extraDates.map(day))
  for (const [n, cost, revenue, orders, status] of rows) {
    dates.add(day(n))
    byDate.set(day(n), { cost, revenue, orders, impressions: cost / 10, clicks: cost / 200, statuses: status ? [{ campaignId: 'c1', status }] : [] })
  }
  return { byDate, dates }
}
const prof = (rows, o = {}, extra) => { const w = world(rows, extra); return boostProfile(exp(o), w.byDate, w.dates, CFG) }
const pre = (status, spendPerDay, roi = 6) => Array.from({ length: 7 }, (_, i) => [i - 6, spendPerDay, spendPerDay * roi, 1, status])
const post = (spendPerDay, roi, days = 7) => Array.from({ length: days }, (_, i) => [i + 1, spendPerDay, spendPerDay * roi, 2, 'DELIVERING'])

describe('profil satu boost', () => {
  it('sudah tayang & sudah berbelanja → di atas ambang', () => {
    const p = prof([...pre('DELIVERING', 50000, 6), ...post(60000, 7)])
    expect([p.group, p.outcome, p.preStatus, p.complete]).toEqual(['tayang_besar', 'above', 'DELIVERING', true])
    expect([p.pre.days, p.pre.spend, p.post.days, p.post.spend]).toEqual([7, 350000, 7, 420000])
    expect(p.preRoiShown).toBeCloseTo(6)
    expect(p.post.roi).toBeCloseTo(7)
  })
  it('belum tayang: Antre → di bawah ambang; ROI sebelum tidak ditampilkan bila belanjanya receh', () => {
    const p = prof([...pre('IN_QUEUE', 100, 200), ...post(20000, 2)])
    expect([p.group, p.outcome, p.preRoiShown]).toEqual(['belum', 'below', null])
  })
  it('sudah tayang tetapi belanja sebelum boost di bawah lantai', () => {
    expect(prof([...pre('DELIVERING', 3000), ...post(30000, 5)]).group).toBe('tayang_kecil')
  })
  it('hasil belum dinilai: kurang hari berdata / belanja di bawah lantai / ambang kosong', () => {
    expect(prof([...pre('DELIVERING', 50000), ...post(60000, 9, 3)]).outcome).toBe('wait') // 3 hari berdata
    expect(prof([...pre('DELIVERING', 50000), ...post(5000, 9)]).outcome).toBe('wait') // Rp35 rb < lantai
    const w = world([...pre('DELIVERING', 50000), ...post(60000, 9)])
    expect(boostProfile(exp(), w.byDate, w.dates, { roiFloor: null }).outcome).toBe('wait')
    expect(prof([...pre('DELIVERING', 50000), ...post(60000, 9, 4)]).outcome).toBe('above') // 4 hari cukup
  })
  it('hari yang datanya masuk tetapi videonya tak muncul = Rp0; hari tanpa potret tidak dihitung', () => {
    // Potret hari ke-3 dan ke-4 ada, videonya tak ada di laporan; hari ke-5..7 tidak ada potret.
    const p = prof([...pre('DELIVERING', 50000), [1, 60000, 300000, 3, 'DELIVERING'], [2, 60000, 300000, 3, 'DELIVERING']], {}, [3, 4])
    expect([p.post.days, p.post.spend, p.complete]).toEqual([4, 120000, false])
  })
  it('status sebelum boost tak terekam → kelompok sendiri; bukan boost video → null', () => {
    expect(prof(post(60000, 6)).group).toBe('tanpa')
    expect(prof(post(60000, 6), { creative_video_id: null })).toBe(null)
    expect(prof(post(60000, 6), { experiment_type: 'NEW_CREATIVE_TEST' })).toBe(null)
    expect(prof(post(60000, 6), { start_at: 'x' })).toBe(null)
  })
  it('status di campaign eksperimennya yang dipakai', () => {
    const w = world([...pre('DELIVERING', 50000), ...post(60000, 6)])
    for (const v of w.byDate.values()) v.statuses = [{ campaignId: 'c1', status: 'AUTHORIZATION_NEEDED' }, { campaignId: 'c2', status: 'DELIVERING' }]
    expect(boostProfile(exp(), w.byDate, w.dates, CFG).group).toBe('belum')
    expect(boostProfile(exp({ campaign_id: 'c2' }), w.byDate, w.dates, CFG).group).toBe('tayang_besar')
  })
})

describe('kelompok', () => {
  const many = [
    ...Array.from({ length: 4 }, (_, i) => ({ ...prof([...pre('DELIVERING', 50000, 5 + i), ...post(60000, 6 + i)]), id: `a${i}` })),
    { ...prof([...pre('IN_QUEUE', 100), ...post(20000, 2)]), id: 'b1' },
    { ...prof([...pre('LEARNING', 100), ...post(20000, 6)]), id: 'b2' },
    { ...prof([...pre('DELIVERING', 50000), ...post(60000, 9, 2)]), id: 'a-wait' },
    null,
  ]
  it('hitungan "N dari M" per kelompok, urutan tetap, kelompok kosong dibuang', () => {
    const r = groupPatterns(many, CFG)
    expect(r.groups.map(g => g.key)).toEqual(['tayang_besar', 'belum'])
    const [a, b] = r.groups
    expect([a.n, a.judged, a.above, a.below, a.wait]).toEqual([5, 4, 4, 0, 1])
    expect(a.medianRoi).toBeCloseTo(7.5)
    expect(a.note).toBe('ROI sebelum boost pun sudah 5,0x–8,0x')
    expect([b.n, b.judged, b.above, b.below]).toEqual([2, 2, 1, 1])
    expect(b.note).toBe('1 yang di bawah ambang: sebelumnya Antre')
    expect([r.total, r.judged, r.above, r.below, r.enough, r.hasFloor]).toEqual([7, 6, 5, 1, true, true])
  })
  it('terlalu sedikit boost → belum cukup; tanpa ambang → hasFloor false', () => {
    expect(groupPatterns(many.slice(0, MIN_JUDGED - 1), CFG).enough).toBe(false)
    expect(groupPatterns(many, { roiFloor: null }).hasFloor).toBe(false)
    expect(groupPatterns([], CFG)).toMatchObject({ groups: [], total: 0, enough: false })
  })
})
