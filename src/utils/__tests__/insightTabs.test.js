import { describe, it, expect } from 'vitest'
import {
  MAIN_TABS, HIDDEN_TABS, DEFAULT_TAB, resolveInsightTab, isHiddenTab, hiddenTabLabel,
} from '../insightTabs'

describe('resolveInsightTab', () => {
  it('menerima kedua tab utama', () => {
    expect(resolveInsightTab('aksi')).toBe('aksi')
    expect(resolveInsightTab('bukti')).toBe('bukti')
  })

  it('menerima tab tersembunyi — itu justru gunanya ?tab=', () => {
    for (const t of HIDDEN_TABS) expect(resolveInsightTab(t.id)).toBe(t.id)
  })

  // Tab lama masih dipakai orang & tertulis di catatan; mendarat di default
  // diam-diam akan terasa seperti tautannya rusak.
  it('memetakan id tab lama ke rumah barunya', () => {
    expect(resolveInsightTab('plan')).toBe('aksi')
    expect(resolveInsightTab('exp')).toBe('bukti')
    expect(resolveInsightTab('luar')).toBe('bukti')
  })

  it('mengabaikan masukan tak dikenal, kosong, atau bukan string', () => {
    expect(resolveInsightTab('sembarang')).toBe(DEFAULT_TAB)
    expect(resolveInsightTab('')).toBe(DEFAULT_TAB)
    expect(resolveInsightTab(null)).toBe(DEFAULT_TAB)
    expect(resolveInsightTab(undefined)).toBe(DEFAULT_TAB)
    expect(resolveInsightTab(' aksi ')).toBe('aksi')
  })
})

describe('daftar tab', () => {
  it('tab tersembunyi tidak ikut muncul di baris tab', () => {
    const utama = MAIN_TABS.map(t => t.id)
    for (const t of HIDDEN_TABS) expect(utama).not.toContain(t.id)
    expect(utama).toContain(DEFAULT_TAB)
  })

  it('isHiddenTab memisahkan keduanya', () => {
    expect(isHiddenTab('di')).toBe(true)
    expect(isHiddenTab('aksi')).toBe(false)
    expect(hiddenTabLabel('di')).toBe('Decision Intelligence')
    expect(hiddenTabLabel('aksi')).toBe('aksi')
  })
})
