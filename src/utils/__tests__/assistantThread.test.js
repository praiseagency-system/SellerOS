import { describe, it, expect } from 'vitest'
import {
  threadTitleFromMessage, normalizeTitle, threadGroup, sanitizeMessages, FALLBACK_TITLE, MAX_TITLE,
} from '../assistantThread'

describe('threadTitleFromMessage', () => {
  it('pesan pendek dipakai apa adanya, spasi dirapikan', () => {
    expect(threadTitleFromMessage('  Top   produk\nbulan ini ')).toBe('Top produk bulan ini')
  })
  it('kosong → judul cadangan', () => {
    expect(threadTitleFromMessage('   ')).toBe(FALLBACK_TITLE)
    expect(threadTitleFromMessage(undefined)).toBe(FALLBACK_TITLE)
  })
  it('pesan panjang dipotong di spasi dan diberi elipsis', () => {
    const t = threadTitleFromMessage('Produk mana yang paling banyak pengunjung tapi konversinya rendah bulan Agustus?')
    expect(t.endsWith('…')).toBe(true)
    expect(t.length).toBeLessThanOrEqual(41)
    expect(t).toBe('Produk mana yang paling banyak…')
  })
  it('satu kata sangat panjang dipotong keras', () => {
    const t = threadTitleFromMessage('a'.repeat(80))
    expect(t).toBe('a'.repeat(40) + '…')
  })
})

describe('normalizeTitle', () => {
  it('menolak non-string dan kosong', () => {
    expect(normalizeTitle(5)).toBeNull()
    expect(normalizeTitle('  ')).toBeNull()
  })
  it('membatasi panjang', () => {
    expect(normalizeTitle('x'.repeat(100)).length).toBe(MAX_TITLE)
  })
})

describe('threadGroup (hari kalender WIB)', () => {
  // 2026-09-11 01:00 WIB = 2026-09-10 18:00 UTC
  const now = new Date('2026-09-10T18:00:00Z')
  it('pukul 00:30 WIB hari ini masih "today" walau UTC masih kemarin', () => {
    expect(threadGroup(new Date('2026-09-10T17:30:00Z'), now)).toBe('today')
  })
  it('23:00 WIB kemarin → yesterday', () => {
    expect(threadGroup(new Date('2026-09-10T16:00:00Z'), now)).toBe('yesterday')
  })
  it('5 hari lalu → week, 10 hari lalu → older', () => {
    expect(threadGroup(new Date('2026-09-06T05:00:00Z'), now)).toBe('week')
    expect(threadGroup(new Date('2026-09-01T05:00:00Z'), now)).toBe('older')
  })
})

describe('sanitizeMessages', () => {
  it('membuang peran/isi yang tidak sah', () => {
    expect(sanitizeMessages([
      { role: 'user', content: 'a' }, { role: 'system', content: 'x' }, { role: 'assistant', content: 1 }, null,
    ])).toEqual([{ role: 'user', content: 'a' }])
    expect(sanitizeMessages('nope')).toEqual([])
  })
})
