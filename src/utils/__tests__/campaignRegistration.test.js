import { describe, it, expect } from 'vitest'
import {
  registrationStatus, isRegistered, registrationBadge, registrationDetail,
  buildRegistration, registrationTotals, REGISTRATION,
} from '../campaignRegistration'

describe('registrationStatus', () => {
  it('kolom kosong / belum ada → none', () => {
    expect(registrationStatus({})).toBe('none')
    expect(registrationStatus({ registration: {} })).toBe('none')
    expect(registrationStatus(null)).toBe('none')
  })
  it('nilai asing jatuh ke none', () => {
    expect(registrationStatus({ registration: { status: 'ngawur' } })).toBe('none')
  })
  it('status sah terbaca apa adanya', () => {
    expect(registrationStatus({ registration: { status: 'progress' } })).toBe('progress')
    expect(isRegistered({ registration: { status: 'done' } })).toBe(true)
    expect(isRegistered({ registration: { status: 'progress' } })).toBe(false)
  })
})

describe('registrationBadge', () => {
  it('none disembunyikan dari client, ditampilkan ke admin', () => {
    expect(registrationBadge({})).toBe(null)
    expect(registrationBadge({}, { showNone: true }).label).toBe(REGISTRATION.none.label)
  })
  it('done memakai label penuh', () => {
    expect(registrationBadge({ registration: { status: 'done' } }).label).toBe('Sudah didaftarkan')
  })
})

describe('registrationDetail', () => {
  it('merangkai waktu, pelaku, dan catatan', () => {
    const d = registrationDetail({ registration: {
      status: 'done', at: '2026-09-12T07:20:00Z', byName: 'Ikhsan', note: ' 4 SKU ditolak tak diikutkan ',
    } })
    expect(d).toMatch(/oleh Ikhsan/)
    expect(d).toMatch(/"4 SKU ditolak tak diikutkan"/)
  })
  it('tanpa nama jatuh ke email, tanpa catatan tetap aman', () => {
    expect(registrationDetail({ registration: { status: 'progress', by: 'a@b.com' } })).toBe('oleh a@b.com')
  })
  it('none tak punya keterangan', () => {
    expect(registrationDetail({})).toBe('')
  })
})

describe('buildRegistration', () => {
  it('membatalkan status mengosongkan catatan & stempel', () => {
    expect(buildRegistration({ status: 'none', note: 'sisa' })).toEqual({})
  })
  it('menyimpan catatan, link, dan pelaku', () => {
    const r = buildRegistration({ status: 'done', note: ' catat ', link: ' https://x.id ' },
      { email: 'Admin@Toko.com', name: 'Ikhsan' })
    expect(r.status).toBe('done'); expect(r.note).toBe('catat'); expect(r.link).toBe('https://x.id')
    expect(r.by).toBe('admin@toko.com'); expect(r.byName).toBe('Ikhsan')
    expect(Date.parse(r.at)).not.toBeNaN()
  })
  it('status asing diperlakukan sebagai pembatalan', () => {
    expect(buildRegistration({ status: 'xxx' })).toEqual({})
  })
})

describe('registrationTotals', () => {
  it('menghitung per status', () => {
    const t = registrationTotals([
      {}, { registration: { status: 'done' } }, { registration: { status: 'done' } },
      { registration: { status: 'progress' } },
    ])
    expect(t).toEqual({ none: 1, progress: 1, done: 2, total: 4 })
  })
})

// ── "Perlu didaftarkan" ────────────────────────────────────────────────────
import { needsRegistration, registrationUrgent, registrationAlert, registrationReason } from '../campaignRegistration'

const NOW = Date.parse('2026-09-14T05:00:00Z')  // 12.00 WIB
const iso = d => d
const camp = (over = {}) => ({
  id: 'c1',
  items: [{ productId: 'p1', varIdx: 0, name: 'A' }, { productId: 'p1', varIdx: 1, name: 'B' }],
  approvals: { 'p1:0': { status: 'approved' } },
  startDate: iso('2026-09-20'), endDate: iso('2026-09-30'),
  ...over,
})

describe('needsRegistration', () => {
  it('sudah di-ACC sebagian tapi belum ada catatan → perlu didaftarkan', () => {
    expect(needsRegistration(camp(), NOW)).toBe(true)
  })
  it('sudah ditandai (apa pun tahapnya) tak dihitung lagi', () => {
    expect(needsRegistration(camp({ registration: { status: 'progress' } }), NOW)).toBe(false)
    expect(needsRegistration(camp({ registration: { status: 'done' } }), NOW)).toBe(false)
  })
  it('belum ada SKU yang disetujui → belum jadi pekerjaan', () => {
    expect(needsRegistration(camp({ approvals: {} }), NOW)).toBe(false)
    expect(needsRegistration(camp({ approvals: { 'p1:0': { status: 'rejected' } } }), NOW)).toBe(false)
  })
  it('campaign yang sudah selesai tak ditagih', () => {
    expect(needsRegistration(camp({ startDate: '2026-08-01', endDate: '2026-08-10' }), NOW)).toBe(false)
  })
})

describe('registrationUrgent', () => {
  it('campaign yang sudah berjalan → mendesak', () => {
    expect(registrationUrgent(camp({ startDate: '2026-09-10', endDate: '2026-09-30' }), NOW)).toBe(true)
  })
  it('batas pendaftaran ≤7 hari → mendesak; jauh → tidak', () => {
    expect(registrationUrgent(camp({ registrationDeadline: '2026-09-18' }), NOW)).toBe(true)
    expect(registrationUrgent(camp({ startDate: '2026-11-01', endDate: '2026-11-10', registrationDeadline: '2026-10-25' }), NOW)).toBe(false)
  })
  it('batas pendaftaran sudah lewat → mendesak', () => {
    expect(registrationUrgent(camp({ registrationDeadline: '2026-09-01' }), NOW)).toBe(true)
  })
  it('yang tak perlu didaftarkan tak pernah mendesak', () => {
    expect(registrationUrgent(camp({ registration: { status: 'done' }, startDate: '2026-09-10' }), NOW)).toBe(false)
  })
})

describe('registrationAlert & registrationReason', () => {
  it('menghitung total dan yang mendesak', () => {
    const a = registrationAlert([
      camp({ id: 'a' }),
      camp({ id: 'b', startDate: '2026-09-10', endDate: '2026-09-30' }),
      camp({ id: 'c', registration: { status: 'done' } }),
    ], NOW)
    expect(a.count).toBe(2); expect(a.urgent).toBe(1); expect(a.ids.has('c')).toBe(false)
  })
  it('kalimat menyebut jumlah SKU yang sudah disetujui', () => {
    expect(registrationReason(camp(), NOW)).toMatch(/menyetujui 1 SKU/)
  })
  it('campaign berjalan TIDAK memakai kalimat "belum diputuskan" milik urgensi keputusan', () => {
    const r = registrationReason(camp({ startDate: '2026-09-10', endDate: '2026-09-30' }), NOW)
    expect(r).toMatch(/campaign sudah berjalan 4 hari/)
    expect(r).not.toMatch(/belum diputuskan/)
  })
  it('batas pendaftaran ikut disebut apa adanya', () => {
    expect(registrationReason(camp({ registrationDeadline: '2026-09-18' }), NOW)).toMatch(/Daftar sebelum/)
  })
})

// ── Lembar kerja pendaftaran ───────────────────────────────────────────────
import { registrationSheet, skuText } from '../campaignRegistration'
import { variantLabel } from '../campaignPricing'

const sheetCamp = {
  items: [
    { productId: 'p1', varIdx: 0, name: 'Alonica', sku: 'ALNC-35', price: 84900 },
    { productId: 'p1', varIdx: 1, name: 'Valerie', sku: 'VLR-35', price: 79000 },
    { productId: 'p2', varIdx: 0, name: 'Manor', sku: 'MNR-35', price: 84900 },
    { productId: 'p3', varIdx: 0, name: 'Dikecualikan', sku: 'XXX', price: 0, excluded: true },
  ],
  approvals: {
    'p1:0': { status: 'approved' },
    'p1:1': { status: 'rejected', note: ' margin terlalu tipis ' },
  },
}

describe('registrationSheet', () => {
  it('memisah disetujui, ditolak, dan yang belum diputuskan', () => {
    const s = registrationSheet(sheetCamp)
    expect(s.approved.map(i => i.sku)).toEqual(['ALNC-35'])
    expect(s.rejected.map(i => i.sku)).toEqual(['VLR-35'])
    expect(s.pending.map(i => i.sku)).toEqual(['MNR-35'])
  })
  it('varian yang dikecualikan dari campaign tak ikut sama sekali', () => {
    const all = Object.values(registrationSheet(sheetCamp)).flat()
    expect(all.some(i => i.sku === 'XXX')).toBe(false)
  })
  it('alasan penolakan client ikut terbawa', () => {
    expect(registrationSheet(sheetCamp).rejected[0].note).toBe('margin terlalu tipis')
  })
  it('campaign kosong aman', () => {
    expect(registrationSheet({})).toEqual({ approved: [], rejected: [], pending: [] })
  })
})

describe('skuText', () => {
  it('kode SKU saja, satu per baris', () => {
    expect(skuText([{ sku: 'A-1' }, { sku: 'B-2' }])).toBe('A-1\nB-2')
  })
  it('tanpa kode jatuh ke nama; yang kosong dibuang', () => {
    expect(skuText([{ sku: '', name: 'Tanpa kode' }, { sku: '  ', name: '' }])).toBe('Tanpa kode')
  })
})

describe('variantLabel', () => {
  it('nama varian yang cuma mengulang nama produk dikosongkan', () => {
    expect(variantLabel({ name: 'AsterixSty Alonica' }, { name: 'asterixsty alonica' })).toBe('')
  })
  it('nama varian yang beda tetap dipakai', () => {
    expect(variantLabel({ name: '50ml' }, { name: 'Alonica' })).toBe('50ml')
  })
  it('tanpa nama jatuh ke nomor varian', () => {
    expect(variantLabel({ varIdx: 2 }, { name: 'X' })).toBe('Varian 3')
  })
})
