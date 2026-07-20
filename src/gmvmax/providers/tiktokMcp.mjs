// TikTokMcpProvider — provider produksi DETERMINISTIK (tanpa LLM/agent).
// Bicara protokol MCP Streamable-HTTP ke tt-ads-mcp-layer via fetch murni,
// memanggil dispatcher `tool_execute`. Retry berbatas + fail-explicit + auth-state.
// Interface identik untuk provider masa depan (TikTokOfficialApiProvider).
import { loadMcpToken } from './tokenStore.mjs'

const AUTH = { VALID: 'AUTH_VALID', EXPIRING: 'AUTH_EXPIRING', EXPIRED: 'AUTH_EXPIRED', REFRESH: 'AUTH_REFRESH_REQUIRED' }
const EXPIRING_MS = 5 * 60 * 1000

export class TikTokMcpProvider {
  // opts: { token, serverUrl, expiresAt, fetchImpl } opsional untuk test/VPS-inject;
  // bila token/serverUrl tak diberikan → loadMcpToken() (env → Keychain).
  constructor({ maxRetries = 4, baseDelayMs = 800, rateLimitDelayMs = 8000, token, serverUrl, expiresAt, fetchImpl } = {}) {
    if (token && serverUrl) {
      this.token = token; this.url = serverUrl; this.expiresAt = expiresAt ?? null; this.tokenSource = 'inject'
    } else {
      const t = loadMcpToken()
      this.token = t.accessToken; this.url = t.serverUrl; this.expiresAt = t.expiresAt; this.tokenSource = t.source
    }
    this.fetchImpl = fetchImpl || globalThis.fetch
    this.maxRetries = maxRetries
    this.baseDelayMs = baseDelayMs
    this.rateLimitDelayMs = rateLimitDelayMs // backoff lebih panjang khusus rate-limit (QPS cooldown TikTok butuh detik, bukan ms)
    this.attemptsLast = 0 // observability: jumlah percobaan pada callTool terakhir
    this._initialized = false
  }

  auth() {
    if (!this.expiresAt) return { state: AUTH.VALID, expiresAt: null } // env tanpa expiry → dianggap valid
    const now = Date.now()
    if (now >= this.expiresAt) return { state: AUTH.EXPIRED, expiresAt: this.expiresAt }
    if (this.expiresAt - now < EXPIRING_MS) return { state: AUTH.EXPIRING, expiresAt: this.expiresAt }
    return { state: AUTH.VALID, expiresAt: this.expiresAt }
  }

  // Event terstruktur siap-alert untuk auth (P3). level: info|warn|critical.
  authEvent() {
    const a = this.auth()
    const iso = this.expiresAt ? new Date(this.expiresAt).toISOString() : null
    switch (a.state) {
      case AUTH.EXPIRING: return { event: 'MCP_TOKEN_EXPIRING_SOON', level: 'warn', state: a.state, expiresAt: iso, message: `Token MCP kedaluwarsa < 5 menit (${iso}). Siapkan re-auth /mcp.` }
      case AUTH.EXPIRED: return { event: 'MCP_TOKEN_EXPIRED', level: 'critical', state: a.state, expiresAt: iso, message: `Token MCP kedaluwarsa (${iso}). Jalankan /mcp Authenticate.` }
      case AUTH.REFRESH: return { event: 'MCP_AUTH_REQUIRED', level: 'critical', state: a.state, expiresAt: iso, message: 'Autentikasi ulang MCP diperlukan.' }
      default: return { event: 'MCP_TOKEN_VALID', level: 'info', state: a.state, expiresAt: iso, message: null }
    }
  }

  // Gagalkan run secara eksplisit bila auth tak valid (no fake success).
  assertAuth() {
    const a = this.auth()
    if (a.state === AUTH.EXPIRED || a.state === AUTH.REFRESH) {
      const err = new Error(`AUTH_EXPIRED: token MCP tt-ads kedaluwarsa (${new Date(this.expiresAt).toISOString()}). Jalankan /mcp → Authenticate.`)
      err.code = 'AUTH_EXPIRED'
      throw err
    }
    return a
  }

  get headers() {
    return { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Authorization': `Bearer ${this.token}` }
  }

  async _post(body) {
    const res = await this.fetchImpl(this.url, { method: 'POST', headers: this.headers, body: JSON.stringify(body) })
    const txt = await res.text()
    let data = null
    if (txt.trim()) {
      // SSE dikenali dari BARIS yang diawali "data:" (ciri event-stream), BUKAN
      // dari substring "data:" di mana saja — body JSON polos bisa memuat "data:"
      // di dalam nilai teks (mis. judul kreatif "…Isi data: KTP…") dan dulu itu
      // salah dibaca sebagai SSE → find() nihil → data=null → "MCP result kosong".
      const l = txt.split('\n').find(x => x.startsWith('data:'))
      const raw = l ? l.slice(5).trim() : txt
      try { data = JSON.parse(raw) }
      catch {
        // Body TEKS POLOS (bukan JSON) dari layer: mis. "unauthorized" (token baru
        // belum propagasi setelah refresh), "rate limit exceeded". Perlakukan
        // TRANSIENT → retry+backoff (bukan SyntaxError misterius yg dulu gagal keras).
        const e = new Error(`MCP layer non-JSON (${res.status}): ${txt.trim().slice(0, 80)}`)
        e.transient = true
        throw e
      }
    }
    return { status: res.status, data }
  }

  async init() {
    if (this._initialized) return
    this.assertAuth()
    // Retry handshake pada transient (mis. token baru "unauthorized" karena belum
    // propagasi di layer sesaat setelah self-refresh) + rate-limit. Hard-fail (401)
    // tidak di-retry. TTL token ~24h + run harian → refresh sering pas jam run.
    let lastErr
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const r = await this._post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gmvmax-worker', version: '1' } } })
        if (r.status === 401) { const e = new Error('AUTH_EXPIRED: 401 dari MCP'); e.code = 'AUTH_EXPIRED'; throw e }
        if (r.status !== 200 || !r.data?.result) throw new Error(`MCP initialize gagal (status ${r.status})`)
        await this._post({ jsonrpc: '2.0', method: 'notifications/initialized' })
        this._initialized = true
        return
      } catch (e) {
        if (e.code === 'AUTH_EXPIRED') throw e
        lastErr = e
        if (attempt < this.maxRetries) await sleep((e.transient || e.rateLimited ? this.rateLimitDelayMs : this.baseDelayMs) * (attempt + 1))
      }
    }
    const e = new Error(`MCP initialize gagal setelah ${this.maxRetries + 1} percobaan: ${lastErr?.message}`)
    e.code = 'MCP_INIT_FAILED'; throw e
  }

  // Panggil satu tool TikTok via dispatcher. Retry berbatas untuk transient
  // (network/5xx/rate-limit). code!=0 non-retryable → throw (fail-explicit).
  async callTool(toolName, params) {
    await this.init()
    this.assertAuth()
    let lastErr
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      this.attemptsLast = attempt + 1
      try {
        const r = await this._post({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'tool_execute', arguments: { tool_name: toolName, params } } })
        if (r.status === 401) { const e = new Error('AUTH_EXPIRED: 401 dari MCP'); e.code = 'AUTH_EXPIRED'; throw e }
        if (r.status >= 500) throw new Error(`MCP ${r.status} (transient)`)
        const rpcErr = r.data?.error
        if (rpcErr) throw new Error(`MCP RPC error: ${rpcErr.message}`)
        const text = r.data?.result?.content?.[0]?.text
        if (!text) throw new Error('MCP result kosong')
        const payload = JSON.parse(text)
        if (payload.code !== 0) {
          const msg = `${toolName} code=${payload.code}: ${payload.message}`
          if (isRetryable(payload)) { const e = new Error(msg + ' (retryable)'); e.rateLimited = true; throw e }
          const e = new Error(msg); e.code = 'MCP_ERROR'; e.nonRetryable = true; throw e
        }
        return payload.data
      } catch (e) {
        if (e.code === 'AUTH_EXPIRED' || e.nonRetryable) throw e // jangan retry hard error
        lastErr = e
        // Rate-limit (QPS) & transient layer (unauthorized-propagasi) butuh jeda
        // detik → backoff linear panjang; transient lain (5xx/network/kosong) →
        // backoff eksponensial ms yang ringan (perilaku lama).
        if (attempt < this.maxRetries) {
          const delay = (e.rateLimited || e.transient) ? this.rateLimitDelayMs * (attempt + 1) : this.baseDelayMs * 2 ** attempt
          await sleep(delay)
        }
      }
    }
    const e = new Error(`MCP_ERROR: ${toolName} gagal setelah ${this.maxRetries + 1} percobaan: ${lastErr?.message}`)
    e.code = 'MCP_ERROR'
    throw e
  }
}

// Deteksi rate-limit TikTok. Cocok pada FRASA pesan (bukan code 40000 mentah —
// 40000 dipakai banyak error generik; "too frequent" spesifik rate-limit).
function isRetryable(payload) {
  const m = (payload.message || '').toLowerCase()
  return payload.code === 40100 || m.includes('rate limit') || m.includes('qps')
    || m.includes('too many') || m.includes('too frequent')
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
export const AUTH_STATES = AUTH
