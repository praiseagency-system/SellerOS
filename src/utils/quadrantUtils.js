export const QUADRANT_CONFIG = {
  1: {
    label: 'HIGH TRAFFIC · HIGH CONVERSION',
    short: 'HT · HC',
    desc: 'Produk terbaik — jaga stok & optimalkan iklan',
    color: '#16a34a',
    bgLabel: 'bg-green-600',
    textLabel: 'text-white',
    rowHover: 'hover:bg-green-50',
    fill: 'rgba(34,197,94,0.08)',
    position: 'top-right',
  },
  2: {
    label: 'LOW TRAFFIC · HIGH CONVERSION',
    short: 'LT · HC',
    desc: 'Konversi bagus — naikkan traffic dengan iklan',
    color: '#0891b2',
    bgLabel: 'bg-cyan-500',
    textLabel: 'text-white',
    rowHover: 'hover:bg-cyan-50',
    fill: 'rgba(6,182,212,0.08)',
    position: 'bottom-right',
  },
  3: {
    label: 'HIGH TRAFFIC · LOW CONVERSION',
    short: 'HT · LC',
    desc: 'Traffic tinggi tapi tidak convert — perbaiki listing',
    color: '#ea580c',
    bgLabel: 'bg-orange-500',
    textLabel: 'text-white',
    rowHover: 'hover:bg-orange-50',
    fill: 'rgba(249,115,22,0.08)',
    position: 'top-left',
  },
  4: {
    label: 'LOW TRAFFIC · LOW CONVERSION',
    short: 'LT · LC',
    desc: 'Performa rendah — evaluasi atau discontinue',
    color: '#dc2626',
    bgLabel: 'bg-red-500',
    textLabel: 'text-white',
    rowHover: 'hover:bg-red-50',
    fill: 'rgba(239,68,68,0.06)',
    position: 'bottom-left',
  },
}

export const CONVERSION_BENCHMARKS = [
  { label: '< 50.000', min: 0, max: 50000, cr: 3.0 },
  { label: '50 – 100 Rb', min: 50000, max: 100000, cr: 2.0 },
  { label: '100 – 200 Rb', min: 100000, max: 200000, cr: 1.5 },
  { label: '200 – 500 Rb', min: 200000, max: 500000, cr: 0.75 },
  { label: '500 Rb – 1 Jt', min: 500000, max: 1000000, cr: 0.5 },
  { label: '> 1 Juta', min: 1000000, max: Infinity, cr: 0.25 },
]

export function getTrafficThreshold(settings) {
  return settings.targetHarian * settings.periodDays
}

export function getQuadrant(product, settings) {
  const trafficThreshold = getTrafficThreshold(settings)
  const highTraffic = product.pengunjung >= trafficThreshold
  const highConversion = product.conversion_rate >= settings.conversionThreshold
  if (highTraffic && highConversion) return 1
  if (!highTraffic && highConversion) return 2
  if (highTraffic && !highConversion) return 3
  return 4
}

export function fmtNum(n, decimals = 0) {
  if (n === null || n === undefined) return '-'
  return n.toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function fmtCompact(n) {
  if (n === null || n === undefined) return '-'
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace('.', ',') + ' M'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + ' Jt'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.', ',') + ' Rb'
  return fmtNum(n)
}

export function fmtIDR(n) {
  if (n === null || n === undefined) return '-'
  return 'Rp ' + fmtNum(n)
}
