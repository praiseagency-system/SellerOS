import { describe, it, expect } from 'vitest'
import { toLocalInput, defaultSchedule, localZone } from '../gmvmaxSchedule'

describe('pembantu jadwal sesi', () => {
  it('format datetime-local: nol di depan, tanpa detik, waktu LOKAL', () => {
    // Dibangun dari komponen lokal supaya tes tak bergantung zona mesin penguji.
    const d = new Date(2026, 7, 5, 9, 7)   // 5 Agu 2026, 09:07 lokal
    expect(toLocalInput(d)).toBe('2026-08-05T09:07')
  })

  it('format bisa dibaca balik jadi instant yang sama', () => {
    const d = new Date(2026, 11, 31, 23, 59)
    expect(new Date(toLocalInput(d)).getTime()).toBe(d.getTime())
  })

  it('jadwal bawaan: selesai tepat N jam setelah mulai', () => {
    const { startAt, endAt } = defaultSchedule(24)
    const jam = (new Date(endAt) - new Date(startAt)) / 3600000
    // Toleransi 1 menit: kedua nilai dibulatkan ke menit.
    expect(Math.abs(jam - 24)).toBeLessThan(0.02)
  })

  it('jendela bisa diminta selain 24 jam', () => {
    const { startAt, endAt } = defaultSchedule(72)
    const jam = (new Date(endAt) - new Date(startAt)) / 3600000
    expect(Math.abs(jam - 72)).toBeLessThan(0.02)
  })

  it('zona waktu selalu terbaca — tak pernah kosong', () => {
    expect(typeof localZone()).toBe('string')
    expect(localZone().length).toBeGreaterThan(0)
  })
})
