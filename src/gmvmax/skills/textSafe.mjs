// GMV Max skills — safe display-text helpers (pure, deterministic, no I/O).
//
// TikTok affiliate/creator/campaign names arrive as free-form Unicode and are
// often "styled": mathematical-alphanumeric glyphs (𝐘𝐮…), stacked combining
// marks (Zalgo-style niqqud), and decorative astral pictographs from rare/ancient
// scripts. Rendered verbatim in Indonesian copy they show as mojibake. This folds
// styled letters back to plain text, drops unrenderable decoration, and returns a
// fallback when nothing renderable remains. The RAW value is kept elsewhere for
// identity/aggregation — this is for DISPLAY strings only.

// Renderable display code points we keep: the common "real" scripts an Indonesian
// seller's affiliates actually use, plus digits, punctuation, spaces, a few safe
// symbols, and emoji. Everything else (combining marks, format/control/private-use,
// rare/ancient/decorative letters that survive NFKC) is dropped.
// \u{FE0F} (emoji variation selector) and \u{200D} (ZWJ) are kept so color emoji
// and compound emoji sequences (e.g. 🛍️, 👨‍👩‍👧) survive intact.
const KEEP = /[\p{sc=Latin}\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\p{sc=Thai}\p{sc=Arabic}\p{N}\p{P}\p{Zs}\p{Extended_Pictographic}\u{FE0F}\u{200D}$@#%&*+=<>|/\\^~`]/u

// Normalize a user/affiliate/creative display name into plain renderable text.
// Never throws; returns `fallback` when the input is empty/unrenderable.
export function sanitizeDisplayName(raw, fallback = '(nama tak terbaca)') {
  if (raw == null) return fallback
  let s = String(raw)
  // Fold styled math-alphanumerics & compatibility glyphs to plain letters (𝐘→Y).
  try { s = s.normalize('NFKC') } catch { /* leave as-is on bad input */ }
  // Keep only renderable code points (iterates by code point, so astral-plane
  // characters are handled whole, not split into broken surrogate halves).
  s = [...s].filter((ch) => KEEP.test(ch)).join('')
  // Collapse whitespace runs left behind by dropped characters.
  s = s.replace(/\s+/g, ' ').trim()
  return s.length ? s : fallback
}
