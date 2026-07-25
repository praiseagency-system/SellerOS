// STAGE 1C — boundary tests dgn `now` DI-INJECT (tanpa wall-clock flaky).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyAuth, authEvent, AUTH, isBlocking } from './authState.mjs'

const NOW = 1_000_000_000_000
const DAY = 86400000

test('1C batas: 7d+epsilon → VALID', () => {
  assert.equal(classifyAuth(NOW + 7 * DAY + 1, NOW).state, AUTH.VALID)
})
test('1C batas: tepat 7d → WARNING', () => {
  assert.equal(classifyAuth(NOW + 7 * DAY, NOW).state, AUTH.WARNING)
})
test('1C batas: 3d+epsilon → WARNING', () => {
  assert.equal(classifyAuth(NOW + 3 * DAY + 1, NOW).state, AUTH.WARNING)
})
test('1C batas: tepat 3d → URGENT', () => {
  assert.equal(classifyAuth(NOW + 3 * DAY, NOW).state, AUTH.URGENT)
})
test('1C batas: 1ms sebelum expiry → URGENT', () => {
  assert.equal(classifyAuth(NOW + 1, NOW).state, AUTH.URGENT)
})
test('1C batas: tepat expiry → EXPIRED', () => {
  const c = classifyAuth(NOW, NOW)
  assert.equal(c.state, AUTH.EXPIRED)
  assert.ok(isBlocking(c.state))
})
test('1C batas: sudah expired → EXPIRED (blocking)', () => {
  assert.equal(classifyAuth(NOW - 1, NOW).state, AUTH.EXPIRED)
})
test('1C null expiresAt → VALID (policy: env tanpa metadata)', () => {
  assert.equal(classifyAuth(null, NOW).state, AUTH.VALID)
})
test('1C authEvent: EXPIRED → critical AUTH_REQUIRED, tanpa nilai rahasia', () => {
  const ev = authEvent(classifyAuth(NOW - 1, NOW))
  assert.equal(ev.level, 'critical')
  assert.equal(ev.event, 'MCP_AUTH_REQUIRED')
  assert.equal(ev.state, AUTH.EXPIRED)
})
test('1C authEvent: URGENT & WARNING beda level', () => {
  assert.equal(authEvent(classifyAuth(NOW + 2 * DAY, NOW)).level, 'urgent')
  assert.equal(authEvent(classifyAuth(NOW + 5 * DAY, NOW)).level, 'warn')
})

// ── Token yang rotasi sendiri (refresh_token ada di tiktok_connections) ────────
// Access token TikTok berumur ~24 jam & diperbarui tiap run. Dengan ambang 3 hari,
// dulu SETIAP run mencetak "URGENT: ganti token SEKARANG" → alarm palsu harian.

test('selfRenewing: sisa ~24 jam TIDAK urgent (dulu alarm palsu tiap run)', () => {
  const c = classifyAuth(NOW + DAY, NOW, { selfRenewing: true })
  assert.equal(c.state, AUTH.VALID)
  assert.equal(authEvent(c).level, 'info')
  assert.equal(authEvent(c).message, null)
})

test('selfRenewing: sisa beberapa menit pun masih VALID (refresh terjadi saat run)', () => {
  assert.equal(classifyAuth(NOW + 60_000, NOW, { selfRenewing: true }).state, AUTH.VALID)
})

test('selfRenewing TIDAK menutupi token yang benar-benar mati → tetap EXPIRED & blocking', () => {
  const c = classifyAuth(NOW - 1, NOW, { selfRenewing: true })
  assert.equal(c.state, AUTH.EXPIRED)
  assert.ok(isBlocking(c.state))
  const ev = authEvent(c)
  assert.equal(ev.level, 'critical')
  assert.match(ev.message, /refresh GAGAL/)
})

test('tanpa selfRenewing perilaku lama tak berubah (token manual tetap diperingatkan)', () => {
  assert.equal(classifyAuth(NOW + DAY, NOW).state, AUTH.URGENT)
  assert.equal(classifyAuth(NOW + 5 * DAY, NOW).state, AUTH.WARNING)
})

test('selfRenewing ikut terbawa di hasil classify (untuk pesan & audit)', () => {
  assert.equal(classifyAuth(NOW + DAY, NOW, { selfRenewing: true }).selfRenewing, true)
  assert.equal(classifyAuth(NOW + DAY, NOW).selfRenewing, false)
})
