import { describe, it, expect } from 'vitest'
import { sessionsInRange } from '../quadrantAggregate'
import { METRIC_MAPPING_VERSION } from '../metricSchema'

// Banner "Mapping Lama" pernah macet menyala setelah import ulang karena
// statusnya disimpan di state terpisah yang hanya diperbarui oleh loadSession —
// jalur import tak pernah melewatinya. Sekarang status DITURUNKAN dari sesi
// yang sedang ditampilkan, jadi jalur mana pun ikut benar.

const S = (platform, periodValue, mappingVersion) => ({
  id: `${platform}-${periodValue}`, platform, periodValue, label: periodValue,
  settings: mappingVersion == null ? {} : { mappingVersion }, products: [],
})

// Cerminan logika di QuadrantContext.
const activeOf = (sessions, { useDerived, range, platforms, platform, periodValue }) =>
  useDerived
    ? sessionsInRange(sessions, range, platforms)
    : sessions.filter(s => s.platform === platform && s.periodValue === periodValue)

const isLegacy = active =>
  active.length > 0 && active.some(s => (s.settings?.mappingVersion ?? 0) < METRIC_MAPPING_VERSION)

describe('deteksi mapping lama', () => {
  it('sesi tanpa mappingVersion → legacy', () => {
    const sessions = [S('shopee', '2026-05', null)]
    expect(isLegacy(activeOf(sessions, { platform: 'shopee', periodValue: '2026-05' }))).toBe(true)
  })

  it('sesi v2 → legacy', () => {
    const sessions = [S('shopee', '2026-05', 2)]
    expect(isLegacy(activeOf(sessions, { platform: 'shopee', periodValue: '2026-05' }))).toBe(true)
  })

  it('setelah import ulang v3 → banner PADAM tanpa perlu buka riwayat', () => {
    // Keadaan setelah "Konfirmasi Import": sesi lama tergantikan v3.
    const sessions = [S('shopee', '2026-05', METRIC_MAPPING_VERSION)]
    const active = activeOf(sessions, { platform: 'shopee', periodValue: '2026-05' })
    expect(active.length).toBe(1)
    expect(isLegacy(active)).toBe(false)
  })

  it('mode gabungan: satu marketplace masih lama → tetap legacy', () => {
    const sessions = [
      S('shopee', '2026-05', METRIC_MAPPING_VERSION),
      S('tiktok', '2026-05', 2),
    ]
    const active = activeOf(sessions, {
      useDerived: true, range: { mode: 'month', month: '2026-05' }, platforms: ['shopee', 'tiktok'],
    })
    expect(active.length).toBe(2)
    expect(isLegacy(active)).toBe(true)
  })

  it('mode gabungan: keduanya v3 → padam', () => {
    const sessions = [
      S('shopee', '2026-05', METRIC_MAPPING_VERSION),
      S('tiktok', '2026-05', METRIC_MAPPING_VERSION),
    ]
    const active = activeOf(sessions, {
      useDerived: true, range: { mode: 'month', month: '2026-05' }, platforms: ['shopee', 'tiktok'],
    })
    expect(isLegacy(active)).toBe(false)
  })

  it('periode lain yang masih lama tak menyalakan banner periode yang sudah v3', () => {
    const sessions = [
      S('shopee', '2026-04', null),                       // periode lama, belum di-import ulang
      S('shopee', '2026-05', METRIC_MAPPING_VERSION),     // periode yang sedang dibuka
    ]
    expect(isLegacy(activeOf(sessions, { platform: 'shopee', periodValue: '2026-05' }))).toBe(false)
    expect(isLegacy(activeOf(sessions, { platform: 'shopee', periodValue: '2026-04' }))).toBe(true)
  })

  it('belum ada data sama sekali → banner tidak muncul', () => {
    expect(isLegacy(activeOf([], { platform: 'shopee', periodValue: '2026-05' }))).toBe(false)
  })
})
