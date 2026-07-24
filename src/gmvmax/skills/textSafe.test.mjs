import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeDisplayName } from './textSafe.mjs'

test('plain ASCII names pass through unchanged', () => {
  assert.equal(sanitizeDisplayName('AffA'), 'AffA')
  assert.equal(sanitizeDisplayName('toko.jaya_88'), 'toko.jaya_88')
  assert.equal(sanitizeDisplayName('@creator official'), '@creator official')
})

test('folds styled math-alphanumeric glyphs to plain letters', () => {
  // 𝐘𝐮𝐤𝐢 (MATHEMATICAL BOLD) → Yuki
  assert.equal(sanitizeDisplayName('\u{1D418}\u{1D42E}\u{1D424}\u{1D422}'), 'Yuki')
})

test('strips combining marks (Zalgo/niqqud) and decorative astral letters', () => {
  // The real garbled affiliate name observed in prod (Cypriot/Parthian letters +
  // Mongolian + math-bold Y + combining Hebrew points) → Latin core only.
  const garbled = '\u{10658}\u{1D418}\u{18A3}\u{1076A9}u ִֶָ'
  const out = sanitizeDisplayName(garbled)
  assert.ok(!/[\u{10000}-\u{10FFF}]/u.test(out), 'no ancient-script astral letters remain')
  assert.ok(!/\p{M}/u.test(out), 'no combining marks remain')
  assert.equal(out, 'Yu')
})

test('keeps common real scripts and emoji', () => {
  assert.equal(sanitizeDisplayName('田中さん'), '田中さん')
  assert.equal(sanitizeDisplayName('toko 🔥'), 'toko 🔥')
})

test('returns fallback when nothing renderable remains', () => {
  assert.equal(sanitizeDisplayName('ִֶָ'), '(nama tak terbaca)')
  assert.equal(sanitizeDisplayName(''), '(nama tak terbaca)')
  assert.equal(sanitizeDisplayName(null), '(nama tak terbaca)')
  assert.equal(sanitizeDisplayName('   '), '(nama tak terbaca)')
})

test('custom fallback honored', () => {
  assert.equal(sanitizeDisplayName(null, 'afiliasi'), 'afiliasi')
})
