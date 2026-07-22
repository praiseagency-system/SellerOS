// Helper dataset Store Performance — MURNI (tanpa I/O). Persistensi kini di
// Supabase (lihat src/data/storeDataset.js). Dataset = { files, lines }.
import { computeLogistics } from './storeAnalytics'

// Biaya logistik blended dari dataset toko (untuk Kalkulator & kartu Lokasi).
// LSF khusus TikTok Shop — hanya hitung dari order marketplace TikTok
// (exclude Shopee & Tokopedia). Mengembalikan null bila belum ada data TikTok.
export function blendedLogistics(store) {
  if (!store?.lines?.length) return null
  const lines = store.lines.filter(l => (l.m || '').toLowerCase().includes('tiktok'))
  if (!lines.length) return null
  const lsf = computeLogistics(lines)
  return lsf.hasData ? lsf : null
}

// Sidik jari satu baris = identitas SKU-dalam-pesanan. Dua baris dengan sidik
// jari sama = pesanan yang sama ter-import dua kali (file rentang tumpang-tindih).
export function lineFingerprint(l) {
  return `${l.o}|${l.kid || ''}|${l.k || ''}|${l.v || ''}|${l.q}|${l.r}|${l.t}`
}

// Buang baris duplikat persis (lintas file). Mempertahankan kemunculan pertama.
// Mengembalikan { lines, removed }.
export function dedupeLines(lines) {
  const seen = new Set()
  const out = []
  for (const l of lines) {
    const fp = lineFingerprint(l)
    if (seen.has(fp)) continue
    seen.add(fp)
    out.push(l)
  }
  return { lines: out, removed: lines.length - out.length }
}

// Gabungkan hasil ingest ke store (murni). File dengan nama sama menggantikan
// yang lama; baris duplikat persis (lintas file) digabung. Mengembalikan store baru.
export function mergeUpload(store, { fileName, source, months, lines }) {
  const files = store.files.filter(f => f.name !== fileName)
  const keptLines = store.lines.filter(l => l._f !== fileName)
  const tagged = lines.map(l => ({ ...l, _f: fileName }))
  const { lines: deduped } = dedupeLines([...keptLines, ...tagged])
  return {
    files: [...files, { name: fileName, source, months, count: lines.length, savedAt: new Date().toISOString() }],
    lines: deduped,
  }
}

// Buang satu file dari store (murni).
export function removeFileFrom(store, fileName) {
  return {
    files: store.files.filter(f => f.name !== fileName),
    lines: store.lines.filter(l => l._f !== fileName),
  }
}
