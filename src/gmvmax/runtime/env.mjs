// STAGE 1A + 1B — Kontrak runtime ketat + barrier shadow-only independen.
// VPS mode: SEMUA kredensial dari ENV. TANPA Keychain / credential-store Claude /
// fallback lokal / auth interaktif. Env wajib hilang → GAGAL CEPAT sebelum request
// MCP/DB apa pun, error machine-readable, exit non-zero.

import { registerSecret } from './redact.mjs'

export class RuntimeContractError extends Error {
  constructor(code, message) { super(message); this.name = 'RuntimeContractError'; this.code = code }
}

// Env read-credential Supabase (read-only untuk parity OLD). Nama generik VPS.
// Catatan: RLS lintas-workspace menuntut service-role untuk MEMBACA snapshot OLD;
// kunci ini HANYA dipakai SELECT di jalur shadow (nol tulis — dibuktikan depgraph).
const SUPABASE_URL_KEYS = ['GMVMAX_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL']
const SUPABASE_KEY_KEYS = ['GMVMAX_SUPABASE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']

function firstPresent(env, keys) { for (const k of keys) if (env[k]) return { key: k, value: env[k] }; return null }

// Barrier independen ke-2 (di luar CLI --mode). Dipanggil paling awal di entrypoint VPS.
export function assertVpsShadowContract(env = process.env) {
  if (env.GMVMAX_RUNTIME !== 'vps') {
    throw new RuntimeContractError('NOT_VPS_RUNTIME', 'GMVMAX_RUNTIME harus "vps" untuk entrypoint VPS-shadow.')
  }
  if (!('GMVMAX_SHADOW_ONLY' in env)) {
    throw new RuntimeContractError('MISSING_SHADOW_ONLY', 'GMVMAX_SHADOW_ONLY wajib di-set (nilai persis "1").')
  }
  if (env.GMVMAX_SHADOW_ONLY !== '1') {
    throw new RuntimeContractError('INVALID_SHADOW_ONLY', `GMVMAX_SHADOW_ONLY harus persis "1" (dapat: "${env.GMVMAX_SHADOW_ONLY}"). Commit mode TIDAK tersedia di entrypoint ini.`)
  }
}

// Resolusi konfigurasi runtime. keychainLoader HANYA relevan mode dev; di mode vps
// ia TIDAK PERNAH dipanggil (dibuktikan test spy).
// throwsFast: RuntimeContractError sebelum I/O.
export function resolveRuntimeConfig(env = process.env, { keychainLoader = null } = {}) {
  const mode = env.GMVMAX_RUNTIME === 'vps' ? 'vps' : 'dev'

  if (mode === 'vps') {
    // Barrier shadow-only lebih dulu.
    assertVpsShadowContract(env)

    // Sumber token: 'env' (default, dari Keychain-bridge) atau 'supabase' (baca
    // koneksi website per-workspace + self-refresh). Additive — default identik.
    const tokenSource = env.GMVMAX_TOKEN_SOURCE === 'supabase' ? 'supabase' : 'env'

    // Supabase read-credentials — WAJIB env (parity/shadow store + — bila dipakai — sumber token).
    const sbUrl = firstPresent(env, SUPABASE_URL_KEYS)
    if (!sbUrl) throw new RuntimeContractError('MISSING_SUPABASE_URL', `URL Supabase wajib (salah satu: ${SUPABASE_URL_KEYS.join('|')}).`)
    const sbKey = firstPresent(env, SUPABASE_KEY_KEYS)
    if (!sbKey) throw new RuntimeContractError('MISSING_SUPABASE_KEY', `Kredensial baca Supabase wajib (salah satu: ${SUPABASE_KEY_KEYS.join('|')}).`)
    registerSecret(sbKey.value)

    let mcp = null
    if (tokenSource === 'env') {
      // MCP token+URL — WAJIB env (tanpa fallback Keychain; endpoint tak diasumsikan).
      if (!env.GMVMAX_MCP_TOKEN) {
        throw new RuntimeContractError('MISSING_MCP_TOKEN', 'GMVMAX_MCP_TOKEN wajib (env) di mode vps sumber-env. Tanpa fallback Keychain.')
      }
      if (!env.GMVMAX_MCP_URL) {
        throw new RuntimeContractError('MISSING_MCP_URL', 'GMVMAX_MCP_URL wajib (env) di mode vps sumber-env. Endpoint default tidak diasumsikan.')
      }
      const expiresAt = env.GMVMAX_MCP_EXPIRES_AT ? Number(env.GMVMAX_MCP_EXPIRES_AT) : null
      registerSecret(env.GMVMAX_MCP_TOKEN)
      mcp = { token: env.GMVMAX_MCP_TOKEN, url: env.GMVMAX_MCP_URL, expiresAt }
    }
    // tokenSource === 'supabase' → mcp di-resolve runtime dari tiktok_connections
    // (per-workspace advertiser) di entrypoint; token/url tak wajib di env.

    return {
      mode: 'vps', shadowOnly: true, tokenSource, mcp,
      supabase: { url: sbUrl.value, key: sbKey.value, keySource: sbKey.key },
      keychainUsed: false,
    }
  }

  // mode dev: perilaku lama TIDAK berubah — provider boleh pakai Keychain via loader.
  return { mode: 'dev', shadowOnly: null, tokenSource: 'env', mcp: null, supabase: null, keychainUsed: !!keychainLoader, keychainLoader }
}

// Ringkasan aman untuk log (tanpa nilai rahasia; hanya bentuk/kehadiran).
export function configShape(cfg) {
  if (cfg.mode !== 'vps') return { mode: cfg.mode }
  return {
    mode: cfg.mode, shadowOnly: cfg.shadowOnly, tokenSource: cfg.tokenSource,
    mcp: cfg.mcp
      ? { tokenPresent: !!cfg.mcp.token, url: cfg.mcp.url, expiresAt: cfg.mcp.expiresAt ? new Date(cfg.mcp.expiresAt).toISOString() : null }
      : { source: 'supabase(runtime)' },
    supabase: { url: cfg.supabase.url, keyPresent: !!cfg.supabase.key, keySource: cfg.supabase.keySource },
    keychainUsed: cfg.keychainUsed,
  }
}
