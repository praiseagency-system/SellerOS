import { describe, it, expect } from 'vitest'
import { buildRecommendations, totalActions, roasBucket, spendBucket, ageDays, boostVerdict, medianCtr } from '../gmvmaxRecommendations'

const NOW = Date.parse('2026-08-28T00:00:00Z')
const vid = (o = {}) => ({
  videoId: o.id || 'v1', title: o.title || 'judul', account: o.account || 'akun',
  delivery: o.delivery || 'DELIVERING', timePosted: o.timePosted || '2026-08-01T00:00:00Z',
  lifetime: { cost: o.cost ?? 0, revenue: o.revenue ?? 0, orders: o.orders ?? 0, roas: o.roas ?? null },
  placements: o.placements || [],
})
const plc = (o = {}) => ({
  campaignId: o.c || 'c1', campaignName: o.cn || `campaign ${o.c || 'c1'}`, productId: o.p || 'p1',
  delivery: o.st || 'DELIVERING', cost: o.cost ?? 0, revenue: o.rev ?? 0, orders: o.ord ?? 0,
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

  it('yang sudah keluar rotasi menurut TikTok tak ditagih lagi — dihitung di catatan kaki', () => {
    const videos = [
      vid({ id: 'masih', roas: 2, cost: 80000, revenue: 160000, placements: [plc({ c: '1', cost: 80000 })] }),
      vid({ id: 'sudah', roas: 2, cost: 90000, revenue: 180000, delivery: 'EXCLUDED',
        placements: [plc({ c: '1', cost: 90000, st: 'EXCLUDED' })] }),
    ]
    const g = get(buildRecommendations({ videos, thresholds: TH, now: NOW }), 'WASTEFUL')
    expect(g.items.map(i => i.id)).toEqual(['masih'])
    expect(g.footnote).toMatch(/1 video disembunyikan/)
  })

  it('exclude yang sudah disetujui di 🔔 langsung menghapus barisnya — tak menunggu snapshot besok', () => {
    const videos = [vid({ id: 'v1', roas: 1, cost: 96810, revenue: 133000, placements: [plc({ c: 'exotic', cost: 96810 })] })]
    const excludes = { keluar: new Set(['v1|exotic']), menunggu: new Set() }
    const g = get(buildRecommendations({ videos, thresholds: TH, excludes, now: NOW }), 'WASTEFUL')
    expect(g.items).toHaveLength(0)
    expect(g.emptyNote).toMatch(/sudah dikeluarkan/)
  })

  it('baru diajukan (belum disetujui) TETAP tampil — uangnya masih terbakar — tapi ditandai', () => {
    const videos = [vid({ id: 'v1', roas: 1, cost: 96810, revenue: 133000, placements: [plc({ c: 'exotic', cost: 96810 })] })]
    const excludes = { keluar: new Set(), menunggu: new Set(['v1|exotic']) }
    const g = get(buildRecommendations({ videos, thresholds: TH, excludes, now: NOW }), 'WASTEFUL')
    expect(g.items).toHaveLength(1)
    expect(g.items[0].pending).toBe(true)
  })

  it('dikeluarkan dari SATU campaign padahal belanja di dua → tetap ditagih', () => {
    const videos = [vid({ id: 'v1', roas: 1, cost: 120000, revenue: 120000,
      placements: [plc({ c: 'a', cost: 60000 }), plc({ c: 'b', cost: 60000 })] })]
    const excludes = { keluar: new Set(['v1|a']), menunggu: new Set() }
    const g = get(buildRecommendations({ videos, thresholds: TH, excludes, now: NOW }), 'WASTEFUL')
    expect(g.items.map(i => i.id)).toEqual(['v1'])
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

// ── Vonis & alasan boost (Opsi A, 14 Sep 2026) ──────────────────────────────
const vb = (over = {}, life = {}) => ({
  videoId: 'v', title: 't', account: 'a', delivery: 'DELIVERING', placements: [],
  lifetime: { cost: 4101, revenue: 966037, orders: 7, impressions: 277, clicks: 24, ctr: 24 / 277, cvr: 7 / 24, roas: 235.6, funnel: { vr2s: 42.8 }, ...life },
  ...over,
})

describe('boostVerdict', () => {
  it('iklan bekerja → vonis iklan, kalimat menyebut CTR vs median & konversi', () => {
    const r = boostVerdict(vb(), { floor: 50000, medianCtr: 0.0337 })
    expect(r.vonis).toBe('iklan')
    expect(r.alasan).toContain('7 order berulang')
    expect(r.alasan).toContain('8% lantai')
    expect(r.alasan).toContain('2,6× median 3,4%')
    expect(r.alasan).toContain('29% klik jadi order')
    expect(r.alasan).toContain('Sedang tayang')
  })
  it('impresi < 50 → laku organik (data nyata: ROAS 1918× dari 4 impresi, 0 klik)', () => {
    const r = boostVerdict(vb({}, { cost: 1347, revenue: 2584431, orders: 4, impressions: 4, clicks: 0, ctr: 0, cvr: null }), { floor: 50000 })
    expect(r.vonis).toBe('organik')
    expect(r.alasan).toContain('menampilkan produk 4 kali, 0 klik')
    expect(r.alasan).toContain('omzet 2,58 jt')
  })
  it('cost ada tapi 0 tampilan produk → iklan tayang, penonton tak sampai ke produk', () => {
    const r = boostVerdict(vb({}, { cost: 32241, revenue: 514289, orders: 4, impressions: 0, clicks: 0, ctr: null, cvr: null }), { floor: 50000 })
    expect(r.vonis).toBe('organik')
    expect(r.alasan).toContain('Iklannya tayang (cost 32.241) tapi TikTok mencatat 0 tampilan produk')
  })
  it('NOT_DELIVERYING → tak tayang', () => {
    const r = boostVerdict(vb({ delivery: 'NOT_DELIVERYING' }, { impressions: 0, clicks: 0 }), { floor: 50000 })
    expect(r.vonis).toBe('tak_tayang')
    expect(r.alasan).toContain('tak tayang')
  })
  it('CVR > 100% disebut atribusi TikTok; hook 2s < 20% diperingatkan', () => {
    const r = boostVerdict(vb({}, { impressions: 81, clicks: 3, orders: 6, ctr: 3 / 81, cvr: 2, funnel: { vr2s: 11 } }), { floor: 50000, medianCtr: 0.0337 })
    expect(r.vonis).toBe('iklan')
    expect(r.alasan).toContain('order melebihi klik')
    expect(r.alasan).toContain('Hook 2s 11%, lemah')
  })
  it('item kandidat boost membawa vonis & alasan, signature tak berubah bentuk', () => {
    const g = get(buildRecommendations({ videos: [vb()], thresholds: TH, now: NOW }), 'BOOST_CANDIDATE')
    expect(g.items[0].vonis).toBe('iklan')
    expect(typeof g.items[0].alasan).toBe('string')
    expect(Object.keys(g.items[0].signature).sort()).toEqual(['aksi', 'roas_bucket', 'spend_bucket', 'status', 'umur_video_hari'])
  })
})

describe('medianCtr', () => {
  it('median CTR video berimpresi ≥100; null bila tak ada', () => {
    expect(medianCtr([])).toBeNull()
    const vs = [vb({}, { impressions: 200, ctr: 0.02 }), vb({}, { impressions: 300, ctr: 0.04 }), vb({}, { impressions: 10, ctr: 0.9 })]
    expect(medianCtr(vs)).toBeCloseTo(0.03)
  })
})
