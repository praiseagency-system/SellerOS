import { test } from 'node:test'
import assert from 'node:assert/strict'
import { productTableExists } from './writer.mjs'

// Klien Supabase palsu: merekam opsi select yang dipakai dan membalas sesuai skenario.
function fakeSb(reply, seen = {}) {
  return { from: table => ({ select: (cols, opts) => { seen.table = table; seen.opts = opts; return { limit: async () => reply } } }) }
}

test('tabel ada → true', async () => {
  assert.equal(await productTableExists(fakeSb({ data: [], error: null, status: 200 })), true)
})

test('tabel belum ada (PGRST205/404) → false', async () => {
  const reply = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.gmvmax_product_daily' in the schema cache" }, status: 404 }
  assert.equal(await productTableExists(fakeSb(reply)), false)
})

test('tidak memakai HEAD — HEAD ke tabel tak ada dibalas 204 tanpa error (insiden 15–16 Sep 2026)', async () => {
  const seen = {}
  await productTableExists(fakeSb({ data: null, error: null, status: 204 }, seen))
  assert.equal(seen.table, 'gmvmax_product_daily')
  assert.equal(seen.opts?.head, undefined)
})

test('klien melempar → false, bukan gagal', async () => {
  const sb = { from: () => { throw new Error('boom') } }
  assert.equal(await productTableExists(sb), false)
})
