// POLA BOOST (Tahap 3) — keadaan video SEBELUM di-boost → hasil 7 hari
// pertamanya. Murni, tanpa React.
//
// Pertanyaan pemilik: "video seperti apa yang layak di-boost lagi?" Jawabannya
// dicari dari boost yang sudah dijalankan: tiap boost dikelompokkan menurut
// keadaan videonya seminggu sebelum mulai, lalu dihitung berapa yang 7 hari
// pertamanya di atas ambang ROI.
//
// Sengaja KELOMPOK, bukan "ciri pemenang vs ciri gagal": per 6 Okt 2026 contoh
// gagal baru 3 dari 22 boost — terlalu sedikit untuk dirata-rata. Kelompok
// tetap jujur pada jumlah kecil karena selalu menulis "N dari M".
//
// Angka = seluruh penayangan video itu di GMV Max (semua campaign), sama
// dengan drawer detail — bukan khusus sesi boost-nya.
import { wibDateOf, resolveRuleConfig } from '../gmvmax/skills/experimentWindows.mjs'
import { addDaysISO } from './gmvmaxExperimentDaily'
import { pickStatus, statusLabel } from './gmvmaxExperimentStatus'

export const BOOST_TYPES = new Set(['MANUAL_BOOST', 'ACCELERATE_TESTING'])
// Minimal hari berdata di hari ke-1..7 supaya hasilnya ikut dihitung (setara
// syarat jendela 7 hari di aturan vonis).
export const MIN_POST_DAYS = 4
// Di bawah ini pola belum ditampilkan sebagai angka — terlalu sedikit.
export const MIN_JUDGED = 5

export const GROUPS = [
  { key: 'tayang_besar', label: 'Sudah tayang, sudah berbelanja' },
  { key: 'belum', label: 'Belum tayang' },
  { key: 'tayang_kecil', label: 'Sudah tayang, belanja kecil' },
  { key: 'tanpa', label: 'Keadaan sebelumnya tidak terekam' },
]

const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)
const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return null
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

// exp: baris eksperimen boost bersasaran video.
// byDate: Map<tanggal, { cost, revenue, orders, impressions, clicks, statuses }>
// dates : Set tanggal yang datanya masuk (potret ada) — pembeda "hari tanpa
//         belanja" dari "data tidak masuk".
// → profil satu boost | null (bukan boost video / tanggal mulai tak terbaca).
export function boostProfile(exp, byDate, dates, ruleConfig) {
  const { roiFloor, spendFloor } = resolveRuleConfig(ruleConfig)
  const day1 = wibDateOf(exp?.start_at)
  if (!exp?.creative_video_id || !BOOST_TYPES.has(exp.experiment_type) || !day1) return null
  const has = (d) => !!dates && dates.has(d)
  const at = (d) => (byDate && byDate.get(d)) || null
  const span = (from, n) => {
    const days = []
    for (let i = 0; i < n; i++) { const d = addDaysISO(from, i); if (has(d)) days.push(at(d) || { cost: 0, revenue: 0, orders: 0, impressions: 0, clicks: 0 }) }
    const spend = sum(days, 'cost'), revenue = sum(days, 'revenue'), impressions = sum(days, 'impressions'), clicks = sum(days, 'clicks')
    return {
      days: days.length, spend, revenue, orders: sum(days, 'orders'), impressions, clicks,
      roi: spend > 0 ? revenue / spend : null, ctr: impressions > 0 ? clicks / impressions : null,
    }
  }
  const pre = span(addDaysISO(day1, -7), 7), post = span(day1, 7)
  let preStatus = null
  for (let i = 1; i <= 7 && !preStatus; i++) preStatus = pickStatus(at(addDaysISO(day1, -i)), exp.campaign_id)?.status || null
  const group = !preStatus ? 'tanpa'
    : preStatus !== 'DELIVERING' ? 'belum'
      : pre.spend >= spendFloor ? 'tayang_besar' : 'tayang_kecil'
  // Hasil: hanya dinilai bila cukup hari berdata dan belanjanya mencapai lantai.
  const judged = roiFloor != null && post.days >= MIN_POST_DAYS && post.spend >= spendFloor && post.roi != null
  const outcome = !judged ? 'wait' : post.roi >= roiFloor ? 'above' : 'below'
  return {
    id: exp.id, exp, day1, preStatus, group, pre, post, outcome,
    // ROI sebelum boost hanya bermakna bila belanjanya mencapai lantai.
    preRoiShown: pre.spend >= spendFloor ? pre.roi : null,
    complete: post.days >= 7,
  }
}

const fmtX = (v) => `${v.toFixed(1).replace('.', ',')}x`
// profiles → kelompok berurutan (yang kosong dibuang) + ringkasan.
export function groupPatterns(profiles = [], ruleConfig) {
  const { roiFloor } = resolveRuleConfig(ruleConfig)
  const list = profiles.filter(Boolean)
  const groups = GROUPS.map(g => {
    const rows = list.filter(p => p.group === g.key).sort((a, b) => (a.day1 < b.day1 ? 1 : -1))
    const judged = rows.filter(p => p.outcome !== 'wait')
    const above = judged.filter(p => p.outcome === 'above')
    const below = judged.filter(p => p.outcome === 'below')
    // Catatan: SATU fakta dari datanya sendiri, bukan tafsiran.
    let note = ''
    if (g.key === 'tayang_besar') {
      const pr = rows.map(p => p.preRoiShown).filter(Number.isFinite)
      if (pr.length >= 2) note = `ROI sebelum boost pun sudah ${fmtX(Math.min(...pr))}–${fmtX(Math.max(...pr))}`
    } else if (g.key === 'belum' && below.length) {
      const sts = [...new Set(below.map(p => statusLabel(p.preStatus)))]
      note = `${below.length} yang di bawah ambang: sebelumnya ${sts.join(', ')}`
    }
    const wait = rows.length - judged.length
    if (!note && wait > 0) note = `${wait} lagi belum cukup data`
    return {
      ...g, rows, n: rows.length, judged: judged.length, above: above.length, below: below.length, wait,
      medianRoi: median(judged.map(p => p.post.roi)),
      spend: sum(rows.map(p => p.post), 'spend'), note,
    }
  }).filter(g => g.n > 0)
  const judgedAll = groups.reduce((a, g) => a + g.judged, 0)
  return {
    groups, total: list.length, judged: judgedAll,
    above: groups.reduce((a, g) => a + g.above, 0), below: groups.reduce((a, g) => a + g.below, 0),
    hasFloor: roiFloor != null, enough: judgedAll >= MIN_JUDGED,
  }
}
