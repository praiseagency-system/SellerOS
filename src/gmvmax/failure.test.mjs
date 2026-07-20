// P2 failure-injection (provider-level). Transport & token di-inject → tak butuh
// jaringan/Keychain/DDL. Membuktikan: retry berbatas, tanpa infinite loop, auth
// eksplisit, event alert.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TikTokMcpProvider } from './providers/tiktokMcp.mjs'

const res = (status, bodyObj) => ({ status, headers: { get: () => null }, text: async () => (bodyObj == null ? '' : JSON.stringify(bodyObj)) })
const toolResult = (payload) => ({ jsonrpc: '2.0', id: 1, result: { content: [{ text: JSON.stringify(payload) }] } })
function fakeFetch(onToolCall) {
  return async (_url, opts) => {
    const b = JSON.parse(opts.body)
    if (b.method === 'initialize') return res(200, { jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'fake' } } })
    if (b.method === 'notifications/initialized') return res(202, null)
    if (b.method === 'tools/call') return onToolCall()
    return res(200, {})
  }
}
const OK = { token: 't', serverUrl: 'http://fake', expiresAt: Date.now() + 3600000, baseDelayMs: 1 }

test('P2.2 transient 500 → retry berbatas, sukses pada percobaan ke-3 (retry count tercatat)', async () => {
  let n = 0
  const p = new TikTokMcpProvider({ ...OK, maxRetries: 4, fetchImpl: fakeFetch(() => { n++; return n < 3 ? res(500, null) : res(200, toolResult({ code: 0, data: { ok: true } })) }) })
  assert.deepEqual(await p.callTool('x', {}), { ok: true })
  assert.equal(p.attemptsLast, 3)
})

test('P2.2 selalu 500 → MCP_ERROR setelah maxRetries+1 percobaan, TANPA infinite loop', async () => {
  const p = new TikTokMcpProvider({ ...OK, maxRetries: 3, fetchImpl: fakeFetch(() => res(500, null)) })
  await assert.rejects(() => p.callTool('x', {}), /MCP_ERROR/)
  assert.equal(p.attemptsLast, 4) // 3+1, terbatas
})

test('P2.2 non-retryable code≠0 → gagal langsung (tanpa retry)', async () => {
  const p = new TikTokMcpProvider({ ...OK, maxRetries: 4, fetchImpl: fakeFetch(() => res(200, toolResult({ code: 40002, message: 'Invalid metric(s)' }))) })
  await assert.rejects(() => p.callTool('x', {}), /Invalid metric/)
  assert.equal(p.attemptsLast, 1) // tidak di-retry
})

test('P2.3 AUTH_EXPIRED → auth state + assertAuth throw + callTool tolak (no partial success)', async () => {
  const p = new TikTokMcpProvider({ token: 't', serverUrl: 'http://fake', expiresAt: Date.now() - 1000, fetchImpl: fakeFetch(() => res(200, toolResult({ code: 0, data: {} }))) })
  assert.equal(p.auth().state, 'AUTH_EXPIRED')
  assert.throws(() => p.assertAuth(), /AUTH_EXPIRED/)
  await assert.rejects(() => p.callTool('x', {}), /AUTH_EXPIRED/)
  const ev = p.authEvent(); assert.equal(ev.event, 'MCP_TOKEN_EXPIRED'); assert.equal(ev.level, 'critical')
})

test('P2.3 AUTH_EXPIRING → alert warn event', () => {
  const p = new TikTokMcpProvider({ token: 't', serverUrl: 'http://fake', expiresAt: Date.now() + 2 * 60 * 1000 })
  assert.equal(p.auth().state, 'AUTH_EXPIRING')
  assert.equal(p.authEvent().event, 'MCP_TOKEN_EXPIRING_SOON')
  assert.equal(p.authEvent().level, 'warn')
})
