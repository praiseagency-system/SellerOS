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
// Di bawah ini (jumlah VIDEO yang hasilnya bisa dinilai) pola belum
// ditampilkan sebagai angka — terlalu sedikit.
export const MIN_JUDGED = 5

export const GROUPS = [
  { key: 'tayang_besar', label: 'Sudah tayang, sudah berbelanja' },
  { key: 'belum', label: 'Belum tayang' },
  { key: 'tayang_kecil', label: 'Sudah tayang, belanja kecil' },
  // Boost ulang: 7 hari "sebelum"-nya adalah masa boost SEBELUMNYA pada video
  // yang sama — bukan keadaan asli video — jadi dipisah supaya tidak terhitung
  // sebagai bukti baru untuk kelompok lain.
  { key: 'ulang', label: 'Boost ulang (video baru saja di-boost)' },
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
// others: semua eksperimen (untuk mengenali boost ulang pada video yang sama).
// → profil satu boost | null (bukan boost video / tanggal mulai tak terbaca).
export function boostProfile(exp, byDate, dates, ruleConfig, others = []) {
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
  // Hari jendela yang BELUM tiba (sesudah potret terakhir) vs yang datanya
  // memang tidak masuk — "baru N hari" hanya benar untuk yang pertama.
  let lastDate = null
  if (dates) for (const d of dates) if (!lastDate || d > lastDate) lastDate = d
  let pending = 0
  for (let i = 0; i < 7; i++) if (!lastDate || addDaysISO(day1, i) > lastDate) pending++
  let preStatus = null
  for (let i = 1; i <= 7 && !preStatus; i++) preStatus = pickStatus(at(addDaysISO(day1, -i)), exp.campaign_id)?.status || null
  // Boost ulang: ada boost lain pada video yang sama yang hari ke-1..7-nya
  // menyentuh 7 hari sebelum boost ini (mulai 1–13 hari lebih awal).
  const vid = String(exp.creative_video_id)
  const repeat = (others || []).some(o => o && o.id !== exp.id && BOOST_TYPES.has(o.experiment_type)
    && String(o.creative_video_id) === vid && (() => { const od = wibDateOf(o.start_at); return !!od && od < day1 && od >= addDaysISO(day1, -13) })())
  // Potret sebelum boost ada tetapi videonya tak muncul sama sekali = video
  // belum ada di laporan (belum tayang), BUKAN "tidak terekam".
  const absent = !preStatus && pre.days > 0
  const group = repeat ? 'ulang'
    : absent ? 'belum'
      : !preStatus ? 'tanpa'
        : preStatus !== 'DELIVERING' ? 'belum'
          : pre.spend >= spendFloor ? 'tayang_besar' : 'tayang_kecil'
  // Hasil: hanya dinilai bila cukup hari berdata dan belanjanya mencapai lantai.
  const judged = roiFloor != null && post.days >= MIN_POST_DAYS && post.spend >= spendFloor && post.roi != null
  const outcome = !judged ? 'wait' : post.roi >= roiFloor ? 'above' : 'below'
  return {
    id: exp.id, exp, day1, videoId: vid, preStatus, absent, repeat, group, pre, post, outcome, pending,
    // ROI hanya bermakna bila belanjanya mencapai lantai ("200x" dari Rp450
    // bukan informasi) — berlaku untuk sebelum maupun sesudah.
    preRoiShown: pre.spend >= spendFloor ? pre.roi : null,
    postRoiShown: post.spend >= spendFloor ? post.roi : null,
    complete: post.days >= 7,
  }
}

const fmtX = (v) => `${v.toFixed(1).replace('.', ',')}x`
const videos = (rows) => new Set(rows.map(p => p.videoId)).size
// profiles → kelompok berurutan (yang kosong dibuang) + ringkasan.
// Satuan hitung = BOOST; jumlah VIDEO unik ikut dikembalikan (satu video bisa
// di-boost berkali-kali) dan dipakai untuk gerbang "cukup data".
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
      const lo = pr.length ? fmtX(Math.min(...pr)) : '', hi = pr.length ? fmtX(Math.max(...pr)) : ''
      if (pr.length) note = `ROI sebelum boost: ${lo === hi ? lo : `${lo}–${hi}`}`
    } else if (g.key === 'belum' && below.length) {
      const sts = [...new Set(below.map(p => (p.preStatus ? statusLabel(p.preStatus) : 'belum ada di laporan')))]
      note = `${below.length} yang di bawah ambang: sebelumnya ${sts.join(', ')}`
    } else if (g.key === 'ulang') {
      note = 'angka "sebelum" = masa boost sebelumnya'
    }
    return {
      ...g, rows, n: rows.length, judged: judged.length, above: above.length, below: below.length,
      wait: rows.length - judged.length, videos: videos(rows),
      medianRoi: median(judged.map(p => p.post.roi)),
      spend: sum(rows.map(p => p.post), 'spend'), note,
    }
  }).filter(g => g.n > 0)
  const judgedRows = list.filter(p => p.outcome !== 'wait')
  return {
    groups, total: list.length, videos: videos(list), judged: judgedRows.length, judgedVideos: videos(judgedRows),
    above: groups.reduce((a, g) => a + g.above, 0), below: groups.reduce((a, g) => a + g.below, 0),
    hasFloor: roiFloor != null, enough: videos(judgedRows) >= MIN_JUDGED,
  }
}
