// OLD daily-sync token freshness pre-check. Self-contained (baca Keychain langsung →
// TIDAK menyentuh worker VPS). TIDAK mencetak token. Exit non-zero bila token MCP
// tt-ads expired / terlalu dekat kedaluwarsa (margin default 120m — lihat catatan).
// CATATAN: cek waktu-mulai TIDAK menjamin token bertahan sepanjang run panjang (bisa
// berjam-jam); penjaga sebenarnya = verifikasi pasca-tulis (gmvmax-sync-verify.mjs).
import { execSync } from 'node:child_process'
const MARGIN_MIN = Number(process.env.GMVMAX_TOKEN_MARGIN_MIN || 120)
const emit = (o) => process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n')

let present = false, expiresAt = null
try {
  const cred = JSON.parse(execSync('security find-generic-password -s "Claude Code-credentials" -w', { encoding: 'utf8' }))
  const k = Object.keys(cred.mcpOAuth || {}).find(x => x.startsWith('tiktok-ads'))
  if (!k) throw new Error('entri mcpOAuth tiktok-ads tidak ada di Keychain')
  const o = cred.mcpOAuth[k]
  present = !!o.accessToken
  expiresAt = o.expiresAt ? Number(o.expiresAt) : null
} catch (e) { emit({ event: 'TOKEN_PREFLIGHT', state: 'LOAD_FAILED', message: e.message }); process.exit(3) }

const remMin = expiresAt ? (expiresAt - Date.now()) / 60000 : null
const base = { event: 'TOKEN_PREFLIGHT', present, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, remaining_min: remMin == null ? null : Math.round(remMin), margin_min: MARGIN_MIN }
if (!present)                     { emit({ ...base, state: 'NO_TOKEN' }); process.exit(4) }
if (expiresAt && remMin <= 0)     { emit({ ...base, state: 'EXPIRED' }); process.exit(4) }
if (expiresAt && remMin <= MARGIN_MIN) { emit({ ...base, state: 'TOO_CLOSE' }); process.exit(4) }
emit({ ...base, state: expiresAt ? 'VALID' : 'NO_EXPIRY_META_ASSUME_VALID' })
process.exit(0)
