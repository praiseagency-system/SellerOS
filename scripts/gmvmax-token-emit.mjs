// Emit HANYA 3 field token (stdout → pipe ke ssh). Validasi ketat sebelum emit:
// accessToken & serverUrl non-empty; expiresAt ada, finite, dalam ms, > now, dan
// bertahan sampai run shadow VPS berikutnya (07:00 UTC / 14:00 WIB) + buffer.
// TIDAK mencetak token ke terminal/log (stdout=pipe). Keychain read ber-timeout.
import { execSync } from 'node:child_process'
const SHADOW_UTC_HOUR = Number(process.env.GMVMAX_SHADOW_UTC_HOUR || 7)   // samakan dgn timer OnCalendar
const BUFFER_MIN = Number(process.env.GMVMAX_SHADOW_BUFFER_MIN || 60)
const MS_MIN = 1_000_000_000_000 // ~2001 dalam ms → guard "detik vs ms"
const err = (m) => process.stderr.write(m + '\n')
let o
try {
  const cred = JSON.parse(execSync('security find-generic-password -s "Claude Code-credentials" -w', { encoding: 'utf8', timeout: 10000 }))
  const k = Object.keys(cred.mcpOAuth || {}).find(x => x.startsWith('tiktok-ads'))
  if (!k) throw new Error('mcpOAuth tiktok-ads absent')
  o = cred.mcpOAuth[k]
} catch (e) { err('EMIT LOAD_FAILED: ' + e.message); process.exit(3) }
if (!o.accessToken || !String(o.accessToken).trim()) { err('EMIT NO_TOKEN'); process.exit(4) }
if (!o.serverUrl || !String(o.serverUrl).trim())     { err('EMIT NO_SERVER_URL'); process.exit(5) }
if (o.expiresAt == null || o.expiresAt === '')       { err('EMIT NO_EXPIRESAT'); process.exit(6) }
const exp = Number(o.expiresAt)
if (!Number.isFinite(exp) || exp < MS_MIN)           { err(`EMIT BAD_EXPIRESAT value=${String(o.expiresAt)}`); process.exit(8) }
const now = Date.now()
if (exp <= now)                                      { err(`EMIT TOKEN_EXPIRED expiresAt=${new Date(exp).toISOString()}`); process.exit(9) }
const d = new Date(now)
const nextShadow = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), SHADOW_UTC_HOUR, 0, 0))
if (nextShadow.getTime() <= now) nextShadow.setUTCDate(nextShadow.getUTCDate() + 1)
const need = nextShadow.getTime() + BUFFER_MIN * 60000
if (exp < need) {
  err(`EMIT TOKEN_TOO_SHORT_FOR_SHADOW_RUN expiresAt=${new Date(exp).toISOString()} next_shadow=${nextShadow.toISOString()} buffer_min=${BUFFER_MIN}`)
  process.exit(7)
}
process.stdout.write(`GMVMAX_MCP_TOKEN=${o.accessToken}\nGMVMAX_MCP_URL=${o.serverUrl}\nGMVMAX_MCP_EXPIRES_AT=${exp}\n`)
