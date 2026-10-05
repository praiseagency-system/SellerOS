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
