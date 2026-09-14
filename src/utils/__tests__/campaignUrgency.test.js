import { describe, it, expect } from 'vitest'
import { decisionUrgency } from '../campaignUrgency'

// 10 Sep 2026 12:00 waktu lokal
const NOW = new Date('2026-09-10T12:00:00').getTime()
const c = (start, end) => ({ startDate: start, endDate: end })

describe('decisionUrgency', () => {
  it('campaign selesai → rank 9, tak mendesak', () => {
    const u = decisionUrgency(c('2026-09-01', '2026-09-05'), NOW)
    expect(u.key).toBe('ended'); expect(u.rank).toBe(9)
  })
  it('tanpa tanggal → rank 4', () => {
    expect(decisionUrgency({}, NOW).key).toBe('nodate')
  })
  it('sudah berjalan → rank 0, hitung hari sejak mulai', () => {
    const u = decisionUrgency(c('2026-09-05', '2026-09-30'), NOW)
    expect(u.key).toBe('started'); expect(u.rank).toBe(0); expect(u.days).toBe(5)
    expect(u.label).toMatch(/Sudah berjalan 5 hari/)
  })
  it('mulai hari ini (sudah masuk periode) → started, 0 hari', () => {
    const u = decisionUrgency(c('2026-09-10', '2026-09-12'), NOW)
    expect(u.key).toBe('started'); expect(u.days).toBe(0)
    expect(u.label).toMatch(/Mulai hari ini/)
  })
  it('mulai besok → upcoming 1 hari, merah', () => {
    const u = decisionUrgency(c('2026-09-11', '2026-09-12'), NOW)
    expect(u.key).toBe('upcoming'); expect(u.days).toBe(1); expect(u.cls).toMatch(/red/)
  })
  it('mulai 5 hari lagi → kuning; 20 hari → netral', () => {
    expect(decisionUrgency(c('2026-09-15', '2026-09-20'), NOW).cls).toMatch(/amber/)
    expect(decisionUrgency(c('2026-09-30', '2026-10-05'), NOW).cls).toMatch(/gray/)
  })
  it('urutan: berjalan dulu, lalu yang paling dekat mulai', () => {
    const a = decisionUrgency(c('2026-09-12', '2026-09-20'), NOW)   // 2 hari lagi
    const b = decisionUrgency(c('2026-09-01', '2026-09-30'), NOW)   // berjalan
    const d = decisionUrgency(c('2026-09-11', '2026-09-20'), NOW)   // 1 hari lagi
    const sorted = [a, b, d].sort((x, y) => x.rank - y.rank || x.sortKey - y.sortKey)
    expect(sorted.map(u => u.days)).toEqual([9, 1, 2])
  })
  it('berjalan: yang lebih cepat berakhir lebih mendesak', () => {
    const a = decisionUrgency(c('2026-09-01', '2026-12-31'), NOW)
    const b = decisionUrgency(c('2026-09-01', '2026-09-12'), NOW)
    expect(b.sortKey).toBeLessThan(a.sortKey)
  })
  it('multi periode, jeda: pakai periode berikutnya untuk batas akhir', () => {
    const u = decisionUrgency({ periods: [{ start: '2026-09-01', end: '2026-09-05' }, { start: '2026-09-20', end: '2026-09-25' }] }, NOW)
    expect(u.key).toBe('started')
  })
  it('batas pendaftaran eksplisit menang: 2 hari lagi → merah, rank 1', () => {
    const u = decisionUrgency({ ...c('2026-09-20', '2026-09-25'), registrationDeadline: '2026-09-12' }, NOW)
    expect(u.key).toBe('deadline'); expect(u.days).toBe(2); expect(u.cls).toMatch(/red/)
    expect(u.label).toMatch(/Daftar sebelum .*2 hari lagi/)
  })
  it('batas pendaftaran hari ini → 0 hari, "Daftar hari ini"', () => {
    const u = decisionUrgency({ ...c('2026-09-20', '2026-09-25'), registrationDeadline: '2026-09-10' }, NOW)
    expect(u.days).toBe(0); expect(u.label).toMatch(/Daftar hari ini/)
  })
  it('batas pendaftaran lewat, campaign belum mulai → closed rank 0', () => {
    const u = decisionUrgency({ ...c('2026-09-20', '2026-09-25'), registrationDeadline: '2026-09-08' }, NOW)
    expect(u.key).toBe('closed'); expect(u.rank).toBe(0); expect(u.days).toBe(2)
  })
  it('batas pendaftaran lewat tapi campaign sudah berjalan → tetap "started"', () => {
    const u = decisionUrgency({ ...c('2026-09-05', '2026-09-25'), registrationDeadline: '2026-09-03' }, NOW)
    expect(u.key).toBe('started')
  })
  it('batas pendaftaran diabaikan bila campaign selesai', () => {
    const u = decisionUrgency({ ...c('2026-09-01', '2026-09-05'), registrationDeadline: '2026-08-30' }, NOW)
    expect(u.key).toBe('ended')
  })
  it('deadline 10 hari lagi lebih rendah dari campaign yang mulai 5 hari lagi', () => {
    const a = decisionUrgency({ ...c('2026-10-01', '2026-10-05'), registrationDeadline: '2026-09-20' }, NOW)
    const b = decisionUrgency(c('2026-09-15', '2026-09-20'), NOW)
    expect(a.rank).toBe(b.rank); expect(b.sortKey).toBeLessThan(a.sortKey)
  })
})
