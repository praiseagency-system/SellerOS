// STAGE 2A — bukti TZ deterministik (instant di-inject). Dijalankan di bawah TZ=UTC
// (lihat test-gmvmax.sh) untuk membuktikan snapshot_date pakai semantik Asia/Jakarta,
// BUKAN TZ mesin. Intl timeZone eksplisit → independen thd process.TZ.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jakartaDateString, resolveSnapshotDate, dateMinusDays, tzEvidence } from './jakartaDate.mjs'

// Batas rollover Jakarta = 17:00Z (UTC+7). 16:59Z masih hari sebelumnya.
const beforeBoundary = Date.parse('2026-07-10T16:59:00Z') // 23:59 WIB 10 Jul
const atBoundary = Date.parse('2026-07-10T17:00:00Z')     // 00:00 WIB 11 Jul
const afterBoundary = Date.parse('2026-07-10T17:30:00Z')  // 00:30 WIB 11 Jul

test('2A 23:59 WIB (16:59Z) → jakartaDate 2026-07-10 (= utcDate)', () => {
  assert.equal(jakartaDateString(beforeBoundary), '2026-07-10')
})
test('2A 00:00 WIB (17:00Z) → jakartaDate 2026-07-11 (utcDate masih 2026-07-10)', () => {
  assert.equal(jakartaDateString(atBoundary), '2026-07-11')
  assert.equal(new Date(atBoundary).toISOString().slice(0, 10), '2026-07-10') // utcDate BEDA
})
test('2A Case-1: UTC date ≠ Jakarta date pada 17:30Z', () => {
  const ev = tzEvidence(afterBoundary, 'today')
  assert.equal(ev.utcDate, '2026-07-10')
  assert.equal(ev.jakartaDate, '2026-07-11')
  assert.notEqual(ev.utcDate, ev.jakartaDate)
})
test('2A Case-2: "yesterday" bergeser di batas TZ', () => {
  // 16:59Z → Jakarta 10 Jul → yesterday 09 Jul
  assert.equal(resolveSnapshotDate('yesterday', beforeBoundary), '2026-07-09')
  // 17:00Z → Jakarta 11 Jul → yesterday 10 Jul
  assert.equal(resolveSnapshotDate('yesterday', atBoundary), '2026-07-10')
})
test('2A resolveSnapshotDate today/explicit + validasi', () => {
  assert.equal(resolveSnapshotDate('today', afterBoundary), '2026-07-11')
  assert.equal(resolveSnapshotDate('2026-05-01', afterBoundary), '2026-05-01')
  assert.throws(() => resolveSnapshotDate('01-05-2026', afterBoundary), /invalid/)
})
test('2A dateMinusDays lintas-bulan aman', () => {
  assert.equal(dateMinusDays('2026-07-01', 1), '2026-06-30')
  assert.equal(dateMinusDays('2026-01-01', 1), '2025-12-31')
})
test('2A independen TZ mesin: hasil sama walau process.env.TZ diubah', () => {
  const prev = process.env.TZ
  try {
    process.env.TZ = 'America/Los_Angeles'
    assert.equal(jakartaDateString(atBoundary), '2026-07-11') // tetap Jakarta
    process.env.TZ = 'UTC'
    assert.equal(jakartaDateString(atBoundary), '2026-07-11')
  } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev }
})
