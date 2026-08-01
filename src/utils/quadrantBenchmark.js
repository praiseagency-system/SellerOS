// Ambang kuadran per mode marketplace.
//
// Skala traffic Shopee dan TikTok berbeda jauh, jadi satu ambang untuk semua
// mode akan salah menempatkan produk. Ambang disimpan & dihitung per mode
// ('all' | 'shopee' | 'tiktok').
//
// Otomatis memakai MEDIAN, bukan rata-rata: satu produk viral bisa menarik
// rata-rata sampai semua produk lain terlihat "low traffic".

import { getCurrentWorkspaceId } from './workspace'

const KEY = (ws, mode) => `quadrant_benchmark:${ws}:${mode}`

export function median(values) {
  const v = values.filter(x => x != null && isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

// Produk yang boleh ikut menentukan ambang konversi: traffic-nya valid (>0)
// dan konversinya bukan null. Produk tanpa data periode ini tak ikut.
export function benchmarkPool(products) {
  return (products || []).filter(p =>
    p.qualifiedTraffic != null && p.qualifiedTraffic > 0 && p.conversionRate != null)
}

export function computeBenchmark(products, manual = null) {
  if (manual && manual.trafficThreshold != null && manual.conversionThreshold != null) {
    return {
      trafficThreshold: manual.trafficThreshold,
      conversionThreshold: manual.conversionThreshold,
      source: 'manual',
      pool: null,
    }
  }
  const pool = benchmarkPool(products)
  return {
    trafficThreshold: median(pool.map(p => p.qualifiedTraffic)),
    conversionThreshold: median(pool.map(p => p.conversionRate)),
    source: 'auto_median',
    pool: pool.length,
  }
}

// Kuadran dari nilai MENTAH (bukan angka yang sudah dibulatkan untuk tampilan).
// Aturan batas deterministik: nilai yang persis sama dengan ambang = "high".
export function quadrantOf(traffic, conversion, thresholds) {
  if (traffic == null || conversion == null) return null
  if (thresholds?.trafficThreshold == null || thresholds?.conversionThreshold == null) return null
  const highT = traffic >= thresholds.trafficThreshold
  const highC = conversion >= thresholds.conversionThreshold
  if (highT && highC) return 1
  if (!highT && highC) return 2
  if (highT && !highC) return 3
  return 4
}

// ── Ambang manual, disimpan per workspace + mode ────────────────────────────
export function loadManualBenchmark(mode) {
  try {
    const ws = getCurrentWorkspaceId()
    if (!ws) return null
    const raw = localStorage.getItem(KEY(ws, mode))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveManualBenchmark(mode, value) {
  try {
    const ws = getCurrentWorkspaceId()
    if (!ws) return false
    if (!value) localStorage.removeItem(KEY(ws, mode))
    else localStorage.setItem(KEY(ws, mode), JSON.stringify({
      trafficThreshold: value.trafficThreshold ?? null,
      conversionThreshold: value.conversionThreshold ?? null,
      updatedAt: new Date().toISOString(),
    }))
    return true
  } catch { return false }
}
