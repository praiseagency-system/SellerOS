import { getCurrentWorkspaceId, sessionsKeyFor } from './workspace'

// Sessions are scoped to the active workspace
function currentKey() {
  return sessionsKeyFor(getCurrentWorkspaceId())
}

export function getSessions() {
  try { return JSON.parse(localStorage.getItem(currentKey()) || '[]') }
  catch { return [] }
}

export function saveSession(session) {
  const key = currentKey()
  const sessions = getSessions()
  // Treat (label + platform) as a period identity: re-uploading the same
  // period replaces the old snapshot instead of duplicating it.
  const filtered = sessions.filter(s =>
    s.id !== session.id &&
    !(s.label === session.label && s.platform === session.platform)
  )
  filtered.unshift(session)
  localStorage.setItem(key, JSON.stringify(filtered))
}

// Pick the "previous period" for comparison.
// Prefers the chronologically-closest earlier period (by periodValue, e.g. "2026-05"),
// falling back to the most recent saved session with a different period.
export function getPreviousSession(platform, periodValue) {
  const same = getSessions().filter(s => s.platform === platform)
  if (periodValue) {
    const earlier = same
      .filter(s => s.periodValue && s.periodValue < periodValue)
      .sort((a, b) => (a.periodValue < b.periodValue ? 1 : -1))
    if (earlier.length) return earlier[0]
  }
  return same.find(s => s.periodValue !== periodValue) || null
}

export function deleteSession(id) {
  const key = currentKey()
  const sessions = getSessions().filter(s => s.id !== id)
  localStorage.setItem(key, JSON.stringify(sessions))
}

export function exportSession(session) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kuadran_${session.platform}_${session.label.replace(/\s+/g, '_')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importSession(file) {
  const text = await file.text()
  const session = JSON.parse(text)
  if (!session.id || !session.products || !session.platform)
    throw new Error('Format file tidak valid.')
  return session
}

// Compact a product for storage (strip comparison deltas, keep core data)
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

export function makeSession({ label, platform, periodValue, periodType, settings, products }) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 }
  products.forEach(p => counts[p.quadrant]++)
  return {
    id:        crypto.randomUUID(),
    label,
    platform,
    periodValue: periodValue ?? null,
    periodType:  periodType ?? null,
    settings,
    savedAt:   new Date().toISOString(),
    summary:   counts,
    products:  products.map(compactProduct),
  }
}
