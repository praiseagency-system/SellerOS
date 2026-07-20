// STAGE 1D — redaksi rahasia: nilai eksak, key sensitif, Bearer, nested/array, Error,
// non-mutating; + grep artefak (0 kemunculan secret).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, readFileSync, rmSync } from 'node:fs'
import { redact, safeStringify, scrubString, registerSecret, clearSecrets } from './redact.mjs'

const FAKE = 'FAKESECRET_deadbeef_0123456789'
const FAKE_SVC = 'svcrole_FAKE_98765abcdef'

test('1D nilai rahasia terdaftar diredaksi di string nested/array', () => {
  clearSecrets(); registerSecret(FAKE); registerSecret(FAKE_SVC)
  const obj = {
    msg: `token is ${FAKE} end`,
    arr: ['ok', `x ${FAKE_SVC} y`],
    nested: { deep: { note: FAKE } },
  }
  const s = safeStringify(obj)
  assert.ok(!s.includes(FAKE), 'FAKE bocor')
  assert.ok(!s.includes(FAKE_SVC), 'FAKE_SVC bocor')
  assert.ok(s.includes('[REDACTED]'))
})

test('1D key sensitif diredaksi (case-insensitive) walau nilai tak terdaftar', () => {
  clearSecrets()
  const obj = { accessToken: 'unregistered_val_1', Authorization: 'Bearer abc.def.ghi', SUPABASE_SECRET_KEY: 'zzz', refreshToken: 'rrr' }
  const s = safeStringify(obj)
  assert.ok(!s.includes('unregistered_val_1'))
  assert.ok(!s.includes('zzz'))
  assert.ok(!s.includes('rrr'))
})

test('1D pola "Bearer xxx" diredaksi walau tak terdaftar', () => {
  clearSecrets()
  assert.ok(!scrubString('Authorization: Bearer aBcD.eF12-34_56/78').includes('aBcD'))
})

test('1D env dump key diredaksi total', () => {
  clearSecrets()
  const s = safeStringify({ env: { GMVMAX_MCP_TOKEN: 'leak_me', PATH: '/usr/bin' } })
  assert.ok(!s.includes('leak_me'))
  assert.ok(!s.includes('/usr/bin'))
})

test('1D Error diredaksi (message discrub, tanpa stack)', () => {
  clearSecrets(); registerSecret(FAKE)
  const r = redact(new Error(`boom with ${FAKE}`))
  assert.ok(!JSON.stringify(r).includes(FAKE))
  assert.equal(r.stack, undefined)
  assert.equal(r.name, 'Error')
})

test('1D NON-MUTATING: objek asli tak berubah', () => {
  clearSecrets(); registerSecret(FAKE)
  const obj = { a: { token: 'x', note: FAKE }, list: [FAKE] }
  const before = JSON.stringify(obj)
  safeStringify(obj)
  assert.equal(JSON.stringify(obj), before, 'input termutasi!')
})

test('1D circular aman', () => {
  clearSecrets()
  const o = { a: 1 }; o.self = o
  const s = safeStringify(o)
  assert.ok(s.includes('[Circular]'))
})

test('1D grep artefak: 0 kemunculan secret di file log ter-serialize', () => {
  clearSecrets(); registerSecret(FAKE); registerSecret(FAKE_SVC)
  const artifact = '/private/tmp/claude-501/-Users-macbook-claude/redact-artifact.log'
  const payloads = [
    { event: 'MCP_REQUEST', headers: { Authorization: `Bearer ${FAKE}` } },
    { event: 'DB_ERROR', supabaseKey: FAKE_SVC, detail: `failed using ${FAKE_SVC}` },
    { event: 'ENV', env: { GMVMAX_MCP_TOKEN: FAKE } },
  ]
  writeFileSync(artifact, payloads.map(p => safeStringify(p)).join('\n'))
  const content = readFileSync(artifact, 'utf8')
  const count = (content.match(new RegExp(FAKE, 'g')) || []).length + (content.match(new RegExp(FAKE_SVC, 'g')) || []).length
  rmSync(artifact, { force: true })
  assert.equal(count, 0, `secret muncul ${count}× di artefak`)
})
