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
