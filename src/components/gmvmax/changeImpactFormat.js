// Format angka & tanggal untuk tampilan dampak perubahan setting. Murni.

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// '2026-09-29' → '29 Sep' (atau '29 Sep 2026').
export const fmtHari = (iso, tahun = false) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${+d} ${BULAN[+m - 1]}${tahun ? ` ${y}` : ''}`
}
// Rentang jendela: '22–28 Sep' atau '30 Sep–4 Okt'.
export const fmtRentang = (a, b) => {
  if (!a || !b) return '—'
  return a.slice(0, 7) === b.slice(0, 7) ? `${+a.slice(8)}–${fmtHari(b)}` : `${fmtHari(a)}–${fmtHari(b)}`
}

const koma = (n, d) => n.toFixed(d).replace('.', ',')
// Rupiah ringkas tanpa awalan, untuk sel sempit: 98,9 rb · 1,31 jt.
export const ringkas = (n) => {
  if (n == null) return '—'
  const a = Math.abs(n)
  if (a >= 1e9) return `${koma(n / 1e9, 2)} M`
  if (a >= 1e6) return `${koma(n / 1e6, 2)} jt`
  if (a >= 1e3) return `${koma(n / 1e3, 1)} rb`
  return String(Math.round(n))
}
// Fraksi → persen. bertanda: '+20%' / '−11%'; tanpa tanda untuk porsi: '62%'.
export const pctLabel = (p, bertanda = true) => {
  if (p == null) return null
  const v = Math.abs(p) * 100
  const s = `${v >= 10 ? v.toFixed(0) : koma(v, 1)}%`
  return bertanda ? `${p >= 0 ? '+' : '−'}${s}` : s
}
export const roasLabel = (r) => (r == null ? '—' : koma(r, 1))
export const angka1 = (n) => (n == null ? '—' : koma(n, 1))

// Batas atas sumbu yang enak dibaca dan tak jauh di atas data.
export const niceMax = (v) => {
  if (!(v > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= v) return k * p
  return 10 * p
}
