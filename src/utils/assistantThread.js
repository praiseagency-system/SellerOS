// Aturan thread AI Assistant — dipakai fungsi serverless (api/assistant/*) DAN
// komponen panel, supaya judul otomatis & pengelompokan hari persis sama di
// kedua sisi. Diport dari src/lib/assistant-thread.ts di Pikat.
//
// Murni (tanpa Supabase/React) supaya bisa diuji langsung.

/** Batas thread per user per workspace; yang paling lama dipangkas otomatis. */
export const MAX_THREADS = 50
/** Panjang maksimum judul (otomatis maupun hasil ubah nama). */
export const MAX_TITLE = 60
/** Judul otomatis dipotong di sini supaya muat satu baris di sidebar. */
const AUTO_TITLE_LEN = 40

export const FALLBACK_TITLE = 'Percakapan baru'

/** Judul otomatis dari pesan pertama user: satu baris, ≤40 karakter, potong di spasi. */
export function threadTitleFromMessage(text) {
  const oneLine = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!oneLine) return FALLBACK_TITLE
  if (oneLine.length <= AUTO_TITLE_LEN) return oneLine
  const cut = oneLine.slice(0, AUTO_TITLE_LEN)
  const atSpace = cut.lastIndexOf(' ')
  // Kalau spasi terakhir terlalu awal, potong keras saja daripada judul jadi satu kata.
  const base = atSpace >= AUTO_TITLE_LEN / 2 ? cut.slice(0, atSpace) : cut
  return `${base.replace(/[\s,.;:!?-]+$/, '')}…`
}

/** Judul dari input user: rapikan spasi, batasi panjang; kosong → null (tolak). */
export function normalizeTitle(raw) {
  if (typeof raw !== 'string') return null
  const t = raw.replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > MAX_TITLE ? t.slice(0, MAX_TITLE).trim() : t
}

export const THREAD_GROUP_LABEL = {
  today: 'Hari ini',
  yesterday: 'Kemarin',
  week: '7 hari terakhir',
  older: 'Lebih lama',
}

export const THREAD_GROUP_ORDER = ['today', 'yesterday', 'week', 'older']

// Kunci hari kalender WIB ('YYYY-MM-DD') — bukan hari lokal browser, supaya
// "Hari ini" sama untuk semua orang di tim (sama seperti Pikat).
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
export function wibDateKey(d) {
  return new Date(d.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10)
}
function shiftWibKey(key, days) {
  const t = Date.parse(`${key}T00:00:00Z`) + days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** Kelompok sidebar, dihitung per hari kalender WIB. */
export function threadGroup(updatedAt, now = new Date()) {
  const key = wibDateKey(updatedAt)
  const today = wibDateKey(now)
  if (key >= today) return 'today'
  if (key === shiftWibKey(today, -1)) return 'yesterday'
  if (key >= shiftWibKey(today, -7)) return 'week'
  return 'older'
}

/** Saring pesan dari klien/DB: hanya {role user|assistant, content string}. */
export function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(m => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content }))
}
