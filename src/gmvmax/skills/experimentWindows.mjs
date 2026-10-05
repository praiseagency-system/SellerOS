// Vonis eksperimen dari JENDELA KUMULATIF (aturan v2). MURNI — tanpa dependensi
// node — supaya dipakai SERVER (experimentEval) dan PERAMBAN (vonis live saat
// ambang diubah) dari satu sumber.
//
// Kenapa ada: aturan lama (experimentClassify.mjs) memvonis dari TIGA HARI
// TUNGGAL — H+1, H+3, H+7. Hari di antaranya tak pernah terhitung, dan ROI 41x
// dari belanja Rp6 ribu ikut menentukan "Pemenang berkelanjutan". Aturan ini
// menjumlah SEMUA hari dalam dua jendela: hari ke-1–3 dan hari ke-1–7.
//
// Keputusan pemilik (5 Okt 2026), jangan diubah tanpa bertanya lagi:
//   • Hari ke-1 = TANGGAL WIB perlakuan dimulai (hari mulai IKUT dihitung).
//     Dulu jendela mulai dari tanggal-UTC + 1, sehingga boost siang kehilangan
//     hari pertamanya (15–80% belanja) sedangkan boost dini hari tidak.
//   • ROI gabungan = total omzet ÷ total belanja jendela.
//   • Jendela yang belanjanya di bawah lantai belanja TIDAK divonis.
//   • Eksperimen TERCAMPUR tetap divonis tetapi dibatasi: paling tinggi
//     "Kandidat pemenang", keyakinan rendah.
//
// Aturan lama TETAP ADA dan tak disentuh: baris yang titik ukurnya masih
// berformat lama (ditulis bundel VPS lama) dinilai dengan aturan lama sampai
// server menulis ulang.

export const RULE_VERSION = 2
export const DEFAULT_SPEND_FLOOR = 50000
// "Lonjakan sementara": ROI hari ke-4–7 turun ≥ 40% dari 3 hari pertama.
export const SPIKE_DROP = 0.4
export const WINDOW_DEFS = Object.freeze([{ key: 'w3', days: 3 }, { key: 'w7', days: 7 }])

const DAY_MS = 86400000
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const toMs = (iso) => Date.parse(`${iso}T00:00:00Z`)
const addDays = (iso, n) => new Date(toMs(iso) + n * DAY_MS).toISOString().slice(0, 10)

// Tanggal WIB (UTC+7, tanpa DST) sebuah instant; null bila tak terbaca.
export function wibDateOf(iso) {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? new Date(ms + 7 * 3600000).toISOString().slice(0, 10) : null
}

// Hari ke-1 eksperimen. Data harian = hari WIB, jadi hari pertama pun hari WIB.
export function dayOne(experiment) {
  return wibDateOf(experiment?.start_at) || String(experiment?.start_at || '').slice(0, 10) || null
}

// SATU sumber setelan untuk server dan peramban. Menerima baris gmvmax_settings
// (snake_case) maupun thresholds peramban (camelCase).
//   roiFloor   : kosong / ≤ 0 → null (belum ada ambang → tidak memvonis)
//   spendFloor : kosong / ≤ 0 / rusak → Rp50.000 (bawaan kolomnya). Lantai TIDAK
//                boleh "tidak ada": tanpa lantai, jendela Rp150 ikut divonis.
export function resolveRuleConfig(row) {
  const rf = Number(row?.experiment_roi_floor ?? row?.experimentRoiFloor ?? row?.roiFloor)
  const sf = Number(row?.spend_floor ?? row?.spendFloor)
  return {
    roiFloor: Number.isFinite(rf) && rf > 0 ? rf : null,
    spendFloor: Number.isFinite(sf) && sf > 0 ? sf : DEFAULT_SPEND_FLOOR,
  }
}

// Aksi yang MENGHENTIKAN tayangan (video dikeluarkan, kode spark dilepas):
// belanja yang berhenti adalah tanda BERHASIL, bukan "data kurang" — ROI-nya
// tidak dinilai. Arah dibaca dari kalimat perlakuan yang ditulis pembuka
// eksperimen (experimentOpener.mjs); "dipulihkan" dinilai seperti biasa.
export function actionDirection(exp) {
  const t = String(exp?.treatment || '')
  if (/dilepas/i.test(t) && /spark/i.test(t)) return 'remove'
  if (exp?.experiment_type === 'CREATIVE_EXCLUSION') return /dipulihkan/i.test(t) ? 'normal' : 'remove'
  return 'normal'
}

// series: [{ date, spend, revenue, orders }] — SATU entri per tanggal yang
// datanya masuk (nol bila sasaran tak muncul hari itu); tanggal tanpa entri =
// data tidak masuk. lastDataDate: tanggal data terakhir (bawaan: entri terakhir).
// → { day1, windows: [w3, w7], baseline }. `windows` = isi kolom checkpoints.
export function computeWindows({ experiment, series = [], lastDataDate = null, ruleConfig = null }) {
  const day1 = dayOne(experiment)
  if (!day1) return { day1: null, windows: [], baseline: null }
  const byDate = new Map(series.map(r => [r.date, r]))
  let last = lastDataDate || null
  for (const r of series) if (!last || r.date > last) last = r.date

  // Pembanding sebelum mulai — untuk DITAMPILKAN. Vonis tidak bergantung
  // padanya: vonis membandingkan ROI dengan ambang, bukan dengan masa lalu.
  let baseline = null
  const bs = experiment.baseline_start, be = experiment.baseline_end
  if (bs && be) {
    const rows = series.filter(r => r.date >= bs && r.date <= be && r.date < day1)
    if (rows.length) {
      const spend = rows.reduce((a, r) => a + num(r.spend), 0)
      const revenue = rows.reduce((a, r) => a + num(r.revenue), 0)
      baseline = { from: bs, to: be, days: rows.length, spend, revenue, roi: spend > 0 ? revenue / spend : null }
    }
  }

  const windows = WINDOW_DEFS.map((def) => {
    const w = {
      v: RULE_VERSION, kind: 'window', key: def.key, label: `Hari 1–${def.days}`,
      from: day1, to: addDays(day1, def.days - 1), days: def.days,
      counted: 0, missing: 0, pending: 0, spend: 0, revenue: 0, orders: 0, daily: [],
    }
    for (let i = 0; i < def.days; i++) {
      const d = addDays(day1, i)
      if (!last || d > last) { w.pending += 1; continue }
      const r = byDate.get(d)
      if (!r) { w.missing += 1; continue }
      const s = num(r.spend), rv = num(r.revenue), o = num(r.orders)
      w.counted += 1; w.spend += s; w.revenue += rv; w.orders += o
      // Deret harian ikut disimpan: "N dari M hari di atas ambang" bergantung
      // pada ambang, dan peramban harus bisa menghitungnya ulang saat ambang diubah.
      w.daily.push({ d, s, r: rv, o })
    }
    w.complete = w.pending === 0
    w.roi = w.spend > 0 ? w.revenue / w.spend : null
    // Dibaca pembaca lama sebagai "ada angka atau tidak".
    w.measurement_label = w.counted > 0 ? 'MEASURED' : 'UNKNOWN'
    return w
  })
  const w7 = windows[windows.length - 1]
  w7.baseline = baseline
  // Cap setelan saat dihitung — supaya terlihat bila vonis tersimpan memakai
  // ambang yang sudah berubah.
  if (ruleConfig) w7.cfg = { roi_floor: ruleConfig.roiFloor ?? null, spend_floor: ruleConfig.spendFloor ?? null }
  return { day1, windows, baseline }
}

// 'empty' | 'legacy' (tiga titik ukur satu hari) | 'v2' | 'unknown'.
// 'unknown' (versi lain / campuran) → jangan menghitung sendiri; pakai vonis DB.
export function checkpointsFormat(cps) {
  if (!Array.isArray(cps) || cps.length === 0) return 'empty'
  const win = cps.filter(c => c && c.kind === 'window' && c.v === RULE_VERSION)
  if (win.length === cps.length) return win.some(c => c.key === 'w7') ? 'v2' : 'unknown'
  return cps.every(c => c && c.v == null && c.kind == null) ? 'legacy' : 'unknown'
}
export const windowOf = (cps, key) => (Array.isArray(cps) ? cps.find(c => c && c.kind === 'window' && c.key === key) : null) || null

const roiOf = (w) => (w && w.spend > 0 ? w.revenue / w.spend : null)

// "Hari berbelanja" = hari dengan belanja ≥ 10% lantai belanja. Hari receh
// (Rp1–5 ribu) tidak ikut memilih: dulu hari seperti itulah yang menghasilkan
// 41x dan ikut menentukan vonis.
export function windowStats(w, { roiFloor = null, spendFloor = DEFAULT_SPEND_FLOOR } = {}) {
  const daily = Array.isArray(w?.daily) ? w.daily : []
  const min = spendFloor * 0.1
  const spendDays = daily.filter(d => d.s > 0 && d.s >= min)
  return {
    spendDays: spendDays.length,
    smallDays: daily.filter(d => d.s > 0 && d.s < min).length,
    above: isNum(roiFloor) ? spendDays.filter(d => d.r / d.s >= roiFloor).length : null,
  }
}

// Jendela layak dinilai: sudah lengkap, cukup hari berdata (2 dari 3; 4 dari 7),
// dan belanjanya mencapai lantai.
const enoughDays = (w) => w.counted >= (w.days <= 3 ? 2 : 4)
const judgeable = (w, sf) => !!w && w.complete && enoughDays(w) && w.spend > 0 && w.spend >= sf

// Tipis = ROI pindah sisi ambang bila SATU order (senilai rata-rata order jendela
// itu) hilang / bertambah. Lolos lantai belum berarti cukup sampel: Rp50 ribu
// pada ambang 4x hanya ±2 order.
const thinAbove = (w, floor) => !(w.orders > 0) || (w.revenue - w.revenue / w.orders) / w.spend < floor
const thinBelow = (w, floor, sf) => (w.orders > 0 ? (w.revenue + w.revenue / w.orders) / w.spend >= floor : w.spend < 2 * sf)

// Kokoh = masih di atas ambang walau hari terbaiknya dibuang.
function restWithoutBest(w) {
  const daily = Array.isArray(w.daily) ? w.daily : []
  if (!daily.length) return { spend: 0, roi: null }
  const best = daily.reduce((a, d) => (d.r > a.r ? d : a), daily[0])
  const spend = w.spend - best.s, revenue = w.revenue - best.r
  return { spend, roi: spend > 0 ? revenue / spend : null }
}

// windows    : isi checkpoints berformat v2 ([w3, w7])
// ruleConfig : { roiFloor, spendFloor } dari resolveRuleConfig
// contaminated / overlapDay : pembatas — lihat kepala berkas
// direction  : 'remove' → ROI tidak dinilai
// → { conclusion, confidence, code, params, provisional }
//   code + params = alasan sebagai DATA; kalimatnya dirakit pemformat
//   (gmvmaxExperimentFormat.verdictReasonID) supaya semua layar memakai teks sama.
export function classifyWindows({
  windows, ruleConfig = {}, status = 'RUNNING', contaminated = false, direction = 'normal', overlapDay = null,
} = {}) {
  const { roiFloor, spendFloor } = resolveRuleConfig(ruleConfig)
  const w3 = windowOf(windows, 'w3'), w7 = windowOf(windows, 'w7')
  const R = (conclusion, confidence, code, params = {}, provisional = false) => ({ conclusion, confidence, code, params, provisional })
  const roi3 = roiOf(w3), roi7 = roiOf(w7)
  const base = {
    floor: roiFloor, spendFloor,
    roi3, spend3: w3?.spend ?? 0, counted3: w3?.counted ?? 0,
    roi7, spend7: w7?.spend ?? 0, orders7: w7?.orders ?? 0, counted7: w7?.counted ?? 0, missing7: w7?.missing ?? 0,
    complete7: !!w7?.complete,
    // Data hari ke-7 baru masuk pagi berikutnya.
    finalOn: w7 ? addDays(w7.to, 1) : null, interimOn: w3 ? addDays(w3.to, 1) : null,
  }
  const open = status === 'RUNNING'

  if (status === 'STOPPED') return R('STOPPED', 'MEDIUM', 'STOPPED')
  if (!w7) return R('INCONCLUSIVE', 'LOW', 'NOT_EVALUATED', base, true)
  if (w7.counted === 0 && (w3?.counted ?? 0) === 0) {
    return w7.complete || !open
      ? R('DATA_INSUFFICIENT', 'DATA_INSUFFICIENT', 'W7_NO_DATA', base)
      : R('INCONCLUSIVE', 'LOW', 'NO_DATA_YET', base, true)
  }

  if (direction === 'remove') {
    const p = { ...base, before: w7.baseline?.spend ?? null }
    if (!w7.complete && open) return R('INCONCLUSIVE', 'LOW', 'REMOVED_WAIT', p, true)
    return R('DATA_INSUFFICIENT', 'DATA_INSUFFICIENT', w7.spend >= spendFloor ? 'REMOVED_STILL_SPENDING' : 'REMOVED_DONE', p)
  }

  if (roiFloor == null) return R('INCONCLUSIVE', 'LOW', 'NO_ROI_FLOOR', base)

  const ok3 = judgeable(w3, spendFloor), ok7 = judgeable(w7, spendFloor)
  const limited = contaminated || overlapDay != null

  if (ok7) {
    const st = windowStats(w7, { roiFloor, spendFloor })
    // Ekor = hari ke-4–7, TIDAK tumpang-tindih dengan 3 hari pertama. Tanpa
    // itu "lonjakan" hampir mustahil terdeteksi: jendela 7 hari memuat 3 hari
    // pertamanya sendiri.
    const tail = (w7.daily || []).filter(d => w3 && d.d > w3.to)
    const tailSpend = tail.reduce((a, d) => a + d.s, 0), tailRev = tail.reduce((a, d) => a + d.r, 0)
    const tailRoi = tailSpend > 0 ? tailRev / tailSpend : null
    if (ok3 && roi3 >= roiFloor && !thinAbove(w3, roiFloor) && tailSpend >= spendFloor
      && tailRoi < roiFloor && tailRoi <= (1 - SPIKE_DROP) * roi3) {
      return R('TEMPORARY_SPIKE', limited ? 'LOW' : 'MEDIUM', 'W7_SPIKE', { ...base, tailRoi, tailSpend })
    }
    if (roi7 >= roiFloor) {
      const rest = restWithoutBest(w7)
      const caps = []
      if (w7.counted < 5) caps.push('FEW_DAYS')
      if (st.spendDays < 4) caps.push('FEW_SPEND_DAYS')
      else if (st.above * 2 < st.spendDays) caps.push('INCONSISTENT')
      if (!(rest.roi != null && rest.roi >= roiFloor)) caps.push('ONE_DAY')
      if (thinAbove(w7, roiFloor)) caps.push('THIN')
      if (contaminated) caps.push('CONTAMINATED')
      if (overlapDay != null) caps.push('REBOOST')
      const p = { ...base, above: st.above, spendDays: st.spendDays, restRoi: rest.roi, overlapDay, caps }
      return caps.length === 0
        ? R('SUSTAINABLE_WINNER', 'MEDIUM', 'W7_WIN', p)
        : R('WINNER_CANDIDATE', 'LOW', 'W7_WIN_CAPPED', p)
    }
    const thin = thinBelow(w7, roiFloor, spendFloor)
    return R('WEAK', thin || limited || w7.counted < 5 ? 'LOW' : 'MEDIUM', 'W7_WEAK',
      { ...base, above: st.above, spendDays: st.spendDays, thin })
  }

  // Jendela 7 hari sudah lengkap tetapi tak layak → FINAL, tak ada yang ditunggu.
  if (w7.complete) {
    const code = !(w7.spend > 0) ? 'W7_NO_SPEND' : !enoughDays(w7) ? 'W7_FEW_DAYS' : 'W7_LOW_SPEND'
    return R('DATA_INSUFFICIENT', 'DATA_INSUFFICIENT', code, base)
  }

  // Ditutup sebelum 7 hari lengkap: tak ada lagi yang ditunggu.
  if (!open) {
    if (ok3) return roi3 >= roiFloor ? R('WINNER_CANDIDATE', 'LOW', 'CLOSED_EARLY_WIN', base) : R('WEAK', 'LOW', 'CLOSED_EARLY_WEAK', base)
    return R('DATA_INSUFFICIENT', 'DATA_INSUFFICIENT', 'CLOSED_EARLY', base)
  }

  // Belum 7 hari → sementara dari 3 hari pertama. "Lemah" dini hanya untuk yang
  // JAUH di bawah ambang dengan belanja cukup: pada data asli, 4 dari 7 jendela
  // 3-hari yang sedikit di bawah ambang berbalik ke atas di hari ke-7.
  if (ok3) {
    if (roi3 >= roiFloor) return R('WINNER_CANDIDATE', 'LOW', 'W3_WIN_WAIT', base, true)
    if (roi3 < roiFloor / 2 && w3.spend >= 2 * spendFloor) return R('WEAK', 'LOW', 'W3_WEAK_WAIT', base, true)
    return R('INCONCLUSIVE', 'LOW', 'W3_BELOW_WAIT', base, true)
  }
  if (w3?.complete) return R('INCONCLUSIVE', 'LOW', enoughDays(w3) ? 'W3_LOW_SPEND_WAIT' : 'W3_FEW_DAYS_WAIT', base, true)
  return R('INCONCLUSIVE', 'LOW', 'W3_WAIT', base, true)
}

// Boost LAIN pada video yang sama yang mulai di dalam jendela 7 hari eksperimen
// ini → hari ke berapa (2–7), atau null. Penanda `contaminated` tidak
// menangkapnya (ia hanya melihat setelan campaign dan persetujuan lain),
// padahal sesi boost kedua jelas ikut mengisi jendela.
export function overlapDayOf(exp, others = []) {
  const day1 = dayOne(exp)
  if (!day1 || !exp?.creative_video_id) return null
  const end = addDays(day1, 6)
  let hit = null
  for (const o of others) {
    if (!o || o.id === exp.id || o.creative_video_id !== exp.creative_video_id) continue
    if (o.experiment_type !== 'MANUAL_BOOST' && o.experiment_type !== 'ACCELERATE_TESTING') continue
    const d = dayOne(o)
    if (!d || d <= day1 || d > end) continue
    const n = Math.round((toMs(d) - toMs(day1)) / DAY_MS) + 1
    if (hit == null || n < hit) hit = n
  }
  return hit
}
