import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, validateArgs, resolveSkills, assertSafeOutputPath, stripSecrets, formatSummary } from './generate.mjs'
import { generateDecisionIntelligence } from './pipeline.mjs'
import { fakeDb } from './_fakeDb.mjs'

const WS = '10280d7b-2994-4a40-b639-2d88e0e2018b'
const GEN = '2026-07-21T02:00:00Z'
const baseArgs = ['--workspace', WS, '--store', 'store-A', '--date', '2026-07-20']

test('32 required argument validation', () => {
  assert.throws(() => validateArgs(parseArgs(['--store', 's', '--date', '2026-07-20'])), /workspace/)
  assert.throws(() => validateArgs(parseArgs(['--workspace', WS, '--date', '2026-07-20'])), /store/)
})

test('33 date validation', () => {
  assert.throws(() => validateArgs(parseArgs([...baseArgs.slice(0, 4), '--date', '2026/07/20'])), /date/)
  assert.doesNotThrow(() => validateArgs(parseArgs(baseArgs)))
})

test('34 safe path validation', () => {
  assert.throws(() => assertSafeOutputPath('/etc/passwd'), /UNSAFE_PATH/)
  assert.throws(() => assertSafeOutputPath('../../secret'), /UNSAFE_PATH/)
  assert.doesNotThrow(() => assertSafeOutputPath('out/report.json'))
})

test('35 JSON output = complete validated contracts', async () => {
  const r = await generateDecisionIntelligence({ db: fakeDb({}, WS), workspaceId: WS, storeId: 'store-A', date: '2026-07-20', generatedAt: GEN })
  const parsed = JSON.parse(JSON.stringify(stripSecrets(r)))
  for (const k of ['skill1', 'skill2', 'skill3', 'skill4', 'skill9']) assert.ok(parsed[k])
  assert.equal(parsed.execution_allowed, false)
})

test('36 summary output', async () => {
  const r = await generateDecisionIntelligence({ db: fakeDb({}, WS), workspaceId: WS, storeId: 'store-A', date: '2026-07-20', generatedAt: GEN })
  const s = formatSummary(r, [1, 2, 3, 4, 9])
  for (const tok of ['WORKSPACE:', 'SKILL 1 READINESS', 'SKILL 2 ATTRIBUTION', 'SKILL 9 PRIMARY ACTIONS', 'EXECUTION_ALLOWED=false']) assert.ok(s.includes(tok), tok)
})

test('37 skill filter dependency handling', () => {
  assert.deepEqual(resolveSkills([9]), [1, 2, 3, 4, 9])
  assert.deepEqual(resolveSkills([3]), [1, 2, 3])
  assert.deepEqual(resolveSkills(null), [1, 2, 3, 4, 9])
})

test('38 secret redaction', () => {
  const red = stripSecrets({ ok: 1, access_token: 'SECRET', nested: { authorization: 'Bearer x', keep: 2 } })
  assert.equal(red.access_token, '[redacted]')
  assert.equal(red.nested.authorization, '[redacted]')
  assert.equal(red.nested.keep, 2)
})

test('39 no scheduling / all-workspace flags', () => {
  assert.throws(() => parseArgs(['--all-workspaces']), /tak didukung/)
  assert.throws(() => parseArgs(['--schedule', 'daily']), /tak didukung/)
})

test('40 no arbitrary SQL / module flags', () => {
  assert.throws(() => parseArgs(['--sql', 'select 1']), /tak didukung/)
  assert.throws(() => parseArgs(['--require', 'evil.js']), /tak didukung/)
})
