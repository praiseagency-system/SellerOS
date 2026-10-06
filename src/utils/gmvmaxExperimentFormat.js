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
// Kotak sempit di baris daftar: tanpa desimal ribuan ("Rp77 rb").
export const fmtRpTinyID = (n) => (!ok(n) ? '—'
  : Math.abs(n) >= 999500 ? big(n)
    : Math.abs(n) >= 1e3 ? `Rp${nfID.format(Math.round(n / 1e3))} rb` : fmtRpID(n))
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

// ── Alasan vonis aturan v2 (jendela kumulatif) ──────────────────────────────
// classifyWindows mengembalikan KODE + angka; kalimatnya dirakit di sini supaya
// daftar, drawer, laporan hitung ulang, dan asisten AI memakai teks yang sama.
// Satu kalimat, bahasa pemilik toko, selalu memuat angka kuncinya.
const BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const tgl = (iso) => (iso ? `${+iso.slice(8, 10)} ${BULAN_ID[+iso.slice(5, 7) - 1]}` : '')
const CAP_TEXT = {
  FEW_DAYS: (p) => `data hanya masuk ${p.counted7} dari 7 hari`,
  FEW_SPEND_DAYS: (p) => `belanjanya hanya terjadi pada ${p.spendDays} hari`,
  INCONSISTENT: (p) => `hanya ${p.above} dari ${p.spendDays} hari berbelanja yang di atas ambang`,
  ONE_DAY: (p) => `bertumpu pada satu hari (tanpa hari terbaiknya ${p.restRoi != null ? `tinggal ${fmtRoiVsFloorID(p.restRoi, p.floor)}` : 'tak ada belanja lain'})`,
  THIN: () => 'selisihnya tipis: satu order lebih sedikit sudah di bawah ambang',
  CONTAMINATED: (p, noun) => `tercampur perubahan lain, jadi belum tentu karena ${noun} ini`,
  TAIL_DROP: (p) => `hari ke-4–7 turun ke ${fmtRoiVsFloorID(p.tailRoi, p.floor)} (dari belanja ${fmtRpRbID(p.tailSpend)})`,
  REBOOST: (p) => `ada boost lain pada video/produk yang sama mulai hari ke-${p.overlapDay}`,
}
// ROI di sisi "salah" ambang yang pembulatan satu desimalnya menyentuh ambang
// ("4,0x … di bawah ambang 4x") ditulis dua desimal supaya tak bertentangan.
export const fmtRoiVsFloorID = (roi, floor) => {
  if (!ok(roi) || !ok(floor)) return fmtRoiID(roi)
  const r1 = Math.round(roi * 10) / 10
  if ((roi < floor && r1 >= floor) || (roi >= floor && r1 < floor)) {
    const r2 = roi < floor ? Math.floor(roi * 100) / 100 : Math.ceil(roi * 100) / 100
    return `${r2.toFixed(2).replace('.', ',')}x`
  }
  return fmtRoiID(roi)
}
export function verdictReasonID(verdict, { noun = 'boost' } = {}) {
  const p = verdict?.params || {}
  const amb = fmtFloorID(p.floor)
  const w3 = `${fmtRoiVsFloorID(p.roi3, p.floor)} dari belanja ${fmtRpRbID(p.spend3)}`
  const w7 = `${fmtRoiVsFloorID(p.roi7, p.floor)} dari belanja ${fmtRpRbID(p.spend7)}`
  // Aksi berhenti: video dikeluarkan / kode spark dilepas, atau campaign dijeda.
  const subj = p.scope === 'campaign' ? 'Campaign' : 'Video'
  const aksi = p.scope === 'campaign' ? 'dijeda' : 'dikeluarkan'
  const akhir = p.finalOn ? ` Vonis akhir ${tgl(p.finalOn)}.` : ''
  // Sebab keyakinan diturunkan pada vonis yang kalimatnya tak memuat pembatas.
  const batas = [
    p.contaminated && `tercampur perubahan lain`,
    p.overlapDay != null && `ada boost lain pada video/produk yang sama mulai hari ke-${p.overlapDay}`,
    p.complete7 && p.counted7 < 5 && `data hanya masuk ${p.counted7} dari 7 hari`,
  ].filter(Boolean)
  const karena = batas.length ? ` Keyakinan rendah: ${batas.join(' dan ')}.` : ''
  switch (verdict?.code) {
    case 'STOPPED': return 'Eksperimen dihentikan sebelum ada vonis.'
    case 'NOT_EVALUATED': return 'Baru dicatat — dihitung otomatis besok pagi.'
    case 'NO_DATA_YET': return 'Belum ada hari berdata sejak mulai.'
    case 'W7_NO_DATA': return 'Tidak ada data dalam 7 hari pertama — tidak ada yang bisa dinilai.'
    case 'NO_ROI_FLOOR': return `Ambang ROI belum diisi — isi "Ambang ROI vonis" di daftar eksperimen supaya ada vonis.${p.spend7 > 0 ? ` ${p.complete7 ? '7 hari pertama' : `Sejauh ini (${p.counted7} hari)`}: ${w7}.` : ''}`
    case 'REMOVED_WAIT': return `${p.day1Counted === false ? `Data hari ${aksi} belum masuk` : `Belanja hari ${aksi} ${fmtRpRbID(p.day1Spend)} (sebagian sebelum aksi)`}${p.afterDays > 0 ? `, ${p.afterDays} hari sesudahnya ${fmtRpRbID(p.afterSpend)}` : ''}; dinilai setelah 7 hari${p.finalOn ? `, ${tgl(p.finalOn)}` : ''}.`
    case 'REMOVED_DONE': return `${subj} berhenti dibelanjai: ${fmtRpRbID(p.afterSpend)} dalam ${p.afterDays} hari sesudah ${aksi}${p.day1Spend > 0 ? ` (hari ${aksi} ${fmtRpRbID(p.day1Spend)}, sebagian sebelum aksi)` : ''}${p.before > 0 ? `; ${p.beforeDays > 0 ? `${p.beforeDays} hari ` : ''}sebelumnya ${fmtRpRbID(p.before)}` : ''} — tidak ada ROI yang dinilai.`
    case 'REMOVED_STILL_SPENDING': return `${subj} masih dibelanjai ${fmtRpRbID(p.afterSpend)} dalam ${p.afterDays} hari sesudah ${aksi}${p.scope === 'campaign' ? ' — periksa status campaign.' : ' — periksa campaign lain.'}`
    case 'W7_WIN': return `ROI gabungan 7 hari pertama ${w7}, di atas ambang ${amb}; ${p.above} dari ${p.spendDays} hari berbelanja di atas ambang.`
    case 'W7_WIN_CAPPED': {
      // Sebab dari LUAR (tercampur, boost lain) didahulukan: itu yang paling
      // perlu diketahui pemilik dan tidak boleh terpotong oleh batas dua sebab.
      const order = ['CONTAMINATED', 'REBOOST']
      const sorted = [...(p.caps || [])].sort((a, b) => (order.includes(b) ? 1 : 0) - (order.includes(a) ? 1 : 0))
      const caps = sorted.map(c => CAP_TEXT[c]?.(p, noun)).filter(Boolean)
      return `ROI gabungan 7 hari pertama ${w7}, di atas ambang ${amb} — tetapi ${caps.slice(0, 2).join('; dan ')}${caps.length > 2 ? `; +${caps.length - 2} sebab lain` : ''}.`
    }
    case 'W7_SPIKE': return `Kuat di 3 hari pertama (${fmtRoiID(p.roi3)}), lalu turun: hari ke-4–7 hanya ${fmtRoiVsFloorID(p.tailRoi, p.floor)} dari belanja ${fmtRpRbID(p.tailSpend)}.${karena}`
    case 'W7_WEAK': return `ROI gabungan 7 hari pertama ${w7}, di bawah ambang ${amb}${p.noOrders ? ' — belum ada order sama sekali' : p.thin ? ' — selisih tipis, satu order lagi sudah di atasnya' : ''}.${karena}`
    case 'W7_LOW_SPEND': return `Belanja 7 hari pertama hanya ${fmtRpRbID(p.spend7)}, di bawah lantai belanja ${fmtRpRbID(p.spendFloor)} — terlalu kecil untuk dinilai.`
    case 'W7_NO_SPEND': return 'Tidak ada belanja dalam 7 hari pertama — tidak ada yang bisa dinilai.'
    case 'W7_FEW_DAYS': return p.scope
      ? `Data sesudah ${aksi} hanya masuk ${p.afterDays} dari 6 hari — belum bisa dipastikan belanjanya berhenti.`
      : `Data hanya masuk ${p.counted7} dari 7 hari — tidak cukup untuk dinilai.`
    case 'W3_WIN_WAIT': return `Sementara: 3 hari pertama ${w3}, di atas ambang ${amb}.${akhir}`
    case 'W3_WEAK_WAIT': return `Sementara: 3 hari pertama ${w3}, jauh di bawah ambang ${amb}.${akhir}`
    case 'W3_BELOW_WAIT': return `Sementara di bawah ambang ${amb}: 3 hari pertama ${w3}.${akhir}`
    case 'W3_LOW_SPEND_WAIT': return `${p.spend3 > 0 ? `Belanja 3 hari pertama baru ${fmtRpRbID(p.spend3)} (lantai belanja ${fmtRpRbID(p.spendFloor)})` : 'Belum ada belanja dalam 3 hari pertama'}.${akhir}`
    case 'W3_FEW_DAYS_WAIT': return `Data 3 hari pertama baru masuk ${p.counted3} hari.${akhir}`
    case 'W3_WAIT': return `Baru ${p.counted3} dari 3 hari${p.interimOn ? ` — vonis sementara ${tgl(p.interimOn)}` : ''}.`
    default: return ''
  }
}
