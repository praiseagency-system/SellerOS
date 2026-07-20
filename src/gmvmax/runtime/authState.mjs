// STAGE 1C — Model state auth berbasis expiresAt AKTUAL (tak menebak TTL token).
// Ambang (7d/3d) adalah KEBIJAKAN OPERASIONAL, bukan klaim umur token.
// Pure & deterministik: `now` di-inject → tak ada wall-clock flaky.
// Tak ada fake-success; error auth TIDAK dikonversi jadi zero-data.

export const AUTH = Object.freeze({
  VALID: 'AUTH_VALID',
  WARNING: 'AUTH_EXPIRING_WARNING',
  URGENT: 'AUTH_EXPIRING_URGENT',
  EXPIRED: 'AUTH_EXPIRED',
  REQUIRED: 'AUTH_REQUIRED', // dipakai untuk kegagalan 401 eksplisit
})

const DAY_MS = 86400000

// classifyAuth(expiresAt, now, opts) → { state, remainingMs, remainingDays, expiresAt }
// expiresAt: epoch ms | null (null = env tanpa metadata expiry → dianggap VALID by policy).
export function classifyAuth(expiresAt, now = Date.now(), { warnDays = 7, urgentDays = 3 } = {}) {
  if (expiresAt == null) {
    return { state: AUTH.VALID, remainingMs: null, remainingDays: null, expiresAt: null }
  }
  const exp = Number(expiresAt)
  const remainingMs = exp - now
  const remainingDays = remainingMs / DAY_MS
  let state
  if (remainingMs <= 0) state = AUTH.EXPIRED
  else if (remainingDays <= urgentDays) state = AUTH.URGENT // (0, 3d]
  else if (remainingDays <= warnDays) state = AUTH.WARNING  // (3d, 7d]
  else state = AUTH.VALID                                   // > 7d
  return { state, remainingMs, remainingDays, expiresAt: exp }
}

// Event terstruktur siap-alert (tanpa nilai rahasia). level: info|warn|urgent|critical.
export function authEvent(cls) {
  const iso = cls.expiresAt ? new Date(cls.expiresAt).toISOString() : null
  const days = cls.remainingDays == null ? null : Number(cls.remainingDays.toFixed(2))
  switch (cls.state) {
    case AUTH.WARNING:
      return { event: 'MCP_TOKEN_EXPIRING_WARNING', level: 'warn', state: cls.state, expiresAt: iso, remainingDays: days,
        message: `Token MCP kedaluwarsa dalam ~${days} hari (${iso}). Jadwalkan penggantian token (Opsi B).` }
    case AUTH.URGENT:
      return { event: 'MCP_TOKEN_EXPIRING_URGENT', level: 'urgent', state: cls.state, expiresAt: iso, remainingDays: days,
        message: `URGENT: token MCP kedaluwarsa dalam ~${days} hari (${iso}). Ganti token SEKARANG.` }
    case AUTH.EXPIRED:
      return { event: 'MCP_AUTH_REQUIRED', level: 'critical', state: AUTH.EXPIRED, expiresAt: iso, remainingDays: days,
        message: `Token MCP kedaluwarsa (${iso}). AUTH_REQUIRED — suplai token baru. Tidak menulis data.` }
    case AUTH.REQUIRED:
      return { event: 'MCP_AUTH_REQUIRED', level: 'critical', state: AUTH.REQUIRED, expiresAt: iso, remainingDays: days,
        message: `Autentikasi MCP gagal (401). AUTH_REQUIRED — suplai token baru. Tidak menulis data.` }
    default:
      return { event: 'MCP_TOKEN_VALID', level: 'info', state: AUTH.VALID, expiresAt: iso, remainingDays: days, message: null }
  }
}

// True bila run TIDAK boleh lanjut (harus fail-explicit sebagai AUTH_REQUIRED).
export function isBlocking(state) { return state === AUTH.EXPIRED || state === AUTH.REQUIRED }
