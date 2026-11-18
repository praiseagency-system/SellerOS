import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retryTransient, isTransientNetworkError, networkErrorCode, DEFAULT_RETRY_DELAYS_MS } from './retry.mjs'

// Bentuk galat fetch bawaan Node (undici): TypeError "fetch failed" + sebab di .cause.
const fetchFailed = (code) => {
  const cause = new Error(`connect ${code}`); cause.code = code
  return new TypeError('fetch failed', { cause })
}

test('jeda default = 2s/5s/15s (maks 4 percobaan, tunggu terburuk 22 dtk)', () => {
  assert.deepEqual(DEFAULT_RETRY_DELAYS_MS, [2000, 5000, 15000])
})

test('isTransientNetworkError: fetch failed & kode jaringan (juga bersarang di cause / AggregateError)', () => {
  assert.equal(isTransientNetworkError(new TypeError('fetch failed')), true)
  for (const code of ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET']) {
    assert.equal(isTransientNetworkError(fetchFailed(code)), true, code)
    assert.equal(networkErrorCode(fetchFailed(code)), code)
  }
  const plain = new Error('socket hang up'); plain.code = 'ECONNRESET'
  assert.equal(isTransientNetworkError(plain), true)
  // Happy-eyeballs: cause = AggregateError berisi galat per alamat.
  const a = new Error('x'); a.code = 'ETIMEDOUT'
  const agg = new TypeError('fetch failed', { cause: new AggregateError([new Error('y'), a], 'semua alamat gagal') })
  assert.equal(isTransientNetworkError(agg), true)
  assert.equal(networkErrorCode(agg), 'ETIMEDOUT')
})

test('isTransientNetworkError: bug kode & galat biasa BUKAN transien', () => {
  assert.equal(isTransientNetworkError(new TypeError("Cannot read properties of undefined (reading 'x')")), false)
  assert.equal(isTransientNetworkError(new Error('invalid_grant')), false)
  assert.equal(isTransientNetworkError(null), false)
  assert.equal(isTransientNetworkError('fetch failed'), false)
  assert.equal(networkErrorCode(new Error('apa saja')), null)
  // cause melingkar tak boleh membuat loop tak berujung
  const loop = new Error('a'); loop.cause = loop
  assert.equal(isTransientNetworkError(loop), false)
})

test('retryTransient: transien → sukses di percobaan ke-2, tidur sesuai jeda pertama', async () => {
  const slept = [], seen = []
  let n = 0
  const out = await retryTransient(async (attempt) => {
    n++
    if (attempt === 1) throw fetchFailed('ECONNRESET')
    return 'ok'
  }, { sleepImpl: async (ms) => { slept.push(ms) }, onAttemptFailed: (i) => seen.push(i) })
  assert.deepEqual(out, { value: 'ok', attempts: 2 })
  assert.equal(n, 2)
  assert.deepEqual(slept, [2000])
  assert.equal(seen.length, 1)
  assert.deepEqual(
    { attempt: seen[0].attempt, maxAttempts: seen[0].maxAttempts, transient: seen[0].transient, willRetry: seen[0].willRetry, retryInMs: seen[0].retryInMs },
    { attempt: 1, maxAttempts: 4, transient: true, willRetry: true, retryInMs: 2000 },
  )
})

test('retryTransient: non-transien → TIDAK diulang, galat diberi attempts=1 & transient=false', async () => {
  const slept = [], seen = []
  let n = 0
  const err = new Error('ditolak server')
  await assert.rejects(
    () => retryTransient(async () => { n++; throw err }, { sleepImpl: async (ms) => { slept.push(ms) }, onAttemptFailed: (i) => seen.push(i) }),
    (e) => e === err && e.attempts === 1 && e.transient === false,
  )
  assert.equal(n, 1)
  assert.deepEqual(slept, [])
  assert.equal(seen.length, 1)
  assert.equal(seen[0].willRetry, false)
  assert.equal(seen[0].retryInMs, null)
})

test('retryTransient: transien terus → 4 percobaan, jeda 2s/5s/15s, lalu menyerah (attempts=4)', async () => {
  const slept = [], seen = []
  let n = 0
  await assert.rejects(
    () => retryTransient(async () => { n++; throw fetchFailed('ETIMEDOUT') }, { sleepImpl: async (ms) => { slept.push(ms) }, onAttemptFailed: (i) => seen.push(i) }),
    (e) => e.attempts === 4 && e.transient === true && e.message === 'fetch failed',
  )
  assert.equal(n, 4)
  assert.deepEqual(slept, [2000, 5000, 15000])
  assert.deepEqual(seen.map(s => s.willRetry), [true, true, true, false]) // tiap percobaan tercatat, termasuk yang terakhir
})

test('retryTransient: delaysMs [] = sekali tembak (perilaku lama)', async () => {
  let n = 0
  await assert.rejects(() => retryTransient(async () => { n++; throw fetchFailed('ECONNRESET') }, { delaysMs: [], sleepImpl: async () => { throw new Error('tak boleh tidur') } }))
  assert.equal(n, 1)
})
