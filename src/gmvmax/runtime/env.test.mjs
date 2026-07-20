// STAGE 1A/1B — kontrak runtime VPS: fail-fast, env-only, tanpa Keychain.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveRuntimeConfig, assertVpsShadowContract, RuntimeContractError, configShape } from './env.mjs'

const VALID_VPS = {
  GMVMAX_RUNTIME: 'vps', GMVMAX_SHADOW_ONLY: '1',
  GMVMAX_MCP_TOKEN: 'tok_ABC123456', GMVMAX_MCP_URL: 'https://business-api.tiktok.com/mcp',
  GMVMAX_SUPABASE_URL: 'https://x.supabase.co', GMVMAX_SUPABASE_KEY: 'svc_KEY_9999999',
}
// keychain spy: MELEDAK bila dipanggil (bukti mode vps tak menyentuh Keychain)
function keychainSpy() { throw new Error('KEYCHAIN_INVOKED — dilarang di mode vps') }

test('1A vps + token hilang → fail-fast MISSING_MCP_TOKEN', () => {
  const env = { ...VALID_VPS }; delete env.GMVMAX_MCP_TOKEN
  assert.throws(() => resolveRuntimeConfig(env, { keychainLoader: keychainSpy }),
    e => e instanceof RuntimeContractError && e.code === 'MISSING_MCP_TOKEN')
})
test('1A vps + supabase key hilang → fail-fast MISSING_SUPABASE_KEY', () => {
  const env = { ...VALID_VPS }; delete env.GMVMAX_SUPABASE_KEY
  assert.throws(() => resolveRuntimeConfig(env, { keychainLoader: keychainSpy }),
    e => e.code === 'MISSING_SUPABASE_KEY')
})
test('1A vps + MCP URL hilang → fail-fast MISSING_MCP_URL (tak asumsi default)', () => {
  const env = { ...VALID_VPS }; delete env.GMVMAX_MCP_URL
  assert.throws(() => resolveRuntimeConfig(env, { keychainLoader: keychainSpy }),
    e => e.code === 'MISSING_MCP_URL')
})
test('1A vps valid → keychain TIDAK PERNAH dipanggil + config env-only', () => {
  const cfg = resolveRuntimeConfig(VALID_VPS, { keychainLoader: keychainSpy }) // spy tak meledak = tak dipanggil
  assert.equal(cfg.mode, 'vps')
  assert.equal(cfg.keychainUsed, false)
  assert.equal(cfg.mcp.token, VALID_VPS.GMVMAX_MCP_TOKEN)
  assert.equal(cfg.supabase.keySource, 'GMVMAX_SUPABASE_KEY')
})
test('1B barrier: GMVMAX_SHADOW_ONLY hilang → MISSING_SHADOW_ONLY', () => {
  const env = { ...VALID_VPS }; delete env.GMVMAX_SHADOW_ONLY
  assert.throws(() => assertVpsShadowContract(env), e => e.code === 'MISSING_SHADOW_ONLY')
})
test('1B barrier: GMVMAX_SHADOW_ONLY != "1" → INVALID_SHADOW_ONLY (exact match)', () => {
  for (const bad of ['0', 'true', 'yes', '1 ', ' 1']) {
    assert.throws(() => assertVpsShadowContract({ ...VALID_VPS, GMVMAX_SHADOW_ONLY: bad }),
      e => e.code === 'INVALID_SHADOW_ONLY', `harus tolak "${bad}"`)
  }
})
test('1B barrier: non-vps runtime → NOT_VPS_RUNTIME', () => {
  assert.throws(() => assertVpsShadowContract({ GMVMAX_RUNTIME: 'dev', GMVMAX_SHADOW_ONLY: '1' }),
    e => e.code === 'NOT_VPS_RUNTIME')
})
test('1A dev mode: perilaku lama TAK berubah (mode dev, keychainLoader diteruskan)', () => {
  const cfg = resolveRuntimeConfig({ FOO: 'bar' }, { keychainLoader: () => 'kc' })
  assert.equal(cfg.mode, 'dev')
  assert.equal(typeof cfg.keychainLoader, 'function')
})
test('1D configShape tak membocorkan token/key', () => {
  const s = JSON.stringify(configShape(resolveRuntimeConfig(VALID_VPS)))
  assert.ok(!s.includes(VALID_VPS.GMVMAX_MCP_TOKEN))
  assert.ok(!s.includes(VALID_VPS.GMVMAX_SUPABASE_KEY))
  assert.ok(s.includes('tokenPresent'))
})
