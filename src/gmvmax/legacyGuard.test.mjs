import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const script = join(dirname(fileURLToPath(import.meta.url)), '../../scripts/syncGmvMax.mjs')
const run = (extraEnv) => spawnSync('node', [script], { encoding: 'utf8', env: { ...process.env, ...extraEnv } })

test('legacy writer BLOCKED tanpa override (exit 2, sebelum sentuh DB)', () => {
  const r = run({ GMVMAX_LEGACY_WRITER_OK: '0' })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /LEGACY_WRITER_BLOCKED/)
  assert.doesNotMatch(r.stderr, /Snapshot tersimpan|import gagal/) // tak menulis apa pun
})

test('override eksplisit melewati guard (bukan exit 2)', () => {
  const r = run({ GMVMAX_LEGACY_WRITER_OK: '1' })
  assert.notEqual(r.status, 2) // lolos guard; gagal berikutnya krn tak ada manifest
  assert.match(r.stderr, /LEGACY_WRITER_OVERRIDE/)
})
