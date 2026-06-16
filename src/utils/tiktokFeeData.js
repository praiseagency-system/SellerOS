// TikTok Shop by Tokopedia — biaya per kategori produk. Berlaku mulai 18 Mei 2026,
// sudah termasuk pajak. Dihitung dari (Harga − Diskon Penjual) × rate.
//
// DUA fee komisi yang TERPISAH & sama-sama dipotong:
//   1. dinamis  = Biaya Komisi Dinamis (rate tunggal per kategori, cap Rp650.000/item)
//   2. platform = Biaya Platform / Platform Commission Fee (beda Marketplace vs Mall,
//                 dengan penghematan GMV Max & Growth Xtra) — array 4 skenario:
//        [0] std    = Standar (tanpa GMV Max ≥3%, tanpa Growth Xtra)
//        [1] gmvmax = GMV Max ≥3% (penghematan tingkat toko)
//        [2] gxp    = Growth Xtra / GXP (penghematan tingkat toko)
//        [3] dual   = GMV Max ≥3% + Growth Xtra (dual-stacked, hemat maksimal)
//
// Sumber: tabel resmi TikTok (PDF Platform Commission + artikel Komisi Dinamis).
// Rate = agregat (modus) per kategori — estimasi indikatif; pakai override manual utk presisi.

export const TIKTOK_FEE_DATA = [
  {
    id: 'auto-elektronik', label: 'Otomotif & Elektronik', gxpFee: 2.5,
    subs: [
      { label: 'Telepon & Elektronik',        dinamis: 3.0, mkt: [10.00, 9.81, 9.63, 9.50], mall: [11.70, 11.51, 11.33, 11.20] },
      { label: 'Komputer & Peralatan Kantor',  dinamis: 4.0, mkt: [4.75, 4.63, 4.35, 4.25],  mall: [3.00, 2.88, 2.60, 2.50] },
      { label: 'Mobil & Sepeda Motor',         dinamis: 7.5, mkt: [9.25, 8.41, 7.63, 7.38],  mall: [11.45, 10.61, 10.08, 9.83] },
      { label: 'Peralatan Rumah Tangga',       dinamis: 6.0, mkt: [7.50, 6.02, 4.41, 4.13],  mall: [6.95, 5.47, 3.86, 3.58] },
      { label: 'Kesehatan',                    dinamis: 6.5, mkt: [7.50, 7.50, 7.50, 7.50],  mall: [6.00, 6.00, 6.00, 6.00] },
      { label: 'Barang Bekas Pakai',           dinamis: 4.0, mkt: [2.50, 2.50, 2.50, 2.50],  mall: [2.50, 2.50, 2.50, 2.50] },
    ],
  },
  {
    id: 'digital', label: 'Produk Digital', gxpFee: 2.0,
    subs: [
      { label: 'Pemesanan, Voucher & Produk Virtual', dinamis: 6.0, mkt: [9.50, 8.10, 6.00, 5.50], mall: [4.50, 3.10, 1.00, 0.50] },
    ],
  },
  {
    id: 'fashion', label: 'Fashion', gxpFee: 3.5,
    subs: [
      { label: 'Aksesoris Fashion',            dinamis: 7.5, mkt: [10.00, 8.11, 5.98, 5.31], mall: [11.70, 10.12, 8.00, 7.44] },
      { label: 'Aksesori Perhiasan & Turunannya', dinamis: 4.5, mkt: [4.75, 4.40, 3.88, 3.75], mall: [3.70, 3.35, 2.83, 2.70] },
      { label: 'Fashion Muslim',               dinamis: 8.0, mkt: [9.25, 7.24, 5.85, 5.50],  mall: [10.95, 8.94, 7.55, 7.20] },
      { label: 'Koper & Tas',                  dinamis: 8.0, mkt: [10.00, 8.25, 6.13, 5.50], mall: [11.70, 9.95, 7.83, 7.20] },
      { label: 'Olahraga & Outdoor',           dinamis: 6.5, mkt: [10.00, 9.65, 7.63, 7.50], mall: [12.20, 11.85, 9.83, 9.70] },
      { label: 'Pakaian & Pakaian Dalam Pria', dinamis: 8.0, mkt: [9.25, 7.15, 5.75, 5.00],  mall: [10.95, 8.85, 7.45, 6.00] },
      { label: 'Pakaian & Pakaian Dalam Wanita', dinamis: 8.0, mkt: [9.25, 7.10, 5.62, 4.93], mall: [10.95, 8.80, 7.32, 6.63] },
      { label: 'Fashion Bekas Pakai',          dinamis: 4.0, mkt: [10.00, 10.00, 8.00, 8.00], mall: [11.70, 11.70, 9.70, 9.70] },
    ],
  },
  {
    id: 'fmcg', label: 'FMCG', gxpFee: 3.5,
    subs: [
      { label: 'Makanan & Minuman',           dinamis: 6.5, mkt: [7.75, 6.70, 4.63, 4.25],  mall: [11.70, 10.65, 8.58, 8.20] },
      { label: 'Perawatan & Kecantikan',      dinamis: 7.0, mkt: [9.25, 7.15, 5.75, 5.00],  mall: [10.95, 8.85, 7.45, 6.70] },
      { label: 'Bayi & Persalinan',           dinamis: 7.0, mkt: [9.25, 7.15, 5.75, 5.00],  mall: [10.95, 8.85, 7.45, 6.70] },
      { label: 'Kesehatan',                   dinamis: 6.5, mkt: [7.50, 5.75, 5.63, 5.00],  mall: [6.20, 4.45, 4.33, 3.70] },
      { label: 'Fashion Anak',                dinamis: 7.0, mkt: [10.00, 7.35, 5.16, 4.21], mall: [11.70, 5.10, 4.95, 4.20] },
    ],
  },
  {
    id: 'lifestyle', label: 'Lifestyle', gxpFee: 3.5,
    subs: [
      { label: 'Olahraga & Outdoor',          dinamis: 6.5, mkt: [10.00, 9.65, 7.63, 7.50], mall: [12.20, 11.85, 9.83, 9.70] },
      { label: 'Perlengkapan Rumah',          dinamis: 8.0, mkt: [10.00, 8.60, 6.50, 6.00], mall: [12.20, 10.80, 8.70, 8.20] },
      { label: 'Buku, Majalah & Audio',       dinamis: 8.0, mkt: [10.00, 7.90, 5.75, 5.00], mall: [8.20, 6.10, 3.95, 3.20] },
      { label: 'Peralatan Dapur',             dinamis: 8.0, mkt: [10.00, 9.65, 7.63, 6.00], mall: [12.20, 10.80, 8.70, 8.20] },
      { label: 'Perbaikan Rumah',             dinamis: 7.5, mkt: [10.00, 8.60, 6.50, 6.00], mall: [12.20, 10.80, 8.70, 8.20] },
      { label: 'Alat & Perangkat Keras',      dinamis: 7.0, mkt: [10.00, 8.95, 6.88, 6.50], mall: [12.20, 11.15, 9.08, 8.70] },
      { label: 'Furnitur',                    dinamis: 6.5, mkt: [10.00, 7.90, 5.75, 5.00], mall: [12.20, 11.15, 9.08, 8.70] },
      { label: 'Mainan & Hobi',               dinamis: 4.0, mkt: [9.50, 8.10, 6.00, 5.50],  mall: [9.20, 7.80, 5.70, 5.20] },
      { label: 'Perlengkapan Hewan Peliharaan', dinamis: 8.0, mkt: [9.50, 8.10, 6.00, 5.50], mall: [9.20, 7.80, 5.70, 5.20] },
      { label: 'Komputer & Peralatan Kantor', dinamis: 4.0, mkt: [8.00, 8.00, 5.25, 5.25],  mall: [9.20, 7.80, 5.70, 5.20] },
      { label: 'Tekstil & Soft Furnishing',   dinamis: 8.0, mkt: [10.00, 7.90, 5.75, 5.00], mall: [10.50, 8.40, 6.25, 5.50] },
      { label: 'Koleksi',                     dinamis: 6.5, mkt: [10.00, 8.95, 6.88, 6.50], mall: [12.20, 11.15, 9.08, 8.70] },
    ],
  },
]

export const TIKTOK_PROCESSING_FEE = 1250    // Biaya Pemrosesan Order, flat per pesanan (termasuk pajak)
export const TIKTOK_DINAMIS_CAP    = 650000  // Cap Biaya Komisi Dinamis per item (mulai 18 Mei 2026)
export const TIKTOK_GXP_CAP        = 20000   // Cap biaya layanan Growth Xtra per produk
export const TIKTOK_PREORDER_RATE  = 3       // Pre-order service fee (% per produk)

// Rate Biaya Platform sesuai tipe penjual & skenario penghematan
export function tiktokPlatformRate(sel, isMall, gmvMax, gxp) {
  if (!sel) return 0
  const arr = isMall ? sel.mall : sel.mkt
  const i = gmvMax && gxp ? 3 : gxp ? 2 : gmvMax ? 1 : 0
  return arr[i]
}
