// Klasifikasi performa GMV Max: tier kualitas (pewarnaan) + status lifecycle
// (Scale/Active/Watch/Kill, dipakai Video Overview & AI Insight).
//
// Prinsip penting — LANTAI SPEND: ROAS sangat tinggi pada spend receh (mis.
// 1012x di Rp3rb) adalah artefak atribusi GMV Max, bukan winner terbukti. Video
// seperti ini masuk "Potensi" (tes scaling), bukan "Scale".

export const DEFAULT_THRESHOLDS = {
  roasGood: 6,       // >= good  → Bagus (Tinggi)
  roasBad: 4,        // <  bad   → Buruk (Rendah)
  roasGreat: 8,      // >= great → Sangat Bagus
  spendFloor: 50000, // lantai spend agar ROAS dihitung "terbukti"
  killFloor: 30000,  // lantai spend agar layak di-Kill (di bawah ini = Watch)
}

// Tier kualitas untuk pewarnaan (Dashboard/Overview/badge).
export function qualityTier(roas, t = DEFAULT_THRESHOLDS) {
  if (roas == null) return 'unknown'
  if (roas >= t.roasGreat) return 'sangat_bagus'
  if (roas >= t.roasGood) return 'bagus'
  if (roas >= t.roasBad) return 'sedang'
  return 'buruk'
}

// Label + nada warna untuk badge ROAS.
export function roasBadge(roas, t = DEFAULT_THRESHOLDS) {
  const tier = qualityTier(roas, t)
  const map = {
    sangat_bagus: { text: 'Sangat Bagus', tone: 'green' },
    bagus:        { text: 'Bagus (Tinggi)', tone: 'green' },
    sedang:       { text: 'Sedang', tone: 'amber' },
    buruk:        { text: 'Buruk (Rendah)', tone: 'red' },
    unknown:      { text: '—', tone: 'muted' },
  }
  return { tier, roas, ...map[tier] }
}

// Status lifecycle per video (pakai ROAS lifetime, total spend, & tren opsional).
// trend: 'up' | 'down' | 'flat' | null (arah antar-periode).
// Return: 'scale' | 'active' | 'watch' | 'kill' | 'inactive'.
export function videoStatus({ roas, cost, trend = null }, t = DEFAULT_THRESHOLDS) {
  if (!cost) return 'inactive'                             // tak pernah dibelanjakan
  if (roas == null) return 'active'
  // Rugi (ROAS < 1): hanya Kill bila spend sudah cukup (≥ killFloor). Di bawah
  // lantai = spend receh, belum cukup data → Watch, bukan Kill.
  if (roas < 1) return cost >= (t.killFloor ?? 0) ? 'kill' : 'watch'
  if (roas >= t.roasGood && cost < t.spendFloor) return 'watch' // potensi (spend receh)
  if (roas >= t.roasGood) return trend === 'down' ? 'watch' : 'scale'
  if (roas >= t.roasBad) return trend === 'down' ? 'watch' : 'active'
  return 'watch'                                           // 1 <= roas < bad
}

// Metadata tampilan status.
export const STATUS_META = {
  scale:    { label: 'Scale',    tone: 'green',  icon: '★', desc: 'ROAS tinggi & spend sehat — naikkan budget.' },
  active:   { label: 'Active',   tone: 'blue',   icon: '✓', desc: 'Performa sehat — pertahankan.' },
  watch:    { label: 'Watch',    tone: 'amber',  icon: '⚠', desc: 'Perlu dipantau / tes scaling / refresh.' },
  kill:     { label: 'Kill',     tone: 'red',    icon: '✕', desc: 'Rugi — matikan & realokasi budget.' },
  inactive: { label: 'Nonaktif', tone: 'muted',  icon: '·', desc: 'Tidak dibelanjakan pada periode ini.' },
}

// Sub-aksi untuk band Watch (dipakai AI Insight): Boost vs Refresh.
export function watchAction({ roas, trend }, t = DEFAULT_THRESHOLDS) {
  if (roas >= t.roasBad || trend === 'up') return 'boost'   // mendekati/naik → dorong
  return 'refresh'                                          // sideways/lemah → ganti kreatif
}
