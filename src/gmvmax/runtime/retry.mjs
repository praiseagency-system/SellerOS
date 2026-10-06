// Retry berbatas untuk galat TRANSIEN saja. Pemanggil yang memutuskan apa itu
// transien (isTransient) — modul ini tidak menebak dari pesan galat sembarang.
// Jeda TETAP per percobaan (bukan eksponensial tak berbatas): daftar `delaysMs`
// sekaligus menentukan jumlah percobaan ulang, jadi waktu tunggu terburuk bisa
// dibaca langsung dari konstantanya (2+5+15 = 22 dtk).
// Pure: sleep di-inject → tes berjalan tanpa menunggu jam dinding.

export const DEFAULT_RETRY_DELAYS_MS = [2000, 5000, 15000]

const realSleep = (ms) => new Promise(r => setTimeout(r, ms))

// Kode galat tingkat jaringan (Node + undici): permintaan tak sampai ke server
// atau jawabannya tak pernah diterima utuh.
const NETWORK_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE',
  'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
])

// fetch bawaan Node melempar `TypeError: fetch failed` dan menaruh sebab aslinya
// di `.cause` (bisa bersarang, bisa AggregateError saat mencoba beberapa alamat).
// TypeError LAIN (mis. "Cannot read properties of undefined") adalah bug kode,
// bukan jaringan — sengaja TIDAK dianggap transien.
export function isTransientNetworkError(e) {
  const seen = new Set()
  const stack = [e]
  while (stack.length) {
    const x = stack.pop()
    if (!x || typeof x !== 'object' || seen.has(x)) continue
    seen.add(x)
    if (NETWORK_CODES.has(x.code)) return true
    if (x.name === 'TypeError' && /^(fetch failed|terminated)$/i.test(String(x.message || '').trim())) return true
    if (x.cause) stack.push(x.cause)
    if (Array.isArray(x.errors)) stack.push(...x.errors)
  }
  return false
}

// Kode sebab terdalam yang dikenal (untuk log) — 'ECONNRESET', bukan sekadar
// "fetch failed" yang tak menjelaskan apa-apa.
export function networkErrorCode(e) {
  const seen = new Set()
  const stack = [e]
  while (stack.length) {
    const x = stack.pop()
    if (!x || typeof x !== 'object' || seen.has(x)) continue
    seen.add(x)
    if (NETWORK_CODES.has(x.code)) return x.code
    if (x.cause) stack.push(x.cause)
    if (Array.isArray(x.errors)) stack.push(...x.errors)
  }
  return null
}

// Jalankan fn; ulangi HANYA bila isTransient(galat) === true dan jatah masih ada.
// → { value, attempts }. Galat terakhir dilempar apa adanya, ditambahi
// `.attempts` dan `.transient` supaya pemanggil bisa melaporkan dengan jujur
// ("menyerah setelah 4 percobaan" vs "ditolak server, tak diulang").
// onAttemptFailed dipanggil untuk SETIAP percobaan yang gagal, termasuk yang
// terakhir → tiap percobaan punya jejak di log.
export async function retryTransient(fn, {
  delaysMs = DEFAULT_RETRY_DELAYS_MS, isTransient = isTransientNetworkError, onAttemptFailed, sleepImpl = realSleep,
} = {}) {
  const maxAttempts = delaysMs.length + 1
  for (let attempt = 1; ; attempt++) {
    try {
      return { value: await fn(attempt), attempts: attempt }
    } catch (e) {
      const transient = isTransient(e) === true
      const willRetry = transient && attempt < maxAttempts
      const retryInMs = willRetry ? delaysMs[attempt - 1] : null
      onAttemptFailed?.({ error: e, attempt, maxAttempts, transient, willRetry, retryInMs })
      if (!willRetry) {
        if (e && typeof e === 'object') { e.attempts = attempt; e.transient = transient }
        throw e
      }
      await sleepImpl(retryInMs)
    }
  }
}
