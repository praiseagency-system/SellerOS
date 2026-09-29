import { describe, it, expect } from 'vitest'
import { prioritasIkat, roasTerpercaya, engagementRate, bandingPrioritas } from './pikatPriority'

describe('prioritasIkat', () => {
  it('GMV organik besar → tinggi', () => {
    expect(prioritasIkat({ gmv_organic: 138000, views: 5600 }, null).level).toBe('tinggi')
  })
  it('ROAS sehat dari belanja berarti → tinggi; dari belanja receh → tidak', () => {
    expect(prioritasIkat({ views: 300 }, { cost: 6100, revenue: 74000 }).level).toBe('tinggi')
    expect(prioritasIkat({ views: 300 }, { cost: 41, revenue: 150000 }).alasan).toMatch(/omzet iklan/)
    expect(prioritasIkat({ views: 300 }, { cost: 41, revenue: 0 }).level).toBe('rendah')
  })
  it('views tinggi tanpa penjualan → sedang; video baru tanpa sinyal → rendah', () => {
    expect(prioritasIkat({ views: 29600, likes: 36, comments: 6, shares: 14 }, null).level).toBe('sedang')
    expect(prioritasIkat({ views: 318 }, null)).toMatchObject({ level: 'rendah', alasan: 'masih baru, belum ada sinyal' })
  })
})

describe('pembantu', () => {
  it('ROAS di bawah belanja minimum = null', () => {
    expect(roasTerpercaya({ cost: 4, revenue: 0 })).toBeNull()
    expect(roasTerpercaya({ cost: 10000, revenue: 50000 })).toBe(5)
  })
  it('ER null bila interaksi belum ada', () => {
    expect(engagementRate({ views: 100 })).toBeNull()
    expect(engagementRate({ views: 100, likes: 3, comments: 1, shares: 1 })).toBe(5)
  })
  it('urutan: prioritas, lalu uang, lalu views', () => {
    const x = (level, rank, gmv, views) => ({ p: { level, rank }, row: { gmv_organic: gmv, views }, ads: null })
    const list = [x('rendah', 2, 0, 900), x('tinggi', 0, 100000, 10), x('tinggi', 0, 500000, 5), x('sedang', 1, 0, 30000)]
    expect(list.sort(bandingPrioritas).map(i => i.row.gmv_organic + ':' + i.row.views)).toEqual(['500000:5', '100000:10', '0:30000', '0:900'])
  })
})
