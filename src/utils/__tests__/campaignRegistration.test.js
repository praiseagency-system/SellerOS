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
