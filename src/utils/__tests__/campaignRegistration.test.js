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
