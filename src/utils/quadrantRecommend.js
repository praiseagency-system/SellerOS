// Mesin rekomendasi Prioritas.
//
// Aturan pokok: dua produk di kuadran yang sama TIDAK boleh dapat saran yang
// sama kalau bocornya di tahap berbeda. Kuadran menentukan kelas masalah,
// tahap funnel terlemah menentukan isi tindakannya.
//
// Semua saran di sini adalah hipotesis yang harus diperiksa manusia — kata
// kerjanya sengaja "audit / periksa / evaluasi", bukan klaim sebab-akibat.

import { STAGE, weakestStage } from './quadrantScoring'

export const PROBLEM = {
  DISCOVERY: 'discovery',       // orang tak mengklik
  PDP: 'pdp',                   // mengklik tapi tak masuk keranjang
  CHECKOUT: 'checkout',         // masuk keranjang tapi tak bayar
  TRAFFIC: 'traffic',           // konversi bagus, traffic kurang
  SCALE: 'scale',               // sehat, tinggal diperbesar
  VALIDATE: 'validate',         // sampel belum cukup
  REVIEW: 'review',             // lemah menyeluruh
}

const R = (category, stage, diagnosis, actions) => ({ category, stage, diagnosis, actions })

// Tinggi/rendah relatif median periode ini, bukan angka mutlak.
function rel(value, mid) {
  if (value == null || mid == null || !(mid > 0)) return null
  return value / mid
}

export function recommendFor(product, ctx = {}) {
  const { medians = {}, confidence = null } = ctx
  const q = product?.quadrant
  const weak = weakestStage(product, medians)
  const ctrRel = rel(product.ctrBlended ?? product.ctr, medians.ctr)
  const atcRel = rel(product.atcRate, medians.atcRate)
  const crRel = rel(product.conversionRate, medians.conversionRate)

  // Sampel terlalu kecil → jangan menyimpulkan produknya jelek.
  if (confidence && !confidence.sufficient) {
    return R(PROBLEM.VALIDATE, null,
      'Sampel belum cukup untuk menilai performa produk ini.',
      [
        'Tambah traffic uji terbatas sampai sampel memadai',
        'Jangan hentikan produk berdasarkan periode ini saja',
        confidence.reasons[0] ? `Penyebab: ${confidence.reasons[0]}` : null,
      ].filter(Boolean))
  }

  // ── Q3: High Traffic – Low Conversion ──
  if (q === 3) {
    if (ctrRel != null && ctrRel < 0.8) {
      return R(PROBLEM.DISCOVERY, STAGE.CLICK,
        'Traffic besar tapi sedikit yang mengklik — masalahnya di etalase, bukan di halaman produk.',
        ['Audit thumbnail utama', 'Perbaiki judul & keyword', 'Evaluasi sumber traffic (relevansi audiens)',
          'Audit creative iklan', 'Bandingkan CTR dengan produk sejenis'])
    }
    if (atcRel != null && atcRel < 0.8) {
      return R(PROBLEM.PDP, STAGE.ATC,
        'Orang mengklik tapi sedikit yang memasukkan ke keranjang — halaman produk belum meyakinkan.',
        ['Perbaiki gambar pertama', 'Perjelas USP & benefit', 'Evaluasi harga terhadap pesaing',
          'Tingkatkan social proof (ulasan & rating)', 'Periksa varian terlaris tersedia'])
    }
    // ATC sehat tapi konversi rendah → macet di checkout.
    if (atcRel != null && atcRel >= 0.9 && crRel != null && crRel < 0.9) {
      return R(PROBLEM.CHECKOUT, STAGE.BUYER,
        'Keranjang terisi tapi tak dibayar — hambatannya setelah keranjang.',
        ['Periksa ongkir', 'Evaluasi voucher checkout', 'Audit harga setelah voucher',
          'Periksa stok varian utama', 'Periksa estimasi pengiriman', 'Periksa metode pembayaran'])
    }
    return R(PROBLEM.PDP, weak?.key ?? STAGE.ATC,
      'Konversi di bawah ambang meski traffic besar.',
      ['Audit halaman produk menyeluruh', 'Evaluasi harga & voucher', 'Periksa ulasan terbaru'])
  }

  // ── Q2: Low Traffic – High Conversion ──
  if (q === 2) {
    return R(PROBLEM.TRAFFIC, STAGE.CLICK,
      'Konversi sudah bagus, yang kurang hanya jumlah orang yang melihat.',
      ['Tambah traffic bertahap, jangan sekaligus', 'Tambah budget iklan',
        'Masukkan ke campaign berjalan', 'Aktifkan dorongan affiliate', 'Optimalkan SEO judul & kata kunci',
        'Pantau konversi agar tak turun saat traffic naik'])
  }

  // ── Q1: High Traffic – High Conversion ──
  if (q === 1) {
    return R(PROBLEM.SCALE, null,
      'Traffic dan konversi sama-sama sehat — ini kandidat produk andalan.',
      ['Scale bertahap', 'Jaga ketersediaan stok', 'Pertahankan harga & voucher yang sedang jalan',
        'Perbesar eksposur affiliate', 'Pantau konversi agar tak tergerus saat volume naik'])
  }

  // ── Q4: Low Traffic – Low Conversion (sampel sudah cukup) ──
  return R(PROBLEM.REVIEW, weak?.key ?? null,
    'Traffic dan konversi sama-sama di bawah ambang, dan sampelnya sudah cukup untuk dinilai.',
    ['Evaluasi positioning & target audiens', 'Evaluasi harga', 'Periksa apakah permintaannya memang tipis',
      'Batasi budget sampai ada validasi baru', 'Pertimbangkan penghentian kalau tren tetap'])
}

export const PROBLEM_LABEL = {
  [PROBLEM.DISCOVERY]: 'Penemuan (klik)',
  [PROBLEM.PDP]: 'Halaman produk',
  [PROBLEM.CHECKOUT]: 'Checkout',
  [PROBLEM.TRAFFIC]: 'Kurang traffic',
  [PROBLEM.SCALE]: 'Siap di-scale',
  [PROBLEM.VALIDATE]: 'Perlu validasi',
  [PROBLEM.REVIEW]: 'Perlu evaluasi',
}
