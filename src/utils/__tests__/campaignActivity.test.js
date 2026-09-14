import { describe, it, expect } from 'vitest'
import {
  isClientEntry, clientDecisions, newDecisions, campaignActivity,
  activityTotals, newKeys, fmtAgo, actorOf,
} from '../campaignActivity'

const NOW = Date.parse('2026-09-14T12:00:00Z')
const at = mins => new Date(NOW - mins * 60000).toISOString()

const camp = {
  id: 'c1', name: 'PREMIUM-XBP',
  items: [
    { productId: 'p1', varIdx: 0, name: 'Avalon 50ml' },
    { productId: 'p1', varIdx: 1, name: 'Avalon Mag 100ml' },
    { productId: 'p2', varIdx: 0, name: 'Serum Glow 30ml' },
  ],
  approvalLog: [
    { productId: 'p2', status: 'approved', by: 'rina@client.com', byName: 'Rina', at: at(600) },
    { productId: 'p1:0', status: 'approved', by: 'rina@client.com', byName: 'Rina', at: at(12) },
    { productId: 'p1:1', status: 'rejected', by: 'rina@client.com', byName: 'Rina', note: 'harga tinggi', at: at(10) },
  ],
}

describe('isClientEntry', () => {
  it('entri tanpa email bukan keputusan client', () => {
    expect(isClientEntry({ status: 'approved', at: at(1) })).toBe(false)
  })
  it('keputusan admin sendiri lewat /approve tidak dihitung', () => {
    const e = { status: 'approved', by: 'Admin@Toko.com', at: at(1) }
    expect(isClientEntry(e, 'admin@toko.com')).toBe(false)
    expect(isClientEntry(e, 'lain@toko.com')).toBe(true)
  })
  it('status pending diabaikan', () => {
    expect(isClientEntry({ status: 'pending', by: 'a@b.com', at: at(1) }, '')).toBe(false)
  })
})

describe('clientDecisions', () => {
  it('terbaru dulu dan nama SKU ikut terbaca dari itemKey', () => {
    const d = clientDecisions(camp, 'admin@toko.com')
    expect(d.map(e => e.sku)).toEqual(['Avalon Mag 100ml', 'Avalon 50ml', null])
    expect(d[0].campaignName).toBe('PREMIUM-XBP')
  })
  it('campaign tanpa log aman', () => {
    expect(clientDecisions({ id: 'x' }, '')).toEqual([])
  })
})

describe('newDecisions & campaignActivity', () => {
  it('batas waktu memotong keputusan lama', () => {
    expect(newDecisions(camp, at(30), '').length).toBe(2)
    expect(newDecisions(camp, at(5), '').length).toBe(0)
    expect(newDecisions(camp, '', '').length).toBe(3)
  })
  it('kalimat ringkas menyebut approver, jumlah setuju, dan tolak', () => {
    const a = campaignActivity(camp, at(30), '')
    expect(a.count).toBe(2)
    expect(a.sentence).toBe('Rina menyetujui 1 SKU, menolak 1')
    expect(a.latest.sku).toBe('Avalon Mag 100ml')
  })
  it('approver lain dihitung terpisah di ekor kalimat', () => {
    const two = { ...camp, approvalLog: [
      ...camp.approvalLog,
      { productId: 'p2', status: 'approved', by: 'dimas@client.com', byName: 'Dimas', at: at(5) },
    ] }
    const a = campaignActivity(two, at(30), '')
    expect(a.count).toBe(3)
    expect(a.sentence).toBe('Dimas menyetujui 1 SKU · 2 keputusan lain')
    expect(a.actors).toEqual(['Dimas', 'Rina'])
  })
  it('tanpa keputusan baru mengembalikan count 0', () => {
    expect(campaignActivity(camp, at(1), '').count).toBe(0)
  })
  it('nama kosong jatuh ke email', () => {
    expect(actorOf({ by: 'a@b.com', byName: '  ' })).toBe('a@b.com')
  })
})

describe('activityTotals & newKeys', () => {
  it('menghitung total keputusan dan jumlah campaign', () => {
    const t = activityTotals([camp, { id: 'c2', name: 'kosong' }], at(30), '')
    expect(t.count).toBe(2); expect(t.campaigns).toBe(1); expect(t.ids.has('c1')).toBe(true)
  })
  it('kunci SKU ikut menandai produk induknya', () => {
    const k = newKeys(camp, at(30), '')
    expect([...k].sort()).toEqual(['p1', 'p1:0', 'p1:1'])
  })
})

describe('fmtAgo', () => {
  it('menit, jam, kemarin, hari, lalu tanggal', () => {
    expect(fmtAgo(at(12), NOW)).toBe('12 menit lalu')
    expect(fmtAgo(at(0.5), NOW)).toBe('baru saja')
    expect(fmtAgo(at(180), NOW)).toBe('3 jam lalu')
    expect(fmtAgo(at(60 * 25), NOW)).toBe('kemarin')
    expect(fmtAgo(at(60 * 24 * 3), NOW)).toBe('3 hari lalu')
    expect(fmtAgo(at(60 * 24 * 20), NOW)).toMatch(/Agu/)
    expect(fmtAgo('', NOW)).toBe('')
  })
})
