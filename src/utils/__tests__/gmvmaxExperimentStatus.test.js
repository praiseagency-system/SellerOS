import { describe, it, expect } from 'vitest'
import {
  normStatus, pickStatus, statusJourney, journeyChips, journeySentence, statusShift, statusLabel,
} from '../gmvmaxExperimentStatus'

const day = (n) => new Date(Date.parse('2026-09-18T00:00:00Z') + (n - 1) * 86400000).toISOString().slice(0, 10)
// seq: [[hariKe, status | [[campaign, status], …] | null], …]
const cal = (seq) => seq.map(([n, st]) => ({
  date: day(n), day: n,
  statuses: st == null ? null : Array.isArray(st) ? st.map(([campaignId, status]) => ({ campaignId, status })) : [{ campaignId: 'c1', status: st }],
}))
// Data asli: boost Dasfelix 18 Sep (9b2934ff) — Antre ×3 ‖ Learning, Tayang ×5, Tak tayang.
const NYATA = cal([[-2, 'IN_QUEUE'], [-1, 'IN_QUEUE'], [0, 'IN_QUEUE'], [1, 'LEARNING'], [2, 'DELIVERING'], [3, 'DELIVERING'], [4, 'DELIVERING'], [5, 'DELIVERING'], [6, 'DELIVERING'], [7, 'NOT_DELIVERYING']])

describe('status video', () => {
  it('salah eja TikTok "NOT_DELIVERYING" disamakan', () => {
    expect(normStatus('NOT_DELIVERYING')).toBe('NOT_DELIVERING')
    expect(normStatus('delivering')).toBe('DELIVERING')
    expect(normStatus('')).toBe(null)
    expect(statusLabel('NOT_DELIVERING')).toBe('Tak tayang')
    expect(statusLabel('STATUS_BARU')).toBe('STATUS_BARU') // status tak dikenal tetap terbaca
  })
  it('status di campaign eksperimen didahulukan; tanpa itu yang paling dekat ke Tayang', () => {
    const e = [{ campaignId: 'c1', status: 'AUTHORIZATION_NEEDED' }, { campaignId: 'c2', status: 'DELIVERING' }]
    expect(pickStatus(e, 'c1')).toEqual({ status: 'AUTHORIZATION_NEEDED', others: ['DELIVERING'] })
    expect(pickStatus(e, 'c9')).toEqual({ status: 'DELIVERING', others: [] }) // campaign eksperimen tak punya baris → terbaik dari semua
    expect(pickStatus(e, null).status).toBe('DELIVERING')
    expect(pickStatus([], 'c1')).toBe(null)
    // Data asli (boost 35401f20): beberapa baris di campaign YANG SAMA, urutan
    // acak → selalu yang terbaik, dan kembarannya bukan "campaign lain".
    const kembar = [['c1', 'AUTHORIZATION_NEEDED'], ['c1', 'DELIVERING'], ['c1', 'AUTHORIZATION_NEEDED'], ['c1', 'AUTHORIZATION_NEEDED']].map(([campaignId, status]) => ({ campaignId, status }))
    for (const urut of [kembar, [...kembar].reverse(), [kembar[1], kembar[0], kembar[2], kembar[3]]]) {
      expect(pickStatus(urut, 'c1')).toEqual({ status: 'DELIVERING', others: [] })
    }
    expect(pickStatus([...kembar, { campaignId: 'c2', status: 'IN_QUEUE' }], 'c1')).toEqual({ status: 'DELIVERING', others: ['IN_QUEUE'] })
    expect(pickStatus(null)).toBe(null)
  })
  it('perjalanan status dari data asli', () => {
    const j = statusJourney(NYATA, 'c1')
    expect(j.before).toEqual({ status: 'IN_QUEUE', n: 3 })
    expect(j.segments.map(s => [s.status, s.fromDay, s.toDay, s.n])).toEqual([['LEARNING', 1, 1, 1], ['DELIVERING', 2, 6, 5], ['NOT_DELIVERING', 7, 7, 1]])
    expect([j.last, j.changed]).toEqual(['NOT_DELIVERING', true])
    expect(journeyChips(j).map(c => c.text)).toEqual(['Antre · sebelum', 'Learning · hari 1', 'Tayang · hari 2–6', 'Tak tayang · hari 7'])
    expect(journeySentence(j)).toBe('Sebelum boost: Antre (3 hari berdata). Mulai Tayang di hari ke-2; Tak tayang sejak hari ke-7.')
  })
  it('tidak berubah / hari tanpa status dilewati', () => {
    const j = statusJourney(cal([[0, 'DELIVERING'], [1, 'DELIVERING'], [2, null], [3, 'DELIVERING']]))
    expect(j.changed).toBe(false)
    expect(j.segments.map(s => [s.fromDay, s.toDay, s.n])).toEqual([[1, 3, 2]])
    expect(journeySentence(j)).toBe('Sebelum boost: Tayang. Tidak berubah sesudah boost dimulai.')
    expect(statusJourney(cal([[1, null], [2, null]]))).toBe(null)
    expect(statusJourney([])).toBe(null)
  })
  it('kalimat: dikeluarkan, kembali tayang, status sebelum tak terekam', () => {
    const s = (seq, o) => journeySentence(statusJourney(cal(seq), 'c1'), o)
    expect(s([[0, 'DELIVERING'], [1, 'DELIVERING'], [2, 'DELIVERING'], [3, 'EXCLUDED']])).toBe('Sebelum boost: Tayang. Dikeluarkan sejak hari ke-3.')
    expect(s([[0, 'DELIVERING'], [1, 'DELIVERING'], [4, 'NOT_DELIVERING'], [5, 'DELIVERING']])).toBe('Sebelum boost: Tayang. Kembali Tayang di hari ke-5.')
    // Data asli (f1c56692): berhenti tayang di hari ke-3, lalu berganti-ganti status non-Tayang.
    expect(s([[0, 'DELIVERING'], [1, 'DELIVERING'], [2, 'DELIVERING'], [3, 'EXCLUDED'], [8, 'EXCLUDED'], [9, 'NOT_DELIVERING'], [10, 'EXCLUDED']])).toBe('Sebelum boost: Tayang. Dikeluarkan sejak hari ke-3.')
    expect(s([[0, 'DELIVERING'], [1, 'DELIVERING'], [3, 'EXCLUDED'], [9, 'NOT_DELIVERING']])).toBe('Sebelum boost: Tayang. Dikeluarkan sejak hari ke-3, kini Tak tayang.')
    // Turun tepat sesudah mulai lalu tayang lagi sekali.
    expect(s([[0, 'DELIVERING'], [1, 'NOT_DELIVERING'], [3, 'NOT_DELIVERING'], [4, 'DELIVERING']])).toBe('Sebelum boost: Tayang. Tak tayang di hari 1–3, lalu Tayang lagi di hari ke-4.')
    // Status sebelum tak terekam, tetapi di dalam eksperimen naik ke Tayang.
    expect(s([[1, 'IN_QUEUE'], [2, 'LEARNING'], [3, 'DELIVERING']])).toBe('Status sebelum boost tidak terekam. Mulai Tayang di hari ke-3.')
    expect(s([[0, 'IN_QUEUE'], [1, 'LEARNING']], { noun: 'perubahan' })).toBe('Sebelum perubahan: Antre. Learning sejak hari ke-1.')
    // Tanpa data sebelum mulai: "mulai Tayang" TIDAK diklaim.
    expect(s([[1, 'DELIVERING'], [2, 'NOT_DELIVERING']])).toBe('Status sebelum boost tidak terekam. Tak tayang sejak hari ke-2.')
    expect(s([[0, 'IN_QUEUE']])).toBe('Sebelum boost: Antre. Belum ada data status sesudah mulai.')
    for (const t of [s([[0, 'X'], [1, 'Y'], [2, 'Z']]), s([[1, 'DELIVERING']])]) expect(t).not.toMatch(/undefined|null|NaN/)
  })
  it('chip diringkas bila terlalu banyak perubahan', () => {
    const j = statusJourney(cal([[0, 'IN_QUEUE'], [1, 'LEARNING'], [2, 'DELIVERING'], [3, 'NOT_DELIVERING'], [4, 'DELIVERING'], [5, 'NOT_DELIVERING'], [6, 'DELIVERING']]))
    const chips = journeyChips(j)
    expect(chips.length).toBe(6) // sebelum + 3 pertama + ringkasan + terakhir
    expect(chips[4].text).toBe('+2 perubahan')
    expect(chips[5].text).toBe('Tayang · hari 6')
  })
  it('label daftar: hanya bila berubah', () => {
    const map = (seq) => new Map(cal(seq).filter(d => d.statuses).map(d => [d.date, d.statuses]))
    const e = { start_at: '2026-09-18T02:00:00Z', campaign_id: 'c1' }
    expect(statusShift(e, map(NYATA.map(d => [d.day, d.statuses[0].status]))).text).toBe('Antre → Tayang → Tak tayang')
    expect(statusShift(e, map([[0, 'LEARNING'], [1, 'DELIVERING'], [2, 'DELIVERING']])).text).toBe('Learning → Tayang')
    expect(statusShift(e, map([[0, 'DELIVERING'], [1, 'DELIVERING'], [2, 'DELIVERING']]))).toBe(null)
    expect(statusShift(e, map([[1, 'DELIVERING']]))).toBe(null) // status sebelum mulai tak diketahui
    expect(statusShift(e, map([[-5, 'IN_QUEUE'], [1, 'DELIVERING']]))).toBe(null) // lebih dari 3 hari sebelum → tak dipakai
    expect(statusShift(e, new Map())).toBe(null)
    expect(statusShift({ start_at: 'x' }, map([[0, 'IN_QUEUE']]))).toBe(null)
    // Mulai 01.30 WIB (18.30Z tanggal sebelumnya) → hari ke-1 tetap tanggal WIB.
    expect(statusShift({ start_at: '2026-09-17T18:30:00Z', campaign_id: 'c1' }, map([[0, 'IN_QUEUE'], [1, 'DELIVERING']])).text).toBe('Antre → Tayang')
  })
})
