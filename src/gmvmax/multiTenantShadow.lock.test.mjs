// Tes lock KHUSUS multi-tenant shadow (Part 5). Melengkapi lock.test.mjs (yang
// menguji acquire/refuse/release/stale generik) dengan aspek spesifik mt-shadow:
// kunci 'mt-shadow' TERPISAH dari commit-worker (workspaceId), path lock
// configurable via GMVMAX_SHADOW_DIR, fail-explicit pada dir tak-writable, dan
// basis pembersihan sinyal (releaseLock menghapus file). Terisolasi via tmpdir.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireLock, releaseLock } from './lock.mjs'

const DATE = '2026-07-20'
const MT = 'mt-shadow'

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mtlock-'))
  const prev = process.env.GMVMAX_SHADOW_DIR
  process.env.GMVMAX_SHADOW_DIR = dir
  try { return fn(dir) } finally {
    if (prev === undefined) delete process.env.GMVMAX_SHADOW_DIR; else process.env.GMVMAX_SHADOW_DIR = prev
    rmSync(dir, { recursive: true, force: true })
  }
}

test('mt-shadow lock: acquire → kedua ditolak (ALREADY_RUNNING, PID tercatat) → release → bisa lagi', () => {
  withTmpDir(() => {
    const a = acquireLock(MT, DATE)
    assert.equal(a.ok, true)
    const b = acquireLock(MT, DATE)
    assert.equal(b.ok, false)
    assert.equal(b.reason, 'LOCKED')
    assert.equal(b.holder.pid, process.pid) // PID + waktu tercatat
    assert.ok(b.holder.startedAt > 0)
    releaseLock(a.path)
    const c = acquireLock(MT, DATE)
    assert.equal(c.ok, true) // setelah release → boleh lagi
    releaseLock(c.path)
  })
})

test('mt-shadow lock: kunci "mt-shadow" TIDAK bentrok dgn lock commit-worker (workspaceId)', () => {
  withTmpDir(() => {
    const mt = acquireLock(MT, DATE)
    const commit = acquireLock('10280d7b-2994-4a40-b639-2d88e0e2018b', DATE) // key commit-worker
    assert.equal(mt.ok, true)
    assert.equal(commit.ok, true) // keduanya sukses → tak ada tabrakan
    assert.notEqual(mt.path, commit.path)
    releaseLock(mt.path); releaseLock(commit.path)
  })
})

test('mt-shadow lock: dir lock configurable (GMVMAX_SHADOW_DIR) → path di bawah dir itu', () => {
  withTmpDir((dir) => {
    const a = acquireLock(MT, DATE)
    assert.ok(a.path.startsWith(dir), `lock path ${a.path} harus di bawah ${dir}`)
    assert.ok(existsSync(a.path))
    releaseLock(a.path)
  })
})

test('mt-shadow lock: dir tak-writable → THROW (fail-explicit, bukan diam-diam sukses)', () => {
  const prev = process.env.GMVMAX_SHADOW_DIR
  process.env.GMVMAX_SHADOW_DIR = '/dev/null/cannot-create' // mkdir di bawah /dev/null → ENOTDIR
  try {
    assert.throws(() => acquireLock(MT, DATE))
  } finally {
    if (prev === undefined) delete process.env.GMVMAX_SHADOW_DIR; else process.env.GMVMAX_SHADOW_DIR = prev
  }
})

test('mt-shadow lock: releaseLock menghapus file (basis pembersihan SIGTERM/SIGINT)', () => {
  withTmpDir(() => {
    const a = acquireLock(MT, DATE)
    assert.ok(existsSync(a.path))
    releaseLock(a.path) // persis yang dipanggil handler onSignal
    assert.equal(existsSync(a.path), false)
    // idempoten: release kedua tak melempar
    assert.doesNotThrow(() => releaseLock(a.path))
  })
})
