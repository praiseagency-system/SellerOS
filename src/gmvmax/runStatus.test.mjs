import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STATUS, batchStatus, exitCodeFor, isSuccess } from './runStatus.mjs'

test('batchStatus: semua SUCCESS → SUCCESS', () => {
  assert.equal(batchStatus([STATUS.SUCCESS, STATUS.SUCCESS]), STATUS.SUCCESS)
})
test('batchStatus: campuran sukses+gagal → PARTIAL (bukan SUCCESS)', () => {
  assert.equal(batchStatus([STATUS.SUCCESS, STATUS.FAILED]), STATUS.PARTIAL)
})
test('batchStatus: LOCKED dalam campuran → PARTIAL (skip tak dianggap sukses)', () => {
  assert.equal(batchStatus([STATUS.SUCCESS, 'LOCKED']), STATUS.PARTIAL)
})
test('batchStatus: semua AUTH_REQUIRED → AUTH_REQUIRED', () => {
  assert.equal(batchStatus([STATUS.AUTH_REQUIRED, STATUS.AUTH_REQUIRED]), STATUS.AUTH_REQUIRED)
})
test('batchStatus: semua gagal → FAILED', () => {
  assert.equal(batchStatus([STATUS.FAILED, STATUS.AUTH_REQUIRED]), STATUS.FAILED)
})
test('exitCode: hanya SUCCESS → 0; PARTIAL/FAILED/AUTH → non-zero (PARTIAL≠SUCCESS)', () => {
  assert.equal(exitCodeFor(STATUS.SUCCESS), 0)
  assert.notEqual(exitCodeFor(STATUS.PARTIAL), 0)
  assert.notEqual(exitCodeFor(STATUS.FAILED), 0)
  assert.notEqual(exitCodeFor(STATUS.AUTH_REQUIRED), 0)
  assert.equal(isSuccess(STATUS.PARTIAL), false)
})
