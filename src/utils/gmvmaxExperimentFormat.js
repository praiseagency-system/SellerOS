// Pemformat angka gaya Indonesia untuk layar eksperimen (drawer + daftar):
// Rp33.438 · 10,6x · 9,6% · Rp38,9 rb · Rp1,35 jt. Sengaja TERPISAH dari
// fmtRp/fmtRoasX bersama (ui.jsx) — pemformat itu dipakai seluruh halaman GMV
// Max dengan gaya "Rp 33.438" / "10.6x", dan mengubahnya berarti mengubah
// semua layar sekaligus.
const nfID = new Intl.NumberFormat('id-ID')
const ok = (n) => typeof n === 'number' && Number.isFinite(n)
const dec = (v, p = 1) => v.toFixed(p).replace('.', ',')

export const fmtNumID = (n) => (ok(n) ? nfID.format(Math.round(n)) : '—')
export const fmtDec1ID = (n) => (ok(n) ? dec(n) : '—')
export const fmtRpID = (n) => (ok(n) ? 'Rp' + nfID.format(Math.round(n)) : '—')
// Kartu & chip: angka ≥ Rp1 jt diringkas; angka penuh selalu ada di tabel.
export const fmtRpShortID = (n) => (!ok(n) ? '—' : Math.abs(n) >= 1e6 ? `Rp${dec(n / 1e6, 2)} jt` : fmtRpID(n))
// Kalimat keterangan (mis. lantai belanja): Rp50 rb, Rp38,9 rb.
export const fmtRpRbID = (n) => (!ok(n) ? '—'
  : Math.abs(n) >= 1e6 ? `Rp${dec(n / 1e6, 2)} jt`
    : Math.abs(n) >= 1e3 ? `Rp${dec(n / 1e3).replace(/,0$/, '')} rb` : fmtRpID(n))
export const fmtRoiID = (r) => (ok(r) ? (r >= 100 ? nfID.format(Math.round(r)) : dec(r)) + 'x' : '—')
// Rasio fraksi 0–1 → "9,6%".
export const fmtPctID = (f) => (ok(f) ? dec(f * 100) + '%' : '—')

export const CONFIDENCE_LABEL = { HIGH: 'tinggi', MEDIUM: 'sedang', LOW: 'rendah' }
export const STATUS_LABEL = { RUNNING: 'Berjalan', CONCLUDED: 'Selesai', STOPPED: 'Dihentikan' }
