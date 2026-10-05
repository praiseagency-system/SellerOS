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
// Batas dipasang di titik PEMBULATAN, bukan di angka bulatnya — kalau tidak,
// Rp999.960 jadi "Rp1000 rb" dan ROI 99,96 jadi "100,0x".
const big = (n) => (Math.abs(n) >= 999995e3 ? `Rp${dec(n / 1e9, 2)} M` : `Rp${dec(n / 1e6, 2)} jt`)
// Kartu & chip: angka ≥ Rp1 jt diringkas; angka penuh selalu ada di tabel.
export const fmtRpShortID = (n) => (!ok(n) ? '—' : Math.abs(n) >= 999999.5 ? big(n) : fmtRpID(n))
// Kalimat keterangan (mis. lantai belanja): Rp50 rb, Rp38,9 rb.
export const fmtRpRbID = (n) => (!ok(n) ? '—'
  : Math.abs(n) >= 999950 ? big(n)
    : Math.abs(n) >= 1e3 ? `Rp${dec(n / 1e3).replace(/,0$/, '')} rb` : fmtRpID(n))
export const fmtRoiID = (r) => (ok(r) ? (r >= 99.95 ? nfID.format(Math.round(r)) : dec(r)) + 'x' : '—')
// Ambang ROI: "4x" untuk bilangan bulat, "4,5x" untuk pecahan — satu gaya di
// chip vonis, kartu, legenda, dan alasan vonis.
export const fmtFloorID = (f) => (!ok(f) ? '—' : Number.isInteger(f) ? `${f}x` : fmtRoiID(f))
// Selisih ROI bertanda: "+2,4x" · "−7,5x".
export const fmtSignedX = (v) => (ok(v) ? `${v >= 0 ? '+' : '−'}${dec(Math.abs(v))}x` : '—')
// Rasio fraksi 0–1 → "9,6%".
export const fmtPctID = (f) => (ok(f) ? dec(f * 100) + '%' : '—')

export const CONFIDENCE_LABEL = { HIGH: 'tinggi', MEDIUM: 'sedang', LOW: 'rendah' }

// Alasan vonis dari classifyOutcome ditulis untuk log mesin ("checkpoint",
// "baseline", "TBD_BUSINESS_DECISION"). Modul itu dipakai server juga, jadi
// TIDAK diubah — kalimatnya diterjemahkan di sini. Pola tak dikenal jatuh ke
// teks aslinya supaya alasan baru dari server tidak hilang diam-diam.
const amb = (s) => fmtFloorID(Number(s))
const REASONS = [
  [/^eksperimen dihentikan$/, () => 'Eksperimen dihentikan sebelum ada vonis.'],
  [/^baseline tak dinyatakan/, (m, noun) => `Belum ada data pembanding sebelum ${noun}, atau titik ukur belum dihitung.`],
  [/^tak ada checkpoint ROI terukur$/, () => 'Belum ada titik ukur yang terisi.'],
  [/^delta terukur, tetapi ambang/, () => 'Titik ukur sudah terisi, tetapi ambang ROI belum diisi — isi "Ambang ROI vonis" di daftar eksperimen supaya ada vonis.'],
  [/^ROI kuat H\+1 lalu turun ≥ ([\d.]+)%$/, (m) => `ROI kuat di H+1, lalu turun ${String(m[1]).replace('.', ',')}% atau lebih di titik ukur berikutnya.`],
  [/^ROI ≥ ([\d.]+) bertahan pada (\d+) checkpoint$/, (m) => `ROI di H+3 dan H+7 bertahan di atas ambang ${amb(m[1])} (${m[2]} titik ukur di atas ambang).`],
  [/^ROI ≥ ([\d.]+) pada (\d+) checkpoint, persistensi belum cukup$/, (m) => `ROI di atas ambang ${amb(m[1])} pada ${m[2]} titik ukur, tetapi belum bertahan di H+3 dan H+7.`],
  [/^semua checkpoint ROI < ([\d.]+)$/, (m) => `ROI di semua titik ukur di bawah ambang ${amb(m[1])}.`],
]
export function reasonTextID(reason, noun = 'boost') {
  const text = String(reason ?? '')
  for (const [re, fn] of REASONS) { const m = text.match(re); if (m) return fn(m, noun) }
  return text
}
export const STATUS_LABEL = { RUNNING: 'Berjalan', CONCLUDED: 'Selesai', STOPPED: 'Dihentikan' }
