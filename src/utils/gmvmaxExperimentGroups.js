// Pengelompokan daftar eksperimen di tab Bukti & Riwayat: ubin ringkasan per
// jenis + ubin "Perlu ditutup", masing-masing dengan sebaran vonisnya.
//
// Kenapa ada: "Kode spark dipasang" tercatat otomatis untuk tiap video, jadi
// puluhan kartunya menenggelamkan catatan boost manual. Ubin = saringan sekaligus
// ringkasan, supaya satu jenis bisa dilihat sendirian.
//
// Murni (tanpa React/Supabase). `items` = [{ exp, conclusion, alerts }] — vonis
// dan peringatan dihitung pemanggil (liveConclusion / experimentAlerts), bukan
// di sini, supaya berkas ini tak ikut menentukan aturan vonis.

export const ALL = 'ALL'
export const CLOSE = 'CLOSE'
const TYPE = 'TYPE:'

const BUCKET = {
  SUSTAINABLE_WINNER: 'win', WINNER_CANDIDATE: 'win',
  TEMPORARY_SPIKE: 'spike',
  WEAK: 'weak',
}
// Selain tiga di atas (belum konklusif, data kurang, dihentikan) = belum ada vonis.
export const verdictBucket = (conclusion) => BUCKET[conclusion] || 'none'

export function summarize(items = []) {
  const s = { total: items.length, win: 0, spike: 0, weak: 0, none: 0 }
  for (const it of items) s[verdictBucket(it.conclusion)]++
  return s
}

export const typeKey = (experimentType) => TYPE + experimentType
const needsClose = (it) => (it.alerts?.length || 0) > 0

export function applyFilter(items = [], key = ALL) {
  if (key === CLOSE) return items.filter(needsClose)
  if (key.startsWith(TYPE)) return items.filter(it => it.exp.experiment_type === key.slice(TYPE.length))
  return items
}

// Ubin: Semua → tiap jenis yang ADA barisnya (terbanyak dulu) → Perlu ditutup.
// Jenis tanpa baris tak dibuatkan ubin; "Perlu ditutup" hilang bila nol.
export function buildTiles(items = []) {
  const byType = new Map()
  for (const it of items) {
    const t = it.exp.experiment_type
    if (!byType.has(t)) byType.set(t, [])
    byType.get(t).push(it)
  }
  const tiles = [{ key: ALL, ...summarize(items) }]
  const types = [...byType.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [t, list] of types) tiles.push({ key: typeKey(t), type: t, ...summarize(list) })
  const close = items.filter(needsClose)
  if (close.length) tiles.push({ key: CLOSE, ...summarize(close) })
  return tiles
}

// Saringan yang tersimpan bisa menunjuk ubin yang sudah tak ada (jenis terakhir
// dihapus, semua peringatan ditutup) — jatuh ke Semua, jangan daftar kosong.
export const resolveFilter = (tiles, key) => (tiles.some(t => t.key === key) ? key : ALL)
