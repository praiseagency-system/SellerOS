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
