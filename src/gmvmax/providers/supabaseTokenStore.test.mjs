import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadMcpTokenFromSupabase } from './supabaseTokenStore.mjs'
import { refreshTiktokToken } from './tiktokTokenRefresh.mjs'

const WS = 'ws-1'
const NOW = 1_700_000_000_000

// Fake Supabase: satu tabel tiktok_connections, satu baris. Merekam update.
function fakeSupabase(row) {
  const state = { row: row ? { ...row } : null, updates: [] }
  const api = {
    from() { return api },
    select() { return api },
    eq(_c, v) { api._ws = v; return api },
    async maybeSingle() { return { data: state.row, error: null } },
    async update(patch) { state.updates.push(patch); state.row = { ...state.row, ...patch }; return { eq: async () => ({ error: null }) } },
    _state: state,
  }
  // update(...).eq(...) → kembalikan {error}
  api.update = (patch) => { state.updates.push(patch); Object.assign(state.row, patch); return { eq: async () => ({ error: null }) } }
  return api
}

const validRow = {
  workspace_id: WS, client_id: 'cid-123', access_token: 'OLD_ACCESS',
  refresh_token: 'OLD_REFRESH', scope: 'mcp:tt4b', token_type: 'Bearer',
  expires_at: new Date(NOW + 60 * 60 * 1000).toISOString(), // +1 jam → masih valid
}

test('token valid → passthrough tanpa refresh/update', async () => {
  const sb = fakeSupabase(validRow)
  let fetched = false
  const out = await loadMcpTokenFromSupabase({ supabase: sb, workspaceId: WS, now: NOW, fetchImpl: async () => { fetched = true } })
  assert.equal(out.accessToken, 'OLD_ACCESS')
  assert.equal(out.source, 'supabase')
  assert.equal(fetched, false)
  assert.equal(sb._state.updates.length, 0)
})

test('mau kedaluwarsa → refresh + writeback token baru', async () => {
  const nearRow = { ...validRow, expires_at: new Date(NOW + 60 * 1000).toISOString() } // +1 mnt < margin 10 mnt
  const sb = fakeSupabase(nearRow)
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({
    access_token: 'NEW_ACCESS', refresh_token: 'NEW_REFRESH', expires_in: 86400, scope: 'mcp:tt4b', token_type: 'Bearer',
  }) })
  const out = await loadMcpTokenFromSupabase({ supabase: sb, workspaceId: WS, now: NOW, fetchImpl })
  assert.equal(out.accessToken, 'NEW_ACCESS')
  assert.equal(out.source, 'supabase-refreshed')
  assert.equal(sb._state.updates.length, 1)
  assert.equal(sb._state.updates[0].access_token, 'NEW_ACCESS')
  assert.equal(sb._state.updates[0].refresh_token, 'NEW_REFRESH')
})

test('tak ada baris → error jelas', async () => {
  const sb = fakeSupabase(null)
  await assert.rejects(() => loadMcpTokenFromSupabase({ supabase: sb, workspaceId: WS, now: NOW }), /Belum ada koneksi/)
})

test('mau habis tapi tanpa refresh_token → error', async () => {
  const sb = fakeSupabase({ ...validRow, refresh_token: null, expires_at: new Date(NOW + 1000).toISOString() })
  await assert.rejects(() => loadMcpTokenFromSupabase({ supabase: sb, workspaceId: WS, now: NOW }), /Connect ulang/)
})

test('refreshTiktokToken: server tak rotasi → pertahankan refresh lama', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'A2', expires_in: 3600 }) })
  const t = await refreshTiktokToken({ refreshToken: 'R1', clientId: 'c', fetchImpl, now: () => NOW })
  assert.equal(t.accessToken, 'A2')
  assert.equal(t.refreshToken, 'R1') // dipertahankan
  assert.equal(t.expiresAt, NOW + 3600 * 1000)
})

test('refreshTiktokToken: error OAuth → throw', async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: 'invalid_grant', error_description: 'expired' }) })
  await assert.rejects(() => refreshTiktokToken({ refreshToken: 'R', clientId: 'c', fetchImpl }), /expired/)
})

// ── Ketahanan (insiden 3 Okt 2026) ──────────────────────────────────────────
// Fake yang bisa menjatuhkan tulis-balik: `updateResults` = antrean jawaban
// .update().eq() (habis → sukses). Merekam tiap patch yang dikirim.
function flakySupabase(row, updateResults = []) {
  const state = { row: { ...row }, patches: [] }
  const api = {
    from() { return api },
    select() { return api },
    eq() { return api },
    async maybeSingle() { return { data: state.row, error: null } },
    update(patch) {
      return { eq: async () => {
        state.patches.push(patch)
        const res = updateResults.shift() ?? { error: null, status: 204 }
        if (!res.error) Object.assign(state.row, patch)
        return res
      } }
    },
    _state: state,
  }
  return api
}
const nearRow = { ...validRow, expires_at: new Date(NOW + 60 * 1000).toISOString() } // sisa 1 mnt → wajib refresh
const okFetch = () => ({ ok: true, status: 200, text: async () => JSON.stringify({
  access_token: 'NEW_ACCESS', refresh_token: 'NEW_REFRESH', expires_in: 86400, scope: 'mcp:tt4b', token_type: 'Bearer',
}) })
const netDown = () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) }) }
const capture = () => { const logs = [], slept = []; return { logs, slept, log: (o) => logs.push(o), sleepImpl: async (ms) => slept.push(ms) } }

test('refresh: jaringan putus sekali → pulih di percobaan ke-2, token baru tersimpan', async () => {
  const sb = flakySupabase(nearRow)
  const c = capture()
  let n = 0
  const fetchImpl = async () => (++n === 1 ? netDown() : okFetch())
  const out = await loadMcpTokenFromSupabase({ supabase: sb, workspaceId: WS, now: NOW, fetchImpl, log: c.log, sleepImpl: c.sleepImpl })
  assert.equal(out.accessToken, 'NEW_ACCESS')
  assert.equal(out.source, 'supabase-refreshed')
  assert.equal(n, 2)
  assert.deepEqual(c.slept, [2000])
  assert.equal(sb._state.patches.length, 1)
  assert.equal(sb._state.row.refresh_token, 'NEW_REFRESH')
  // tiap percobaan gagal punya baris log; pemulihan juga dicatat
  assert.deepEqual(c.logs.map(l => l.event), ['TOKEN_REFRESH_ATTEMPT_FAILED', 'TOKEN_REFRESH_RECOVERED'])
  assert.deepEqual(
    { step: c.logs[0].step, attempt: c.logs[0].attempt, max_attempts: c.logs[0].max_attempts, transient: c.logs[0].transient, will_retry: c.logs[0].will_retry, retry_in_ms: c.logs[0].retry_in_ms, code: c.logs[0].code, workspace_id: c.logs[0].workspace_id },
    { step: 'oauth_post', attempt: 1, max_attempts: 4, transient: true, will_retry: true, retry_in_ms: 2000, code: 'ECONNRESET', workspace_id: WS },
  )
  assert.deepEqual({ step: c.logs[1].step, attempts: c.logs[1].attempts }, { step: 'oauth_post', attempts: 2 })
})

test('refresh: invalid_grant → tak diulang, tak ada tulis-balik, galat dicap definitif', async () => {
  const sb = flakySupabase(nearRow)
  const c = capture()
  let n = 0
  const fetchImpl = async () => { n++; return { ok: false, status: 400, text: async () => JSON.stringify({ error: 'invalid_grant', error_description: 'refresh token expired' }) } }
  await assert.rejects(
    () => loadMcpTokenFromSupabase({ supabase: sb, workspaceId: WS, now: NOW, fetchImpl, log: c.log, sleepImpl: c.sleepImpl }),
    (e) => /refresh token expired/.test(e.message) && e.transient === false && e.attempts === 1,
  )
  assert.equal(n, 1)
  assert.deepEqual(c.slept, [])
  assert.equal(sb._state.patches.length, 0)
  assert.equal(sb._state.row.refresh_token, 'OLD_REFRESH') // token lama tak tersentuh
  assert.equal(c.logs.length, 1)
  assert.deepEqual(
    { event: c.logs[0].event, will_retry: c.logs[0].will_retry, transient: c.logs[0].transient, http_status: c.logs[0].http_status, code: c.logs[0].code },
    { event: 'TOKEN_REFRESH_ATTEMPT_FAILED', will_retry: false, transient: false, http_status: 400, code: 'invalid_grant' },
  )
})

test('tulis-balik gagal jaringan → DIULANG tanpa mengulang POST (refresh token sudah dirotasi)', async () => {
  const sb = flakySupabase(nearRow, [
    { error: { message: 'TypeError: fetch failed' }, status: 0 }, // bentuk supabase-js saat jaringan putus
    { error: { message: 'upstream connect error' }, status: 503 },
  ])
  const c = capture()
  let n = 0
  const fetchImpl = async () => { n++; return okFetch() }
  const out = await loadMcpTokenFromSupabase({ supabase: sb, workspaceId: WS, now: NOW, fetchImpl, log: c.log, sleepImpl: c.sleepImpl })
  assert.equal(n, 1, 'POST refresh hanya boleh SEKALI — server sudah menjawab')
  assert.equal(out.accessToken, 'NEW_ACCESS')
  assert.equal(sb._state.patches.length, 3)
  assert.deepEqual(sb._state.patches[0], sb._state.patches[2]) // idempoten: nilai sama persis
  assert.equal(sb._state.row.refresh_token, 'NEW_REFRESH')
  assert.deepEqual(c.slept, [2000, 5000])
  assert.deepEqual(c.logs.map(l => `${l.event}:${l.step}`), [
    'TOKEN_REFRESH_ATTEMPT_FAILED:writeback', 'TOKEN_REFRESH_ATTEMPT_FAILED:writeback', 'TOKEN_REFRESH_RECOVERED:writeback',
  ])
})

test('tulis-balik ditolak DB (bukan jaringan) → langsung gagal + peringatan TOKEN_WRITEBACK_LOST', async () => {
  const sb = flakySupabase(nearRow, [{ error: { message: 'permission denied for table tiktok_connections' }, status: 403 }])
  const c = capture()
  let n = 0
  const fetchImpl = async () => { n++; return okFetch() }
  await assert.rejects(
    () => loadMcpTokenFromSupabase({ supabase: sb, workspaceId: WS, now: NOW, fetchImpl, log: c.log, sleepImpl: c.sleepImpl }),
    (e) => /writeback token gagal: permission denied/.test(e.message) && e.transient === false && e.attempts === 1,
  )
  assert.equal(n, 1)
  assert.equal(sb._state.patches.length, 1)
  assert.deepEqual(c.slept, [])
  assert.deepEqual(c.logs.map(l => l.event), ['TOKEN_REFRESH_ATTEMPT_FAILED', 'TOKEN_WRITEBACK_LOST'])
  assert.equal(c.logs[1].level, 'critical')
})

test('log percobaan lolos redaksi: angka terbaca, nilai token tak pernah ikut', async () => {
  const { safeStringify } = await import('../runtime/redact.mjs')
  const sb = flakySupabase(nearRow)
  const c = capture()
  let n = 0
  const fetchImpl = async () => (++n === 1 ? netDown() : okFetch())
  await loadMcpTokenFromSupabase({ supabase: sb, workspaceId: WS, now: NOW, fetchImpl, log: c.log, sleepImpl: c.sleepImpl })
  const line = JSON.parse(safeStringify(c.logs[0]))
  // redact.mjs menyensor nilai dari KUNCI yang memuat "token"/"refresh" — kunci log sengaja menghindarinya
  assert.equal(line.attempt, 1)
  assert.equal(line.max_attempts, 4)
  assert.equal(line.retry_in_ms, 2000)
  assert.equal(line.step, 'oauth_post')
  assert.equal(line.message, 'fetch failed')
  const all = c.logs.map(l => safeStringify(l)).join('\n')
  for (const secret of ['OLD_REFRESH', 'NEW_REFRESH', 'OLD_ACCESS', 'NEW_ACCESS']) assert.equal(all.includes(secret), false, secret)
})
