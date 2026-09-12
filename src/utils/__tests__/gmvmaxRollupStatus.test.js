// Status pengiriman di rollup: TANGGAL dulu, baru keaktifan.
//
// Aturan lama ("paling aktif menang") membuat status lama menutupi status baru.
// Kasus nyata 12 Sep 2026: video 7681842443452419335 ditandai EXCLUDED oleh
// TikTok pada snapshot 7 Sep, tapi baris 6 Sep-nya DELIVERING — aplikasi terus
// membacanya DELIVERING, menahannya di kartu "video boros", dan menawarkan
// tombol Exclude untuk video yang sudah keluar rotasi.
import { describe, it, expect } from 'vitest'
import { rollupVideos } from '../gmvmaxRollup'

const row = (o) => ({
  videoId: o.id || 'v1', creativeType: 'Video', videoTitle: 'judul', tiktokAccount: 'akun',
  campaignId: o.c || 'c1', campaignName: o.cn || 'campaign', productId: o.p || 'p1',
  status: o.status, snapshotDate: o.date, cost: o.cost ?? 0, grossRevenue: o.rev ?? 0, skuOrders: 0,
})

describe('status video = snapshot terbaru', () => {
  it('EXCLUDED hari ini mengalahkan DELIVERING kemarin', () => {
    const [v] = rollupVideos([
      row({ date: '2026-09-06', status: 'DELIVERING', cost: 23064, rev: 90193 }),
      row({ date: '2026-09-07', status: 'EXCLUDED', cost: 157825, rev: 393499 }),
    ])
    expect(v.delivery).toBe('EXCLUDED')
    expect(v.placements[0].delivery).toBe('EXCLUDED')
    expect(Math.round(v.lifetime.cost)).toBe(180889)   // angka tetap dijumlah, bukan diganti
  })

  it('urutan baris tak berpengaruh — tanggal yang menentukan', () => {
    const [v] = rollupVideos([
      row({ date: '2026-09-07', status: 'EXCLUDED' }),
      row({ date: '2026-09-06', status: 'DELIVERING' }),
    ])
    expect(v.delivery).toBe('EXCLUDED')
  })

  it('tanggal sama → yang paling aktif menang (video ikut beberapa campaign)', () => {
    const [v] = rollupVideos([
      row({ date: '2026-09-11', status: 'AUTHORIZATION_NEEDED', c: 'a' }),
      row({ date: '2026-09-11', status: 'DELIVERING', c: 'b' }),
    ])
    expect(v.delivery).toBe('DELIVERING')
    expect(v.placements.find(p => p.campaignId === 'a').delivery).toBe('AUTHORIZATION_NEEDED')
  })

  it('baris tanpa tanggal (data lama) tak pernah menimpa baris bertanggal', () => {
    const [v] = rollupVideos([
      row({ date: '2026-09-07', status: 'EXCLUDED' }),
      row({ date: null, status: 'DELIVERING' }),
    ])
    expect(v.delivery).toBe('EXCLUDED')
  })

  it('status kosong diabaikan, tak menghapus status yang sudah ada', () => {
    const [v] = rollupVideos([
      row({ date: '2026-09-07', status: 'DELIVERING' }),
      row({ date: '2026-09-08', status: null }),
    ])
    expect(v.delivery).toBe('DELIVERING')
  })
})
