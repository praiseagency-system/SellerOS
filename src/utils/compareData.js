import { getQuadrant } from './quadrantUtils'

// Quadrant "score" untuk menentukan apakah naik atau turun
const Q_SCORE = { 1: 4, 2: 3, 3: 2, 4: 1 }

function pctChange(curr, prev) {
  if (prev === null || prev === undefined || prev === 0) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

function absDiff(curr, prev) {
  if (prev === null || prev === undefined) return null
  return curr - prev
}

export function compareProducts(currentProducts, prevProducts, settings) {
  const prevMap = new Map(
    prevProducts.map(p => [p.kode_produk, { ...p, quadrant: getQuadrant(p, settings) }])
  )

  return currentProducts.map(curr => {
    const prev = prevMap.get(curr.kode_produk)
    if (!prev) {
      return { ...curr, is_new: true, quadrant_moved: 'new', prev_quadrant: null }
    }

    const currScore = Q_SCORE[curr.quadrant]
    const prevScore = Q_SCORE[prev.quadrant]
    const moved =
      currScore > prevScore ? 'up' :
      currScore < prevScore ? 'down' : 'same'

    return {
      ...curr,
      prev_quadrant: prev.quadrant,
      prev_pengunjung: prev.pengunjung,
      prev_conversion_rate: prev.conversion_rate,
      prev_roas: prev.roas ?? null,
      prev_pesanan: prev.pesanan,
      prev_total_penjualan: prev.total_penjualan,
      delta_pengunjung: pctChange(curr.pengunjung, prev.pengunjung),
      delta_conversion: absDiff(curr.conversion_rate, prev.conversion_rate),
      delta_roas: (curr.roas !== null && prev.roas !== null)
        ? absDiff(curr.roas, prev.roas) : null,
      delta_pesanan: pctChange(curr.pesanan, prev.pesanan),
      delta_penjualan: pctChange(curr.total_penjualan, prev.total_penjualan),
      quadrant_moved: moved,
      is_new: false,
    }
  })
}

export function movementSummary(compared) {
  const counts = { up: 0, down: 0, same: 0, new: 0 }
  compared.forEach(p => counts[p.quadrant_moved] = (counts[p.quadrant_moved] || 0) + 1)
  return counts
}
