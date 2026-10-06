// Retry penyegaran token (insiden 3 Okt 2026: satu `fetch failed` = satu hari
// data hilang). Yang dikunci di sini: galat JARINGAN/5xx/429 diulang; jawaban
// OAuth definitif TIDAK PERNAH diulang — refresh token bisa dirotasi, jadi
// permintaan yang sudah dijawab server tak boleh dikirim lagi.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refreshTiktokToken, isTransientRefreshError } from './tiktokTokenRefresh.mjs'

const NOW = 1_700_000_000_000
const OK_BODY = { access_token: 'NEW_ACCESS', refresh_token: 'NEW_REFRESH', expires_in: 86400, scope: 'mcp:tt4b', token_type: 'Bearer' }
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) })
const text = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body })
const fetchFailed = (code) => {
  const cause = new Error(`connect ${code}`); cause.code = code
  return new TypeError('fetch failed', { cause })
}

// fetchImpl berskrip: tiap panggilan mengambil langkah berikutnya (fungsi → dilempar/dikembalikan).
function scripted(steps) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init.body })
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]
    const v = typeof step === 'function' ? step() : step
    if (v instanceof Error) throw v
    return v
  }
  return { fetchImpl, calls }
}
const harness = () => {
  const slept = [], failed = []
  return { slept, failed, sleepImpl: async (ms) => { slept.push(ms) }, onAttemptFailed: (i) => failed.push(i) }
}
const run = (fetchImpl, h, extra = {}) =>
  refreshTiktokToken({ refreshToken: 'R1', clientId: 'cid', fetchImpl, now: () => NOW, sleepImpl: h.sleepImpl, onAttemptFailed: h.onAttemptFailed, ...extra })

test('galat jaringan (fetch failed) → SUKSES di percobaan ke-2', async () => {
  const { fetchImpl, calls } = scripted([fetchFailed('ECONNRESET'), json(200, OK_BODY)])
  const h = harness()
  const t = await run(fetchImpl, h)
  assert.equal(t.accessToken, 'NEW_ACCESS')
  assert.equal(t.refreshToken, 'NEW_REFRESH')
  assert.equal(t.expiresAt, NOW + 86400 * 1000)
  assert.equal(t.attempts, 2)
  assert.equal(calls.length, 2)
  assert.deepEqual(h.slept, [2000])
  // permintaan ulang identik (refresh token yang sama, karena yang pertama tak pernah dijawab)
  assert.equal(calls[0].body, calls[1].body)
  assert.match(calls[0].body, /grant_type=refresh_token/)
  assert.equal(h.failed.length, 1)
  assert.equal(h.failed[0].transient, true)
  assert.equal(h.failed[0].willRetry, true)
  assert.equal(h.failed[0].retryInMs, 2000)
})

test('invalid_grant → TIDAK di-retry (1 permintaan, tanpa jeda)', async () => {
  const { fetchImpl, calls } = scripted([json(400, { error: 'invalid_grant', error_description: 'refresh token expired' })])
  const h = harness()
  await assert.rejects(() => run(fetchImpl, h), (e) => {
    assert.match(e.message, /refresh token expired/)
    assert.equal(e.transient, false)
    assert.equal(e.attempts, 1)
    assert.equal(e.oauthError, 'invalid_grant')
    assert.equal(e.httpStatus, 400)
    return true
  })
  assert.equal(calls.length, 1)
  assert.deepEqual(h.slept, [])
  assert.equal(h.failed.length, 1)
  assert.equal(h.failed[0].willRetry, false)
})

test('vonis OAuth definitif TETAP tak diulang walau dibungkus HTTP 5xx / 429', async () => {
  for (const res of [
    json(500, { error: 'invalid_grant' }),
    json(503, { error: 'server_error', error_description: 'refresh token expired' }),
    json(429, { error: 'invalid_client' }),
    json(500, { error_description: 'token has been revoked' }),
  ]) {
    const { fetchImpl, calls } = scripted([res])
    const h = harness()
    await assert.rejects(() => run(fetchImpl, h), (e) => e.transient === false && e.attempts === 1)
    assert.equal(calls.length, 1)
    assert.deepEqual(h.slept, [])
  }
})

test('HTTP 200 ber-`error` & 4xx lain → definitif, tak diulang', async () => {
  for (const res of [
    json(200, { error: 'invalid_grant' }),
    json(401, { error: 'invalid_client' }),
    json(400, {}),
    text(400, 'Bad Request'),
    json(200, { expires_in: 3600 }), // tanpa access_token
  ]) {
    const { fetchImpl, calls } = scripted([res])
    const h = harness()
    await assert.rejects(() => run(fetchImpl, h), (e) => e.transient === false)
    assert.equal(calls.length, 1)
    assert.deepEqual(h.slept, [])
  }
})

test('HTTP 503 (halaman gateway) lalu 429 lalu sukses → 3 permintaan, jeda 2s & 5s', async () => {
  const { fetchImpl, calls } = scripted([
    text(503, '<html>Service Unavailable</html>'),
    json(429, { error: 'slow_down' }),
    json(200, OK_BODY),
  ])
  const h = harness()
  const t = await run(fetchImpl, h)
  assert.equal(t.accessToken, 'NEW_ACCESS')
  assert.equal(t.attempts, 3)
  assert.equal(calls.length, 3)
  assert.deepEqual(h.slept, [2000, 5000])
  assert.deepEqual(h.failed.map(f => f.error.httpStatus), [503, 429])
})

test('jaringan mati terus → 4 percobaan (2s/5s/15s) lalu menyerah dengan transient=true', async () => {
  const { fetchImpl, calls } = scripted([fetchFailed('ETIMEDOUT')])
  const h = harness()
  await assert.rejects(() => run(fetchImpl, h), (e) => e.message === 'fetch failed' && e.transient === true && e.attempts === 4)
  assert.equal(calls.length, 4)
  assert.deepEqual(h.slept, [2000, 5000, 15000])
  assert.deepEqual(h.failed.map(f => f.willRetry), [true, true, true, false])
})

test('badan jawaban putus di tengah (TypeError terminated) → transien, diulang', async () => {
  const broken = { ok: true, status: 200, text: async () => { throw new TypeError('terminated', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) }) } }
  const { fetchImpl, calls } = scripted([broken, json(200, OK_BODY)])
  const h = harness()
  const t = await run(fetchImpl, h)
  assert.equal(t.attempts, 2)
  assert.equal(calls.length, 2)
})

test('bug kode (TypeError bukan jaringan) → tak diulang', async () => {
  const { fetchImpl, calls } = scripted([new TypeError("Cannot read properties of undefined (reading 'x')")])
  const h = harness()
  await assert.rejects(() => run(fetchImpl, h), (e) => e.transient === false && e.attempts === 1)
  assert.equal(calls.length, 1)
})

test('retryDelaysMs [] → sekali tembak walau galatnya transien', async () => {
  const { fetchImpl, calls } = scripted([fetchFailed('ECONNRESET')])
  const h = harness()
  await assert.rejects(() => run(fetchImpl, h, { retryDelaysMs: [] }), /fetch failed/)
  assert.equal(calls.length, 1)
  assert.deepEqual(h.slept, [])
})

test('isTransientRefreshError: cap eksplisit menang atas tebakan jaringan', () => {
  const definitive = Object.assign(new TypeError('fetch failed'), { transient: false })
  assert.equal(isTransientRefreshError(definitive), false)
  assert.equal(isTransientRefreshError(new TypeError('fetch failed')), true)
  assert.equal(isTransientRefreshError(new Error('refreshToken wajib')), false)
})

test('argumen wajib tetap divalidasi sebelum ada permintaan', async () => {
  const { fetchImpl, calls } = scripted([json(200, OK_BODY)])
  await assert.rejects(() => refreshTiktokToken({ refreshToken: '', clientId: 'c', fetchImpl }), /refreshToken wajib/)
  await assert.rejects(() => refreshTiktokToken({ refreshToken: 'R', clientId: '', fetchImpl }), /clientId wajib/)
  assert.equal(calls.length, 0)
})
