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

// Gabungkan hasil ingest ke store (murni). File dengan nama sama menggantikan
// yang lama. Mengembalikan store baru.
export function mergeUpload(store, { fileName, source, months, lines }) {
  const files = store.files.filter(f => f.name !== fileName)
  const keptLines = store.lines.filter(l => l._f !== fileName)
  const tagged = lines.map(l => ({ ...l, _f: fileName }))
  return {
    files: [...files, { name: fileName, source, months, count: lines.length, savedAt: new Date().toISOString() }],
    lines: [...keptLines, ...tagged],
  }
}

// Buang satu file dari store (murni).
export function removeFileFrom(store, fileName) {
  return {
    files: store.files.filter(f => f.name !== fileName),
    lines: store.lines.filter(l => l._f !== fileName),
  }
}
