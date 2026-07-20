import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, existsSync, rmSync } from 'node:fs'
import { acquireLock, releaseLock } from './lock.mjs'

const ADV = 'TEST_ADV_9999', DATE = '2000-01-01'
const LOCK = `logs/shadow/locks/${ADV}__${DATE}.lock`
const cleanup = () => { try { rmSync(LOCK) } catch { /* */ } }

test('lock: acquire → acquire kedua ditolak (LOCKED); release → bisa lagi', () => {
  cleanup()
  const a = acquireLock(ADV, DATE)
  assert.equal(a.ok, true)
  const b = acquireLock(ADV, DATE) // konkuren, pid ini masih hidup
  assert.equal(b.ok, false)
  assert.equal(b.reason, 'LOCKED')
  releaseLock(a.path)
  assert.equal(existsSync(LOCK), false)
  const c = acquireLock(ADV, DATE)
  assert.equal(c.ok, true)
  releaseLock(c.path)
})

test('lock: stale (pid mati) → boleh direklamasi', () => {
  cleanup()
  // pid mustahil hidup + waktu lama → stale
  writeFileSync(LOCK, JSON.stringify({ pid: 999999, startedAt: Date.now() - 60 * 60 * 1000, advertiserId: ADV, date: DATE }))
  const a = acquireLock(ADV, DATE)
  assert.equal(a.ok, true) // direklamasi
  releaseLock(a.path)
  cleanup()
})
