import { describe, it, expect } from 'vitest'
import {
  ALL, CLOSE, typeKey, verdictBucket, summarize, applyFilter, buildTiles, resolveFilter,
} from '../gmvmaxExperimentGroups'

const mk = (id, type, conclusion, alerts = []) => ({ exp: { id, experiment_type: type }, conclusion, alerts })
const items = [
  mk(1, 'MANUAL_BOOST', 'SUSTAINABLE_WINNER', [{ kind: 'BOOST_ENDED' }]),
  mk(2, 'NEW_CREATIVE_TEST', 'WEAK'),
  mk(3, 'NEW_CREATIVE_TEST', 'TEMPORARY_SPIKE', [{ kind: 'WINDOW_PASSED', days: 9 }]),
  mk(4, 'NEW_CREATIVE_TEST', 'DATA_INSUFFICIENT'),
  mk(5, 'CREATIVE_EXCLUSION', 'INCONCLUSIVE'),
]

describe('verdictBucket', () => {
  it('dua jenis pemenang masuk satu keranjang', () => {
    expect(verdictBucket('SUSTAINABLE_WINNER')).toBe('win')
    expect(verdictBucket('WINNER_CANDIDATE')).toBe('win')
  })
  it('belum konklusif, data kurang, dihentikan, tak dikenal = belum ada vonis', () => {
    for (const c of ['INCONCLUSIVE', 'DATA_INSUFFICIENT', 'STOPPED', 'APA_SAJA', undefined]) {
      expect(verdictBucket(c)).toBe('none')
    }
  })
})

describe('summarize', () => {
  it('jumlah keranjang = total', () => {
    const s = summarize(items)
    expect(s).toEqual({ total: 5, win: 1, spike: 1, weak: 1, none: 2 })
    expect(s.win + s.spike + s.weak + s.none).toBe(s.total)
  })
})

describe('buildTiles', () => {
  const tiles = buildTiles(items)
  it('urutan: Semua, jenis terbanyak dulu, Perlu ditutup terakhir', () => {
    expect(tiles.map(t => t.key)).toEqual([
      ALL, typeKey('NEW_CREATIVE_TEST'), typeKey('MANUAL_BOOST'), typeKey('CREATIVE_EXCLUSION'), CLOSE,
    ])
  })
  it('hitungan per ubin', () => {
    expect(tiles.map(t => t.total)).toEqual([5, 3, 1, 1, 2])
  })
  it('ubin Perlu ditutup hilang bila tak ada peringatan', () => {
    const t = buildTiles(items.map(it => ({ ...it, alerts: [] })))
    expect(t.some(x => x.key === CLOSE)).toBe(false)
  })
  it('daftar kosong → hanya Semua bernilai nol', () => {
    expect(buildTiles([])).toEqual([{ key: ALL, total: 0, win: 0, spike: 0, weak: 0, none: 0 }])
  })
})

describe('applyFilter', () => {
  it('Semua tak menyaring', () => expect(applyFilter(items, ALL)).toHaveLength(5))
  it('per jenis', () => {
    expect(applyFilter(items, typeKey('NEW_CREATIVE_TEST')).map(i => i.exp.id)).toEqual([2, 3, 4])
  })
  it('Perlu ditutup lintas jenis', () => {
    expect(applyFilter(items, CLOSE).map(i => i.exp.id)).toEqual([1, 3])
  })
})

describe('resolveFilter', () => {
  it('ubin yang sudah tak ada jatuh ke Semua', () => {
    const tiles = buildTiles(items)
    expect(resolveFilter(tiles, typeKey('MANUAL_BOOST'))).toBe(typeKey('MANUAL_BOOST'))
    expect(resolveFilter(tiles, typeKey('AFFILIATE_TEST'))).toBe(ALL)
  })
})
