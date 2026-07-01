// Mesin rekomendasi GMV Max — rule-based murni (bukan model AI eksternal).
// Menghasilkan: kartu band (Scale/Watch/Kill), Action Plan (langkah konkret),
// dan Winning Framework (pola meta). Input = hasil rollupVideos + rollupHooks.
import { DEFAULT_THRESHOLDS, watchAction } from './gmvmaxClassify'
import { fmtIDR, fmtCompact } from './quadrantUtils'

const shortId = (id) => (id ? '…' + String(id).slice(-6) : '—')
const acctOf = (v) => v.account || 'Akun toko'
const titleOf = (v) => (v.title || '').trim() || shortId(v.videoId)

// ─── Kartu band ──────────────────────────────────────────────────────────────
export function insightCards(videos, thresholds = DEFAULT_THRESHOLDS, limit = 8) {
  const spend = videos.filter(v => v.lifetime.cost > 0)

  const scale = spend
    .filter(v => v.status === 'scale')
    .sort((a, b) => b.lifetime.revenue - a.lifetime.revenue)
    .slice(0, limit)
    .map(v => card(v, 'scale',
      `ROAS ${fmtx(v.lifetime.roas)} & spend sehat. Naikkan budget 30–50%${v.hook !== 'lainnya' ? `, duplikasi hook "${v.hook}"` : ''}.`))

  const watch = spend
    .filter(v => v.status === 'watch' && (v.lifetime.cost >= thresholds.spendFloor || (v.lifetime.roas ?? 0) >= 1))
    .sort((a, b) => b.lifetime.revenue - a.lifetime.revenue)
    .slice(0, limit)
    .map(v => {
      const act = watchAction({ roas: v.lifetime.roas, trend: v.trend }, thresholds)
      const detail = act === 'boost'
        ? `Tren ${trendWord(v.trend)}, ROAS ${fmtx(v.lifetime.roas)}. Naikkan budget 20% sambil monitor — kandidat tes scaling.`
        : `Tren ${trendWord(v.trend)}. Refresh kreatif / ganti hook, tes ulang sebelum tambah budget.`
      return card(v, act, detail)
    })

  // Kill: hanya spend berarti (>= lantai) — jangan flag noise spray receh.
  const kill = spend
    .filter(v => v.status === 'kill' && v.lifetime.cost >= thresholds.spendFloor)
    .sort((a, b) => b.lifetime.cost - a.lifetime.cost)
    .slice(0, limit)
    .map(v => card(v, 'kill',
      `ROAS ${fmtx(v.lifetime.roas)} — spend ${fmtIDR(v.lifetime.cost)} nyaris tanpa hasil. Matikan & realokasi.`))

  return { scale, watch, kill }
}

function card(v, action, detail) {
  return {
    videoId: v.videoId,
    title: titleOf(v),
    account: acctOf(v),
    hook: v.hook,
    roas: v.lifetime.roas,
    cost: v.lifetime.cost,
    revenue: v.lifetime.revenue,
    action,          // scale | boost | refresh | kill
    detail,
  }
}

// ─── Action Plan ─────────────────────────────────────────────────────────────
export function actionPlan(videos, thresholds = DEFAULT_THRESHOLDS) {
  const spend = videos.filter(v => v.lifetime.cost > 0)
  const scale = spend.filter(v => v.status === 'scale').sort((a, b) => b.lifetime.revenue - a.lifetime.revenue)
  const watch = spend.filter(v => v.status === 'watch').sort((a, b) => b.lifetime.revenue - a.lifetime.revenue)
  const kill = spend.filter(v => v.status === 'kill' && v.lifetime.cost >= thresholds.spendFloor)
  const reclaimable = kill.reduce((s, v) => s + v.lifetime.cost, 0)

  const names = (arr, n = 2) => arr.slice(0, n).map(v => titleOf(v).slice(0, 28)).join(', ') || '—'

  return [
    { step: 1, title: 'Scale Winner Videos',
      detail: scale.length
        ? `Naikkan budget 30–50% untuk ${names(scale)}${scale.length > 2 ? ` +${scale.length - 2} lain` : ''}. Duplikasi hook pemenang ke kreator baru.`
        : 'Belum ada video "Scale" (ROAS tinggi + spend di atas lantai). Fokus temukan pemenang dari band Watch.' },
    { step: 2, title: 'Refresh / Boost Watch List',
      detail: watch.length
        ? `${watch.length} video di band Watch. Boost yang tren naik, refresh kreatif yang sideways: ${names(watch)}.`
        : 'Tidak ada video Watch — portfolio relatif jelas antara scale & kill.' },
    { step: 3, title: 'Kill & Reallocate',
      detail: kill.length
        ? `Matikan ${kill.length} video rugi (${names(kill)}). Alihkan ~${fmtIDR(reclaimable)} ke top performer.`
        : 'Tidak ada video rugi ber-spend besar. Bagus.' },
    { step: 4, title: 'Weekly Review',
      detail: `Cek ROAS tiap Senin. Target portfolio ROAS > ${thresholds.roasBad}x; scale konsisten yang > ${thresholds.roasGood}x.` },
  ]
}

// ─── Winning Framework ───────────────────────────────────────────────────────
export function winningFramework(videos, hooks) {
  const out = []

  // 1. Best hook — ROAS agregat tertinggi (min 5 video, abaikan 'lainnya').
  const hookCand = (hooks || [])
    .filter(h => h.hook !== 'lainnya' && h.videoCount >= 5 && h.roas != null)
    .sort((a, b) => b.roas - a.roas)
  if (hookCand.length) {
    const best = hookCand[0]
    out.push({ title: `Best Hook: ${cap(best.hook)}`,
      detail: `Hook "${best.hook}" ROAS agregat ${fmtx(best.roas)} dari ${best.videoCount} video — tertinggi antar-hook. Perbanyak angle ini.` })
  }

  // 2. Optimal budget — bucket spend, cari ROAS agregat terbaik.
  const buckets = budgetBuckets(videos)
  const bestBucket = buckets.filter(b => b.count >= 5 && b.roas != null).sort((a, b) => b.roas - a.roas)[0]
  if (bestBucket) {
    out.push({ title: 'Optimal Budget per Video',
      detail: `Sweet spot spend ${bestBucket.label}: ROAS agregat ${fmtx(bestBucket.roas)} (${bestBucket.count} video). Di luar rentang ini efisiensi turun.` })
  }

  // 3. Content age vs ROAS — pakai time_posted (parsial).
  const age = ageInsight(videos)
  if (age) out.push({ title: 'Umur Konten vs ROAS', detail: age })

  // 4. Catatan kreator (tanpa follower).
  out.push({ title: 'Creator Tier (catatan)',
    detail: 'Ranking kreator tersedia di tab Creator (spend, revenue, ROAS). Tier micro-vs-macro by follower belum bisa — jumlah follower tidak ada di export TikTok.' })

  return out
}

function budgetBuckets(videos) {
  const defs = [
    { label: '< Rp50rb', min: 0, max: 50000 },
    { label: 'Rp50–200rb', min: 50000, max: 200000 },
    { label: 'Rp200rb–1jt', min: 200000, max: 1000000 },
    { label: '> Rp1jt', min: 1000000, max: Infinity },
  ]
  return defs.map(d => {
    const vs = videos.filter(v => v.lifetime.cost >= d.min && v.lifetime.cost < d.max && v.lifetime.cost > 0)
    const cost = vs.reduce((s, v) => s + v.lifetime.cost, 0)
    const rev = vs.reduce((s, v) => s + v.lifetime.revenue, 0)
    return { label: d.label, count: vs.length, roas: cost > 0 ? rev / cost : null }
  })
}

function ageInsight(videos) {
  const now = Date.now()
  const withAge = videos.filter(v => v.timePosted && v.lifetime.cost > 0)
    .map(v => ({ days: (now - new Date(v.timePosted).getTime()) / 86400000, roas: v.lifetime.roas }))
    .filter(x => x.days >= 0 && x.roas != null)
  if (withAge.length < 10) return null
  const fresh = withAge.filter(x => x.days <= 14)
  const old = withAge.filter(x => x.days > 14)
  const avg = (a) => a.length ? a.reduce((s, x) => s + x.roas, 0) / a.length : null
  const af = avg(fresh), ao = avg(old)
  if (af == null || ao == null) return null
  return af > ao
    ? `Video ≤14 hari rata-rata ROAS ${fmtx(af)} vs ${fmtx(ao)} untuk yang lebih tua. Refresh kreatif rutin untuk jaga ROAS.`
    : `Video lebih matang (>14 hari) justru ROAS ${fmtx(ao)} vs ${fmtx(af)}. Beri waktu belajar sebelum menilai video baru.`
}

// ─── util kecil ──────────────────────────────────────────────────────────────
const fmtx = (r) => (r == null ? '—' : (r >= 100 ? Math.round(r) : r.toFixed(1)) + 'x')
const trendWord = (t) => (t === 'up' ? 'naik' : t === 'down' ? 'turun' : 'sideways')
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
export { fmtx as fmtRoas }
export const _internal = { budgetBuckets, fmtCompact }
