// Export video rollup → CSV (unduh browser).
export function exportVideosCsv(videos, filename = 'gmvmax-videos.csv') {
  const head = ['Video ID', 'Judul', 'Akun', 'Hook', 'Status', 'Cost', 'Revenue', 'ROAS', 'Orders', 'Impressions', 'CTR', 'CVR']
  const esc = (s) => {
    const v = s == null ? '' : String(s)
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  const lines = [head.join(',')]
  for (const v of videos) {
    const l = v.lifetime
    lines.push([
      v.videoId, v.title, v.account || 'Akun toko', v.hook, v.status,
      round(l.cost), round(l.revenue), fx(l.roas), l.orders || 0, l.impressions || 0,
      pct(l.ctr), pct(l.cvr),
    ].map(esc).join(','))
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
const round = (n) => (n == null ? '' : Math.round(n))
const fx = (n) => (n == null ? '' : n.toFixed(2))
const pct = (n) => (n == null ? '' : (n * 100).toFixed(2) + '%')
