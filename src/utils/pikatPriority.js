// Prioritas ikat kode dari Pikat (M1, 29 Sep 2026) — murni, supaya aturannya teruji.
// Tujuannya menjawab "video mana yang paling rugi kalau izinnya hilang?":
//   Tinggi  = sudah menghasilkan uang (GMV organik / omzet iklan dengan ROAS sehat)
//   Sedang  = ada sinyal minat (views / ER tinggi / penjualan kecil) tapi belum terbukti
//   Rendah  = belum ada sinyal
// ROAS dari belanja < MIN_SPEND tak dipercaya: Rp 4 belanja bisa menghasilkan "ROAS 0"
// atau "ROAS 2000x" tanpa arti apa pun.

export const MIN_SPEND = 5000
export const GMV_TINGGI = 100000
export const ROAS_SEHAT = 5
export const VIEWS_SEDANG = 10000
export const ER_SEDANG = 3

export function engagementRate(r) {
  if (!r?.views || (r.likes == null && r.comments == null && r.shares == null)) return null
  return (((r.likes || 0) + (r.comments || 0) + (r.shares || 0)) / r.views) * 100
}

/** ROAS yang layak ditampilkan; null bila belanja terlalu kecil untuk berarti. */
export function roasTerpercaya(ads) {
  if (!ads || !(ads.cost >= MIN_SPEND)) return null
  return ads.revenue / ads.cost
}

const RP = (n) => n >= 1e6 ? `Rp ${(n / 1e6).toFixed(1).replace('.', ',')} jt` : `Rp ${Math.round(n / 1e3)} rb`

export function prioritasIkat(row, ads) {
  const gmv = Number(row?.gmv_organic) || 0
  const omzet = ads?.revenue || 0
  const roas = roasTerpercaya(ads)
  const er = engagementRate(row)
  const views = row?.views || 0

  if (gmv >= GMV_TINGGI && roas != null && roas >= ROAS_SEHAT) {
    return { level: 'tinggi', rank: 0, alasan: `jualan organik ${RP(gmv)} + ROAS iklan ${roas.toFixed(1).replace('.', ',')}` }
  }
  if (gmv >= GMV_TINGGI) return { level: 'tinggi', rank: 0, alasan: `jualan organik ${RP(gmv)}` }
  if (roas != null && roas >= ROAS_SEHAT) return { level: 'tinggi', rank: 0, alasan: `ROAS iklan ${roas.toFixed(1).replace('.', ',')} lewat izin afiliasi` }
  if (omzet >= GMV_TINGGI) return { level: 'tinggi', rank: 0, alasan: `omzet iklan ${RP(omzet)} 7 hari` }

  if (gmv > 0 || omzet > 0) return { level: 'sedang', rank: 1, alasan: 'sudah ada penjualan, masih kecil' }
  if (views >= VIEWS_SEDANG) return { level: 'sedang', rank: 1, alasan: 'views tinggi, belum ada penjualan' }
  if (er != null && er >= ER_SEDANG && views >= 1000) return { level: 'sedang', rank: 1, alasan: 'engagement tinggi, belum ada penjualan' }

  return { level: 'rendah', rank: 2, alasan: views < 1000 ? 'masih baru, belum ada sinyal' : 'belum ada sinyal penjualan' }
}

/** Urutan tampilan: prioritas, lalu uang yang dihasilkan, lalu views. */
export function bandingPrioritas(a, b) {
  return a.p.rank - b.p.rank
    || ((Number(b.row.gmv_organic) || 0) + (b.ads?.revenue || 0)) - ((Number(a.row.gmv_organic) || 0) + (a.ads?.revenue || 0))
    || (b.row.views || 0) - (a.row.views || 0)
}

export const STATUS_TAYANG = {
  DELIVERING: 'Tayang', LEARNING: 'Learning', IN_QUEUE: 'Antre', NOT_DELIVERYING: 'Tak tayang',
  NOT_DELIVERING: 'Tak tayang', AUTHORIZATION_NEEDED: 'Butuh izin', NOT_ACTIVE: 'Nonaktif',
  EXCLUDED: 'Dikeluarkan', UNAVAILABLE: 'Tak tersedia', REJECTED: 'Ditolak',
}
