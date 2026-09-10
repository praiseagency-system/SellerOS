import { describe, it, expect } from 'vitest'
import { buildProductMembership, membershipForCampaign } from '../gmvmaxProductMembership'

const snap = (date, produk, o = {}) => ({
  campaign_id: 'C1', campaign_name: 'Glance & Custom GMV Max',
  snapshot_date: date, item_group_ids: produk, modify_time: null, ...o,
})

describe('buildProductMembership', () => {
  // Riwayat asli campaign 1836106520532993 (dibaca dari produksi 9 Sep 2026):
  // dua produk sejak potret pertama, lalu 8 Sep +2 −1 sekaligus ganti nama.
  it('membaca tambah & cabut pada hari yang sama', () => {
    const m = buildProductMembership([
      snap('2026-09-07', ['A', 'B']),
      snap('2026-09-08', ['A', 'C', 'D'], { modify_time: '2026-09-08T14:57:41+00:00' }),
    ])
    expect(m.byProduct.get('C')).toMatchObject({
      present: true, addedOn: '2026-09-08', addedModifyTime: '2026-09-08T14:57:41+00:00',
    })
    expect(m.byProduct.get('D').addedOn).toBe('2026-09-08')
    expect(m.byProduct.get('B')).toMatchObject({ present: false, removedOn: '2026-09-08' })
    expect(m.byProduct.get('A')).toMatchObject({ present: true, sinceFirstSnapshot: true, addedOn: null })
    expect(m.events.map(e => `${e.kind}:${e.pid}`).sort()).toEqual(['ADDED:C', 'ADDED:D', 'REMOVED:B'])
  })

  // Yang sudah ada di potret pertama TIDAK boleh diklaim "ditambahkan hari itu" —
  // kita cuma tahu ia sudah ada sebelum kita mulai memotret.
  it('tak mengarang tanggal untuk produk yang sudah ada sejak awal', () => {
    const m = buildProductMembership([snap('2026-07-13', ['A', 'B']), snap('2026-07-14', ['A', 'B'])])
    for (const pid of ['A', 'B']) {
      expect(m.byProduct.get(pid)).toMatchObject({ sinceFirstSnapshot: true, addedOn: null, present: true })
    }
    expect(m.first).toBe('2026-07-13')
  })

  it('produk yang masuk lagi memakai kejadian terbaru, riwayatnya tetap di events', () => {
    const m = buildProductMembership([
      snap('2026-09-01', ['A']), snap('2026-09-02', []), snap('2026-09-03', ['A']),
    ])
    expect(m.byProduct.get('A')).toMatchObject({ present: true, addedOn: '2026-09-03', removedOn: null })
    expect(m.events.map(e => e.kind)).toEqual(['ADDED', 'REMOVED'])   // terbaru dulu
  })

  it('menghitung hari yang tak terpotret sebagai lubang, bukan diam-diam', () => {
    const m = buildProductMembership([snap('2026-09-01', ['A']), snap('2026-09-05', ['A'])])
    expect(m.snapshots).toBe(2)
    expect(m.gaps).toBe(3)
  })

  it('urutan masukan tak penting & baris tanpa tanggal diabaikan', () => {
    const m = buildProductMembership([
      snap('2026-09-03', ['A', 'B']), { campaign_id: 'C1', item_group_ids: ['Z'] }, snap('2026-09-02', ['A']),
    ])
    expect(m.first).toBe('2026-09-02')
    expect(m.byProduct.get('B').addedOn).toBe('2026-09-03')
    expect(m.byProduct.has('Z')).toBe(false)
  })

  it('item_group_ids kosong/null tak bikin runtuh', () => {
    const m = buildProductMembership([snap('2026-09-01', null), snap('2026-09-02', ['A'])])
    expect(m.byProduct.get('A').addedOn).toBe('2026-09-02')
    expect(buildProductMembership([])).toMatchObject({ first: null, snapshots: 0, gaps: 0 })
  })
})

describe('membershipForCampaign', () => {
  it('menyaring campaign lain sebelum menyusun riwayat', () => {
    const rows = [
      snap('2026-09-01', ['A']), snap('2026-09-02', ['A', 'B']),
      { ...snap('2026-09-02', ['X', 'Y']), campaign_id: 'C2' },
    ]
    const m = membershipForCampaign(rows, 'C1')
    expect([...m.byProduct.keys()].sort()).toEqual(['A', 'B'])
    expect(membershipForCampaign(rows, null).snapshots).toBe(0)
  })
})
