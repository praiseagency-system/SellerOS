import { describe, it, expect } from 'vitest'
import { liveConclusion } from '../gmvmaxExperimentLive'
import { computeWindows } from '../../gmvmax/skills/experimentWindows.mjs'
import { verdictReasonID } from '../gmvmaxExperimentFormat'

const exp = (o = {}) => ({ id: 'e1', experiment_type: 'MANUAL_BOOST', start_at: '2026-09-19T07:05:00Z', status: 'RUNNING', contaminated: false, ...o })
const dayN = (n) => new Date(Date.parse('2026-09-19T00:00:00Z') + (n - 1) * 86400000).toISOString().slice(0, 10)
const windows = (roi, days = 7, spend = 50000) => JSON.parse(JSON.stringify(computeWindows({
  experiment: exp(), ruleConfig: { roiFloor: 4, spendFloor: 50000 },
  series: Array.from({ length: days }, (_, i) => ({ date: dayN(i + 1), spend, revenue: spend * roi, orders: 3 })),
}).windows))
const legacy = [
  { label: 'H+1', date: '2026-09-20', roi: 10.6, spend: 33438, baseline_state: 'DISCLOSED_NOT_COMPARABLE' },
  { label: 'H+3', date: '2026-09-22', roi: 41.2, spend: 6559, baseline_state: 'DISCLOSED_NOT_COMPARABLE' },
  { label: 'H+7', date: '2026-09-26', roi: 5.4, spend: 27683, baseline_state: 'DISCLOSED_NOT_COMPARABLE' },
]

describe('liveConclusion', () => {
  it('format v2 → aturan jendela, dengan kode alasan', () => {
    const v = liveConclusion(exp({ checkpoints: windows(6) }), { roiFloor: 4, spendFloor: 50000 })
    expect(v).toMatchObject({ format: 'v2', conclusion: 'SUSTAINABLE_WINNER', confidence: 'MEDIUM', code: 'W7_WIN' })
  })
  it('format lama → aturan lama apa adanya (transisi: server belum diganti)', () => {
    const v = liveConclusion(exp({ checkpoints: legacy }), { roiFloor: 4, spendFloor: 50000 })
    expect(v).toMatchObject({ format: 'legacy', conclusion: 'SUSTAINABLE_WINNER' })
    expect(liveConclusion(exp({ checkpoints: legacy }), 4).conclusion).toBe('SUSTAINABLE_WINNER') // pemanggil lama: angka saja
    expect(liveConclusion(exp({ checkpoints: legacy }), null).conclusion).toBe('INCONCLUSIVE')
  })
  it('vonis ikut berubah seketika saat ambang diubah', () => {
    const cps = windows(5)
    expect(liveConclusion(exp({ checkpoints: cps }), { roiFloor: 4 }).conclusion).toBe('SUSTAINABLE_WINNER')
    expect(liveConclusion(exp({ checkpoints: cps }), { roiFloor: 6 }).conclusion).toBe('WEAK')
    expect(liveConclusion(exp({ checkpoints: cps }), { roiFloor: null }).code).toBe('NO_ROI_FLOOR')
  })
  it('lantai belanja selalu ada: tanpa setelan pun jendela receh tidak divonis', () => {
    const v = liveConclusion(exp({ checkpoints: windows(80, 7, 150) }), { roiFloor: 4 })
    expect(v).toMatchObject({ conclusion: 'DATA_INSUFFICIENT', code: 'W7_LOW_SPEND' })
    expect(liveConclusion(exp({ checkpoints: windows(80, 7, 150) }), { roiFloor: 4, spendFloor: 0 }).code).toBe('W7_LOW_SPEND')
  })
  it('tercampur dan boost ulang membatasi vonis — sama dengan server', () => {
    expect(liveConclusion(exp({ checkpoints: windows(6), contaminated: true }), { roiFloor: 4 }))
      .toMatchObject({ conclusion: 'WINNER_CANDIDATE', confidence: 'LOW' })
    const cps = windows(6); cps[1].overlap_day = 5
    expect(liveConclusion(exp({ checkpoints: cps }), { roiFloor: 4 }).params.caps).toEqual(['REBOOST'])
  })
  it('belum pernah dihitung → belum konklusif (baru dicatat), bukan data kurang', () => {
    expect(liveConclusion(exp({ checkpoints: [] }), { roiFloor: 4 })).toMatchObject({ format: 'empty', conclusion: 'INCONCLUSIVE', code: 'NOT_EVALUATED' })
    expect(liveConclusion(exp({ checkpoints: null }), { roiFloor: 4 }).code).toBe('NOT_EVALUATED')
    // ditutup tanpa pernah dihitung: jalur lama (STOPPED dihormati)
    expect(liveConclusion(exp({ checkpoints: [], status: 'STOPPED' }), { roiFloor: 4 }).conclusion).toBe('STOPPED')
  })
  it('format tak dikenal → vonis DB, tidak menghitung sendiri', () => {
    const v = liveConclusion(exp({ checkpoints: [{ v: 3, kind: 'window', key: 'w7' }], conclusion: 'WEAK', confidence: 'MEDIUM' }), { roiFloor: 4 })
    expect(v).toMatchObject({ format: 'unknown', conclusion: 'WEAK', confidence: 'MEDIUM' })
  })
  it('video dikeluarkan: arah dibaca dari perlakuan', () => {
    const v = liveConclusion(exp({ experiment_type: 'CREATIVE_EXCLUSION', treatment: 'Video dikeluarkan dari rotasi', checkpoints: windows(0, 7, 80) }), { roiFloor: 4 })
    expect(v.code).toBe('REMOVED_DONE')
  })
})

describe('verdictReasonID', () => {
  const reason = (cps, o = {}, cfg = { roiFloor: 4, spendFloor: 50000 }) => verdictReasonID(liveConclusion(exp({ checkpoints: cps, ...o }), cfg), { noun: 'boost' })
  it('pemenang: ROI gabungan, belanja, dan N dari M hari berbelanja', () => {
    expect(reason(windows(6))).toBe('ROI gabungan 7 hari pertama 6,0x dari belanja Rp350 rb, di atas ambang 4x; 7 dari 7 hari berbelanja di atas ambang.')
  })
  it('kandidat menyebut sebab pembatasnya', () => {
    expect(reason(windows(6), { contaminated: true })).toContain('tetapi tercampur perubahan lain, jadi belum tentu karena boost ini.')
  })
  it('lemah, sementara, dan tak dinilai punya kalimat sendiri', () => {
    expect(reason(windows(2))).toBe('ROI gabungan 7 hari pertama 2,0x dari belanja Rp350 rb, di bawah ambang 4x.')
    expect(reason(windows(6, 3))).toBe('Sementara: 3 hari pertama 6,0x dari belanja Rp150 rb, di atas ambang 4x. Vonis akhir 26 Sep.')
    expect(reason(windows(6, 7, 1000))).toBe('Belanja 7 hari pertama hanya Rp7 rb, di bawah lantai belanja Rp50 rb — terlalu kecil untuk dinilai.')
    expect(reason(windows(0, 3, 0))).toBe('Belum ada belanja dalam 3 hari pertama. Vonis akhir 26 Sep.')
  })
  it('tidak pernah memuat istilah mesin atau NaN', () => {
    for (const cps of [windows(6), windows(2), windows(6, 3), windows(6, 2), windows(0, 7, 0), []]) {
      for (const cfg of [{ roiFloor: 4 }, { roiFloor: null }]) {
        const t = reason(cps, {}, cfg)
        expect(t).not.toMatch(/NaN|undefined|null|checkpoint|baseline|Infinity/)
        expect(t.length).toBeGreaterThan(10)
      }
    }
  })
})

describe('perbaikan pasca-tinjauan', () => {
  const CFG = { roiFloor: 4, spendFloor: 50000 }
  const win = (rows) => JSON.parse(JSON.stringify(computeWindows({
    experiment: exp(), ruleConfig: CFG,
    series: rows.map(([n, spend, revenue, orders]) => ({ date: dayN(n), spend, revenue, orders })),
  }).windows))
  const text = (e, noun = 'boost') => verdictReasonID(liveConclusion(e, CFG), { noun })

  it('lemah tanpa order: tidak lagi disebut "selisih tipis"', () => {
    const t = text(exp({ checkpoints: win(Array.from({ length: 7 }, (_, i) => [i + 1, 12000, 0, 0])) }))
    expect(t).toContain('belum ada order sama sekali')
    expect(t).not.toContain('selisih tipis')
  })
  it('ROI yang dibulatkan menyentuh ambang ditulis dua desimal', () => {
    const t = text(exp({ checkpoints: win(Array.from({ length: 7 }, (_, i) => [i + 1, 100000, 397000, 4])) }))
    expect(t).toContain('3,97x')
    expect(t).toContain('di bawah ambang 4x')
    expect(t).not.toContain('4,0x')
  })
  it('video dikeluarkan: belanja hari aksi dipisah dari belanja sesudahnya', () => {
    const cps = win([[1, 60000, 240000, 3], ...Array.from({ length: 6 }, (_, i) => [i + 2, 0, 0, 0])])
    const t = text(exp({ experiment_type: 'CREATIVE_EXCLUSION', treatment: 'Video dikeluarkan dari rotasi', checkpoints: cps }), 'perubahan')
    expect(t).toContain('Video berhenti dibelanjai: Rp0 dalam 6 hari sesudah dikeluarkan')
    expect(t).toContain('hari dikeluarkan Rp60 rb')
    expect(t).not.toContain('masih dibelanjai')
  })
  it('campaign dijeda: tidak divonis dari ROI sebelum jeda', () => {
    const cps = win([[1, 500000, 1000000, 12], ...Array.from({ length: 6 }, (_, i) => [i + 2, 0, 0, 0])])
    const v = liveConclusion(exp({ experiment_type: 'OTHER_APPROVED', treatment: 'Status campaign → DISABLE', checkpoints: cps }), CFG)
    expect(v.conclusion).toBe('DATA_INSUFFICIENT')
    expect(verdictReasonID(v, { noun: 'perubahan' })).toContain('Campaign berhenti dibelanjai')
  })
  it('boost lain: sebabnya selalu sampai ke kalimat, juga pada Lemah dan saat ada >2 pembatas', () => {
    const weak = win(Array.from({ length: 7 }, (_, i) => [i + 1, 50000, 100000, 2]))
    weak[1].overlap_day = 3
    expect(text(exp({ checkpoints: weak }))).toContain('Keyakinan rendah: ada boost lain pada video/produk yang sama mulai hari ke-3')
    // Pemenang dengan banyak pembatas: REBOOST tetap disebut pertama.
    const capped = win([[1, 60000, 900000, 3], [2, 6000, 0, 0], [3, 6000, 0, 0], [4, 6000, 0, 0], [5, 6000, 0, 0], [6, 6000, 0, 0], [7, 6000, 0, 0]])
    capped[1].overlap_day = 5
    const t = text(exp({ checkpoints: capped }))
    expect(t).toContain('ada boost lain pada video/produk yang sama mulai hari ke-5')
    expect(t).toMatch(/\+\d sebab lain/)
  })
  it('tanda tercampur warisan (kejadian hari ke-8) tidak membatasi vonis', () => {
    const lama = { contaminated: true, contamination: { kejadian: [{ jenis: 'setelan_campaign', tanggal: '2026-09-26' }] } } // hari ke-8
    expect(liveConclusion(exp({ checkpoints: windows(6), ...lama }), CFG).conclusion).toBe('SUSTAINABLE_WINNER')
    const dalam = { contaminated: true, contamination: { kejadian: [{ jenis: 'setelan_campaign', tanggal: '2026-09-25' }] } } // hari ke-7
    expect(liveConclusion(exp({ checkpoints: windows(6), ...dalam }), CFG)).toMatchObject({ conclusion: 'WINNER_CANDIDATE', confidence: 'LOW' })
  })
  it('baris yang ditutup sebelum 7 hari: sementara, dengan tanggal vonis akhir', () => {
    const v = liveConclusion(exp({ status: 'CONCLUDED', checkpoints: windows(6, 3) }), CFG)
    expect(v.provisional).toBe(true)
    expect(verdictReasonID(v)).toContain('Vonis akhir 26 Sep')
    expect(liveConclusion(exp({ status: 'CONCLUDED', checkpoints: [] }), CFG).code).toBe('NOT_EVALUATED')
  })
})
