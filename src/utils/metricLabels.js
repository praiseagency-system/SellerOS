// Teks penjelas untuk penanda metrik. Dipisah dari komponen supaya file
// komponen hanya mengekspor komponen (syarat fast refresh).
import { FLAG } from './blendMetrics'
import { MAPPING_STATUS } from './canonicalProduct'

export const FLAG_LABEL = {
  [FLAG.ORDER_FALLBACK]: 'Konversi memakai jumlah pesanan karena data pembeli tak tersedia',
  [FLAG.ATC_INCOMPATIBLE]: 'ATC tak digabung — satuannya beda antar-marketplace',
  [FLAG.ATC_QUANTITY_ONLY]: 'Salah satu marketplace hanya melaporkan kuantitas ATC, bukan pengguna',
  [FLAG.TRAFFIC_FALLBACK]: 'Traffic memakai kunjungan/klik produk karena klik unik tak tersedia',
  [FLAG.TRAFFIC_PARTIAL]: 'Traffic hanya tersedia di sebagian marketplace',
  [FLAG.GMV_BASIS_MIXED]: 'Basis transaksi berbeda (pesanan dibuat vs dibayar) — tak sebanding penuh',
  [FLAG.CTR_INCOMPATIBLE]: 'CTR tak digabung — definisi impresi berbeda antar-marketplace',
  [FLAG.ROAS_INCOMPLETE]: 'ROAS gabungan kosong karena biaya iklan tak lengkap',
  [FLAG.NO_TRAFFIC]: 'Traffic nol pada periode ini — konversi tak bisa dihitung',
}

export const STATUS_BADGE = {
  [MAPPING_STATUS.VERIFIED]: { label: 'Digabung · terverifikasi', cls: 'bg-green-500/12 text-green-300' },
  [MAPPING_STATUS.AUTO]: { label: 'Digabung · otomatis', cls: 'bg-blue-600/15 text-blue-300' },
  [MAPPING_STATUS.REVIEW]: { label: 'Perlu review', cls: 'bg-amber-500/12 text-amber-300' },
}


// ── Label kanonik + tooltip nama asli marketplace ───────────────────────────
// Satu istilah untuk kedua marketplace di seluruh UI; nama kolom asli hanya
// muncul di tooltip. Sumber kebenaran label: CANONICAL di metricSchema.
export const METRIC_TOOLTIP = {
  qualifiedTraffic: 'Shopee: Pengunjung Produk (Kunjungan)\nTikTok: Klik Unik\n\nSellerOS menggunakan keduanya sebagai indikator pengguna yang telah menunjukkan intent terhadap produk.',
  impressions: 'Shopee: Jumlah Produk Dilihat\nTikTok: Tayangan',
  uniqueViewers: 'Shopee: Produk Unik Dilihat\nTikTok: Penonton',
  clicks: 'Shopee: Produk Diklik\nTikTok: Klik',
  uniqueClicks: 'Shopee: Produk Unik Diklik\nTikTok: Klik Unik\n\nJumlah pengguna unik yang mengklik produk.',
  atcUsers: 'Shopee: Pengunjung Produk (Menambahkan Produk ke Keranjang)\nTikTok: Pengguna yang Menambahkan Produk ke Keranjang',
  buyers: 'Shopee: Total Pembeli (Pesanan Dibuat)\nTikTok: Pembeli',
  orders: 'Shopee: Pesanan Dibuat\nTikTok: Pesanan SKU\n\nKeduanya diperlakukan sebagai Pesanan (keputusan product owner).',
  gmv: 'Shopee: Total Penjualan (Pesanan Dibuat) (IDR) — basis pesanan dibuat\nTikTok: GMV (Rp) — basis pesanan dibayar',
  uniqueCtr: 'Pengklik Unik ÷ Pengguna Melihat — dihitung ulang dari cacah, bukan rate bawaan file.',
  atcRate: 'Pengguna Tambah Keranjang ÷ Traffic Produk',
  conversionRate: 'Pembeli ÷ Traffic Produk — bukan pesanan ÷ klik seperti rate bawaan Shopee.',
  checkoutRate: 'Pembeli ÷ Pengguna Tambah Keranjang',
  orderRate: 'Pesanan ÷ Traffic Produk',
  ordersPerBuyer: 'Pesanan ÷ Pembeli — satu pembeli bisa membuat lebih dari satu pesanan.',
}

export const IMPORT_STATUS_BADGE = {
  observed: { label: 'Observed', cls: 'bg-green-500/12 text-green-300' },
  calculated: { label: 'Calculated', cls: 'bg-blue-600/15 text-blue-300' },
  estimated: { label: 'Estimated', cls: 'bg-amber-500/12 text-amber-300' },
  fallback: { label: 'Fallback', cls: 'bg-amber-500/12 text-amber-300' },
  missing: { label: 'Missing', cls: 'bg-gray-600/20 text-gray-400' },
  incompatible: { label: 'Incompatible', cls: 'bg-red-500/12 text-red-300' },
  ambiguous: { label: 'Ambiguous', cls: 'bg-red-500/12 text-red-300' },
  unused: { label: 'Tidak Digunakan', cls: 'bg-gray-600/20 text-gray-400' },
}
