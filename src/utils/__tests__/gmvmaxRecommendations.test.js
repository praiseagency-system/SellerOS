import { describe, it, expect } from 'vitest'
import { buildRecommendations, totalActions, roasBucket, spendBucket, ageDays } from '../gmvmaxRecommendations'

const NOW = Date.parse('2026-08-28T00:00:00Z')
const vid = (o = {}) => ({
  videoId: o.id || 'v1', title: o.title || 'judul', account: o.account || 'akun',
  delivery: o.delivery || 'DELIVERING', timePosted: o.timePosted || '2026-08-01T00:00:00Z',
  lifetime: { cost: o.cost ?? 0, revenue: o.revenue ?? 0, orders: o.orders ?? 0, roas: o.roas ?? null },
  placements: o.placements || [],
})
const TH = { roasGood: 6, roasBad: 4, spendFloor: 50000 }
const get = (groups, key) => groups.find(g => g.key === key)

describe('ember sidik kondisi', () => {
  it('ember ROAS kasar — bukan angka mentah, supaya tiap ember cukup kasus', () => {
    expect(roasBucket(null)).toBe('tak_terukur')
    expect(roasBucket(0.5)).toBe('<1')
    expect(roasBucket(4)).toBe('4-6')
    expect(roasBucket(6)).toBe('6-8')
    expect(roasBucket(12)).toBe('>=8')
  })
  it('ember belanja relatif terhadap lantai, bukan angka tetap', () => {
    expect(spendBucket(0)).toBe('nol')
    expect(spendBucket(10000, 50000)).toBe('sangat_kecil')
    expect(spendBucket(40000, 50000)).toBe('kecil')
    expect(spendBucket(120000, 50000)).toBe('sedang')
    expect(spendBucket(500000, 50000)).toBe('besar')
  })
  it('umur video tak pernah negatif & aman untuk tanggal rusak', () => {
    expect(ageDays('2026-08-21T00:00:00Z', NOW)).toBe(7)
    expect(ageDays('bukan-tanggal', NOW)).toBe(null)
    expect(ageDays('2026-12-01T00:00:00Z', NOW)).toBe(0)
  })
})

describe('buildRecommendations', () => {
  it('kandidat boost: ROAS tinggi TAPI belanja masih di bawah lantai', () => {
    const videos = [
      vid({ id: 'a', roas: 9, cost: 12000, revenue: 108000 }),   // masuk
      vid({ id: 'b', roas: 9, cost: 90000, revenue: 810000 }),   // belanja sudah lewat lantai
      vid({ id: 'c', roas: 3, cost: 12000, revenue: 36000 }),    // ROAS kurang
      vid({ id: 'd', roas: 7, cost: 0, revenue: 0 }),            // belum belanja sama sekali
    ]
    const g = get(buildRecommendations({ videos, thresholds: TH, now: NOW }), 'BOOST_CANDIDATE')
    expect(g.items.map(i => i.id)).toEqual(['a'])
  })

  it('gerbang bukti: ROAS tinggi dari belanja nyaris nol DITAHAN, bukan disarankan', () => {
    // Kasus nyata 27 Agu: belanja Rp34, omzet 83rb, 1 order → ROAS 2445x.
    // Rasionya benar secara aritmetika tapi tak membuktikan apa pun.
    const videos = [
      vid({ id: 'artefak', roas: 2445, cost: 34, revenue: 83144, orders: 1 }),
      vid({ id: 'kredibel-belanja', roas: 15, cost: 5589, revenue: 85143, orders: 1 }),
      vid({ id: 'kredibel-order', roas: 20, cost: 900, revenue: 18000, orders: 2 }),
    ]
    const g = get(buildRecommendations({ videos, thresholds: TH, now: NOW }), 'BOOST_CANDIDATE')
    expect(g.items.map(i => i.id).sort()).toEqual(['kredibel-belanja', 'kredibel-order'])
    // Yang ditahan diungkap, bukan disembunyikan.
    expect(g.footnote).toMatch(/1 kandidat lain ditahan/)
  })

  it('tanpa kandidat tertahan, tak ada catatan kaki yang mengganggu', () => {
    const videos = [vid({ id: 'a', roas: 9, cost: 12000, revenue: 108000, orders: 3 })]
    const g = get(buildRecommendations({ videos, thresholds: TH, now: NOW }), 'BOOST_CANDIDATE')
    expect(g.items).toHaveLength(1)
    expect(g.footnote).toBe(null)
  })

  it('tiap butir membawa sidik kondisi — kait untuk loop belajar', () => {
    const videos = [vid({ id: 'a', roas: 9, cost: 12000, revenue: 108000, orders: 3, delivery: 'LEARNING', timePosted: '2026-08-16T00:00:00Z' })]
    const g = get(buildRecommendations({ videos, thresholds: TH, now: NOW }), 'BOOST_CANDIDATE')
    expect(g.items[0].signature).toEqual({
      aksi: 'CREATIVE_BOOST', status: 'LEARNING',
      roas_bucket: '>=8', spend_bucket: 'sangat_kecil', umur_video_hari: 12,
    })
  })

  it('boros: belanja sudah besar tapi ROAS di bawah ambang buruk', () => {
    const videos = [
      vid({ id: 'a', roas: 2, cost: 80000, revenue: 160000 }),   // masuk
      vid({ id: 'b', roas: 2, cost: 10000, revenue: 20000 }),    // belanjanya masih kecil
      vid({ id: 'c', roas: 5, cost: 80000, revenue: 400000 }),   // ROAS masih di atas ambang
    ]
    const g = get(buildRecommendations({ videos, thresholds: TH, now: NOW }), 'WASTEFUL')
    expect(g.items.map(i => i.id)).toEqual(['a'])
    expect(g.items[0].signature.aksi).toBe('CREATIVE_EXCLUDE')
  })

  it('otorisasi kedaluwarsa diurut yang paling lama mati dulu', () => {
    const sparkAuth = [
      { item_id: 'x', auth_end_time: '2026-08-25T00:00:00Z', tiktok_name: 'a' },
      { item_id: 'y', auth_end_time: '2026-08-12T00:00:00Z', tiktok_name: 'b' },
      { item_id: 'z', auth_end_time: '2026-09-24T00:00:00Z', tiktok_name: 'c' },  // masih berlaku
    ]
    const g = get(buildRecommendations({ sparkAuth, thresholds: TH, now: NOW }), 'AUTH_EXPIRED')
    expect(g.items.map(i => i.id)).toEqual(['y', 'x'])
  })

  it('campaign mati ber-budget: hanya yang benar-benar nonaktif DAN masih berbudget', () => {
    const settings = [
      { campaign_id: '1', campaign_name: 'mati berbudget', operation_status: 'DISABLE', budget: 7000000 },
      { campaign_id: '2', campaign_name: 'aktif', operation_status: 'ENABLE', budget: 350000 },
      { campaign_id: '3', campaign_name: 'mati bersih', operation_status: 'DISABLE', budget: 0 },
    ]
    const g = get(buildRecommendations({ settings, thresholds: TH, now: NOW }), 'CAMPAIGN_IDLE_BUDGET')
    expect(g.items.map(i => i.id)).toEqual(['1'])
  })

  it('butuh izin TAPI sudah menghasilkan — yang omzetnya nol tidak diikutkan', () => {
    const videos = [
      vid({ id: 'a', delivery: 'AUTHORIZATION_NEEDED', revenue: 500000, roas: null }),
      vid({ id: 'b', delivery: 'AUTHORIZATION_NEEDED', revenue: 0 }),
    ]
    const g = get(buildRecommendations({ videos, thresholds: TH, now: NOW }), 'AUTH_NEEDED_EARNING')
    expect(g.items.map(i => i.id)).toEqual(['a'])
  })

  it('kartu kosong TETAP ada — "tidak ada yang boros" itu informasi, bukan ruang kosong', () => {
    const groups = buildRecommendations({ videos: [], thresholds: TH, now: NOW })
    expect(groups).toHaveLength(5)
    expect(groups.every(g => g.items.length === 0)).toBe(true)
    expect(get(groups, 'WASTEFUL').emptyNote).toMatch(/masih menghasilkan/)
    expect(totalActions(groups)).toBe(0)
  })

  it('tanpa masukan apa pun tidak meledak', () => {
    expect(() => buildRecommendations()).not.toThrow()
    expect(totalActions(buildRecommendations())).toBe(0)
  })
})
