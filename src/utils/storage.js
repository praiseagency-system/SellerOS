// Helper sesi MURNI (tanpa I/O). Persistensi periode/produk kini di Supabase
// (lihat src/data/periods.js). File ini hanya: bentuk-ulang produk, pilih
// periode pembanding, dan export/import sesi sebagai file .json.

// Padatkan produk untuk disimpan (buang delta perbandingan, simpan data inti).
export function compactProduct(p) {
  return {
    kode_produk:    p.kode_produk,
    nama_produk:    p.nama_produk,
    pengunjung:     p.pengunjung,
    conversion_rate: p.conversion_rate,
    atc_rate:       p.atc_rate,
    total_penjualan: p.total_penjualan,
    pesanan:        p.pesanan,
    roas:           p.roas ?? null,
    stok:           p.stok ?? null,
    harga:          p.harga ?? null,
    quadrant:       p.quadrant,
  }
}

// Pilih "periode sebelumnya" untuk perbandingan, dari daftar sesi yang sudah
// dimuat. Prioritas: periode kronologis terdekat yang lebih awal (by periodValue,
// mis. "2026-05"); fallback ke sesi terbaru dengan periode berbeda.
export function pickPreviousSession(sessions, platform, periodValue) {
  const same = sessions.filter(s => s.platform === platform)
  if (periodValue) {
    const earlier = same
      .filter(s => s.periodValue && s.periodValue < periodValue)
      .sort((a, b) => (a.periodValue < b.periodValue ? 1 : -1))
    if (earlier.length) return earlier[0]
  }
  return same.find(s => s.periodValue !== periodValue) || null
}

// Unduh sesi sebagai file .json (untuk pindah data antar akun/perangkat).
export function exportSession(session) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kuadran_${session.platform}_${String(session.label).replace(/\s+/g, '_')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Baca & validasi file .json sesi (dipakai sebelum disimpan ke Supabase).
export async function parseImportedSession(file) {
  const text = await file.text()
  const session = JSON.parse(text)
  if (!session.products || !session.platform || !session.label)
    throw new Error('Format file tidak valid.')
  return session
}
