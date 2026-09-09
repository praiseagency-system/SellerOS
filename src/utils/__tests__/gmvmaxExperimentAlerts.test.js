import { describe, it, expect } from 'vitest'
import { experimentAlerts, indexSessions, latestSeenOf, WINDOW_DAYS } from '../gmvmaxExperimentAlerts'

const NOW = Date.parse('2026-09-09T06:00:00Z')
const exp = (o = {}) => ({
  id: 'E1', status: 'RUNNING', start_at: '2026-09-08T10:00:00Z',
  source_session_id: 'S1', conclusion: null, ...o,
})
const kinds = (a) => a.map(x => x.kind)

describe('experimentAlerts', () => {
  it('diam saat eksperimen baru & sesinya masih terlihat pagi ini', () => {
    const a = experimentAlerts({
      exp: exp(), session: { session_id: 'S1', last_seen: '2026-09-08' },
      latestSeen: '2026-09-08', now: NOW,
    })
    expect(a).toEqual([])
  })

  // Kasus nyata yang memicu pekerjaan ini: boost ditarik di Seller Centre,
  // kartunya tetap berbunyi RUNNING.
  it('menandai boost yang tak lagi terlihat di potret terakhir', () => {
    const a = experimentAlerts({
      exp: exp(), session: { session_id: 'S1', last_seen: '2026-09-05' },
      latestSeen: '2026-09-08', now: NOW,
    })
    expect(kinds(a)).toEqual(['BOOST_ENDED'])
    expect(a[0].lastSeen).toBe('2026-09-05')
  })

  it('menandai jendela 7 hari yang sudah lewat, dengan umurnya', () => {
    const a = experimentAlerts({ exp: exp({ start_at: '2026-08-25T13:38:04Z' }), now: NOW })
    expect(kinds(a)).toEqual(['WINDOW_PASSED'])
    expect(a[0].days).toBe(14)
  })

  it('bisa menyalakan dua peringatan sekaligus', () => {
    const a = experimentAlerts({
      exp: exp({ start_at: '2026-08-28T18:30:00Z' }),
      session: { session_id: 'S1', last_seen: '2026-09-02' },
      latestSeen: '2026-09-08', now: NOW,
    })
    expect(kinds(a)).toEqual(['BOOST_ENDED', 'WINDOW_PASSED'])
  })

  it('tepat di hari ke-7 sudah dianggap lewat, sehari sebelumnya belum', () => {
    const start = '2026-09-02T06:00:00Z'
    expect(kinds(experimentAlerts({ exp: exp({ start_at: start }), now: NOW }))).toEqual(['WINDOW_PASSED'])
    const sehariKurang = NOW - 86400000
    expect(experimentAlerts({ exp: exp({ start_at: start }), now: sehariKurang })).toEqual([])
    expect(WINDOW_DAYS).toBe(7)
  })

  // Diam lebih baik daripada menebak: tanpa salah satu bahan, BOOST_ENDED mati.
  it('tak menuduh berakhir bila sesinya tak ketemu atau potretnya tak diketahui', () => {
    expect(experimentAlerts({ exp: exp(), session: null, latestSeen: '2026-09-08', now: NOW })).toEqual([])
    expect(experimentAlerts({
      exp: exp(), session: { session_id: 'S1', last_seen: '2026-09-05' }, latestSeen: null, now: NOW,
    })).toEqual([])
  })

  it('mengabaikan eksperimen yang sudah ditutup & tanggal mulai yang rusak', () => {
    expect(experimentAlerts({ exp: exp({ status: 'CONCLUDED', start_at: '2026-08-01T00:00:00Z' }), now: NOW })).toEqual([])
    expect(experimentAlerts({ exp: exp({ start_at: 'bukan-tanggal' }), now: NOW })).toEqual([])
    expect(experimentAlerts({})).toEqual([])
  })
})

describe('indexSessions & latestSeenOf', () => {
  const sessions = [
    { session_id: 'S1', last_seen: '2026-09-05' },
    { session_id: 'S2', last_seen: '2026-09-08' },
    { last_seen: '2026-09-09' },            // tanpa id — tak bisa disambungkan
  ]
  it('memetakan sesi per id dan melewati yang tak ber-id', () => {
    const map = indexSessions(sessions)
    expect(map.get('S1').last_seen).toBe('2026-09-05')
    expect(map.size).toBe(2)
  })
  it('latestSeen memakai potret terbaru apa pun sumbernya', () => {
    expect(latestSeenOf(sessions)).toBe('2026-09-09')
    expect(latestSeenOf([])).toBeNull()
  })
})
