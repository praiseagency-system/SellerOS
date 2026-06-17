// Pure perhitungan kalkulator — dipakai oleh CalculatorPage (live) maupun
// ProductsPage (menghitung metrik tiap produk tersimpan tanpa me-mount kalkulator).
import {
  TIKTOK_PROCESSING_FEE, TIKTOK_DINAMIS_CAP, TIKTOK_GXP_CAP, TIKTOK_PREORDER_RATE,
  tiktokPlatformRate,
} from './tiktokFeeData'

// Resolusi rate dari pilihan kategori / input manual
export function deriveRates(s) {
  const isTikTok = s.platform === 'tiktok'
  const isMall   = s.ttSeller === 'mall'
  const shopeeAdminRate = s.selectedCat ? s.selectedCat.fee : (+s.cAdminManual || 0)
  const shopeeGoxRate   = s.selectedGox ? s.selectedGox.fee : (+s.cGoxManual   || 0)
  const ttPlatformRate  = s.selectedTtCat
    ? tiktokPlatformRate(s.selectedTtCat, isMall, s.ttGmvMax, s.ttGxp)
    : (+s.ttKomisiManual || 0)
  const ttDinamisRate   = s.selectedTtCat ? s.selectedTtCat.dinamis : 0
  return { isTikTok, isMall, shopeeAdminRate, shopeeGoxRate, ttPlatformRate, ttDinamisRate }
}

// Hitung seluruh rincian biaya & profit. Mengembalikan null bila harga jual kosong.
export function computeCalc(s) {
  const { isTikTok, shopeeAdminRate, shopeeGoxRate, ttPlatformRate, ttDinamisRate } = deriveRates(s)

  const h  = +s.jual    || 0
  const m  = +s.hpp     || 0
  const ad = +s.adCost  || 0
  const v  = +s.voucher || 0
  const ok = +s.ongkir  || 0
  if (!h) return null

  const adminRate = isTikTok ? ttPlatformRate : shopeeAdminRate
  const trxRate   = 0
  const commRate  = isTikTok ? (+s.cComm || 0) : 0
  const goxRate   = isTikTok ? 0 : shopeeGoxRate

  const adminCut = h * adminRate / 100
  const trxCut   = 0
  const commCut  = h * commRate  / 100
  const goxCut   = h * goxRate   / 100

  const dinamisRate = isTikTok ? ttDinamisRate : 0
  const dinamisCut  = dinamisRate > 0 ? Math.min(h * dinamisRate / 100, TIKTOK_DINAMIS_CAP) : 0

  const pembayaranCut = (!isTikTok && s.sellerType === 'mall') ? Math.min(h * 1.8 / 100, 50000) : 0

  const promoRate    = (!isTikTok && s.promoXtraOn) ? 4.5 : 0
  const promoXtraCut = promoRate > 0 ? Math.min(h * promoRate / 100, 60000) : 0

  const liveRate    = (!isTikTok && s.liveXtraOn) ? (s.promoXtraOn ? 2 : 3) : 0
  const liveXtraCut = liveRate > 0 ? Math.min(h * liveRate / 100, 20000) : 0

  const gxpRate = (isTikTok && s.ttGxp && s.selectedTtCat) ? s.selectedTtCat.gxpFee : 0
  const gxpCut  = gxpRate > 0 ? Math.min(h * gxpRate / 100, TIKTOK_GXP_CAP) : 0

  const preOrderActive = (!isTikTok && s.preOrderOn) || (isTikTok && s.ttPreOrder)
  const preOrderCut    = preOrderActive ? h * TIKTOK_PREORDER_RATE / 100 : 0

  const biayaProsesCut = TIKTOK_PROCESSING_FEE

  const totalCut = adminCut + dinamisCut + trxCut + commCut + goxCut + pembayaranCut + promoXtraCut + liveXtraCut + gxpCut + preOrderCut + biayaProsesCut + v + ok
  const bersih   = h - totalCut
  const profit   = bersih - m - ad
  const margin   = (profit / h) * 100
  const rom      = m > 0 ? (profit / m) * 100 : null
  const roas     = ad > 0 ? h / ad : null

  const bepPctRate = adminRate + dinamisRate + trxRate + commRate + goxRate + promoRate + liveRate + gxpRate
                   + (preOrderActive ? TIKTOK_PREORDER_RATE : 0)
                   + ((!isTikTok && s.sellerType === 'mall') ? 1.8 : 0)
  const bepFlat  = biayaProsesCut
  const bepDenom = 1 - bepPctRate / 100
  const bep      = bepDenom > 0 ? (bepFlat + m + ad + v + ok) / bepDenom : null

  const profitNoAd = bersih - m
  const marginNoAd = h > 0 ? (profitNoAd / h) * 100 : 0
  const romNoAd    = m > 0 ? (profitNoAd / m) * 100 : null
  const roasBep    = profitNoAd > 0 ? Math.ceil((h / profitNoAd) * 10) / 10 : null

  return { h, m, ad, v, ok, adminCut, dinamisCut, dinamisRate, trxCut, commCut, goxCut, goxRate,
           pembayaranCut, promoXtraCut, promoRate, liveXtraCut, liveRate,
           gxpCut, gxpRate, preOrderCut, preOrderActive, biayaProsesCut,
           totalCut, bersih, profit, margin, rom, bep, roas, adminRate, trxRate, commRate,
           profitNoAd, marginNoAd, romNoAd, roasBep }
}

// Status kesehatan produk berbasis Margin Bersih (sebelum iklan).
// 4 tingkat (dipakai RoasIntelligence); ProductsPage memetakan ke 3 status.
export function healthScore(margin) {
  if (margin < 20) return { key: 'tidak-layak', status: 'Tidak Layak Iklan', short: 'Tidak Layak', color: 'red',     note: 'Margin terlalu tipis untuk menanggung biaya iklan.' }
  if (margin < 30) return { key: 'optimasi',    status: 'Tipis',             short: 'Perlu Optimasi', color: 'orange',  note: 'Bisa diiklankan, tapi ruang profit sempit.' }
  if (margin < 45) return { key: 'sehat',       status: 'Sehat',             short: 'Sehat',          color: 'green',   note: 'Margin sehat — aman untuk diiklankan.' }
  return                  { key: 'sehat',       status: 'Sangat Sehat',      short: 'Sehat',          color: 'emerald', note: 'Margin sangat besar — ruang scaling luas.' }
}

// Status 3-tingkat untuk Product List/Dashboard
export function productStatus(margin) {
  if (margin == null || isNaN(margin)) return { key: 'tidak-layak', label: 'Tidak Layak', color: 'red'    }
  if (margin < 20) return { key: 'tidak-layak', label: 'Tidak Layak',   color: 'red'    }
  if (margin < 30) return { key: 'optimasi',    label: 'Perlu Optimasi', color: 'yellow' }
  return                  { key: 'sehat',        label: 'Sehat',          color: 'green'  }
}
