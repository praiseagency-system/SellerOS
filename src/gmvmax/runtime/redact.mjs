// STAGE 1D — Secret redaction (terpusat, non-mutating).
// Melindungi token/Authorization/service-role/refreshToken/client-secret + dump env.
// Dipakai SEMUA jalur log VPS-shadow (startup, env, MCP req/err, fetch/auth/DB/uncaught).
// Tidak mengubah objek asli (deep clone) — aman dipakai di error handler.

// Nama kunci sensitif (match case-insensitive, substring).
const SECRET_KEY_PATTERNS = [
  'token', 'authorization', 'bearer', 'secret', 'password', 'passwd',
  'service_role', 'servicerole', 'apikey', 'api_key', 'accesskey', 'access_key',
  'client_secret', 'clientsecret', 'refresh',
]
// Nama kunci yang seluruh isinya adalah env dump → redaksi total.
const ENV_DUMP_KEYS = ['env', 'process.env', 'environment']

const REDACTED = '[REDACTED]'

// Registry nilai rahasia eksak yang diketahui runtime (di-set saat startup).
const knownSecrets = new Set()
export function registerSecret(value) {
  if (typeof value === 'string' && value.length >= 6) knownSecrets.add(value)
}
export function clearSecrets() { knownSecrets.clear() } // untuk test

function keyIsSecret(key) {
  const k = String(key).toLowerCase()
  return SECRET_KEY_PATTERNS.some(p => k.includes(p))
}
function keyIsEnvDump(key) {
  const k = String(key).toLowerCase()
  return ENV_DUMP_KEYS.includes(k)
}

// Scrub string: nilai rahasia terdaftar + pola "Bearer xxx" + "Authorization: xxx".
export function scrubString(s) {
  if (typeof s !== 'string') return s
  let out = s
  for (const secret of knownSecrets) {
    if (secret && out.includes(secret)) out = out.split(secret).join(REDACTED)
  }
  out = out.replace(/(Bearer)\s+[A-Za-z0-9._\-+/=]+/gi, `$1 ${REDACTED}`)
  out = out.replace(/(Authorization"?\s*[:=]\s*"?)([^",}\s]+)/gi, `$1${REDACTED}`)
  return out
}

// Redaksi rekursif → SELALU mengembalikan struktur BARU (non-mutating).
export function redact(value, seen = new WeakSet()) {
  if (value == null) return value
  if (typeof value === 'string') return scrubString(value)
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value
  if (typeof value === 'function' || typeof value === 'symbol') return undefined

  if (value instanceof Error) {
    return {
      name: value.name,
      code: value.code ?? null,
      message: scrubString(value.message || ''),
      // stack sengaja TIDAK disertakan (dapat memuat argumen sensitif).
    }
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    return value.map(v => redact(v, seen))
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (keyIsSecret(k)) { out[k] = REDACTED; continue }
      if (keyIsEnvDump(k)) { out[k] = REDACTED; continue }
      out[k] = redact(v, seen)
    }
    return out
  }
  return value
}

// Serialize aman untuk log (JSON) — redaksi dulu, baru stringify.
export function safeStringify(value, space = 0) {
  return JSON.stringify(redact(value), null, space)
}

// Logger terstruktur aman: apa pun input, output ter-redaksi.
export function safeLog(obj, sink = console.log) {
  sink(safeStringify(obj))
}
export const REDACTION_MASK = REDACTED
