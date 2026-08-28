// Aksi eksekusi per baris di Performa Video (Opsi A) — Boost & Exclude langsung
// dari tabel, sebahasa dengan daftar video di detail Campaign Ads.
//
// Tiga hal yang membuat ini tidak sesederhana "dua tombol":
//   1. Sasaran. Boost butuh campaign_id + spu_id + store_id; Exclude butuh
//      campaign_id + spu_id. Baris video kini membawa `placements` (semua
//      pasangan campaign x produk tempat video itu ikut).
//   2. Ambiguitas. 3,5% video ikut >1 campaign — tombolnya jadi menu ▾ dan
//      kamu yang memilih sasarannya. Tidak pernah menebak.
//   3. Kelayakan. Video AUTHORIZATION_NEEDED/EXCLUDED/REJECTED/UNAVAILABLE
//      ditolak API untuk boost; tombolnya diganti keterangan yang benar.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Rocket, Ban, X, ChevronDown } from 'lucide-react'
import { requestBoostSession, requestCreativeExclude, SESSION_MIN_BUDGET_IDR, BOOST_BLOCKED_STATUS } from '../../data/gmvmaxCampaignControl'
import { pickBoostTarget } from '../../utils/gmvmaxBoostTarget'
import SessionSchedule from './SessionSchedule'
import { defaultSchedule } from '../../utils/gmvmaxSchedule'

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

// Alasan sebuah video tak bisa di-boost, dalam bahasa yang bisa ditindaklanjuti.
const BLOCK_HINT = {
  AUTHORIZATION_NEEDED: 'Butuh kode spark',
  EXCLUDED: 'Dikecualikan',
  REJECTED: 'Ditolak TikTok',
  UNAVAILABLE: 'Tak tersedia',
}

// ── Sel aksi ────────────────────────────────────────────────────────────────
// resolve(placement) → { storeId, campaignName } | null
// anchorOf(videoId)  → spu_id produk yang tertaut di video (opsional, sinyal terkuat)
// productName(spuId) → nama produk (ID telanjang tak berarti apa-apa bagi manusia)
// layout 'cell'   → hanya tombol (tabel padat)
//        'inline' → tombol + baris sasaran & alasannya (daftar rekomendasi)
export function VideoExecCell({
  video, resolve, onBoost, onExclude, anchorOf, onOpenChange,
}) {
  // Sel ini TIDAK menggambar menu pemilih. Elemen ber-posisi absolut di dalam
  // tabel bergulir pasti dipotong wadahnya (bug nyata yang dilaporkan user),
  // jadi saat sasaran belum pasti sel hanya MEMINTA pemanggil membukanya —
  // pemanggil merendernya sebagai baris tabel membentang (TargetChooserRow).
  const withProduct = (video.placements || []).filter(p => p.productId)
  const places = withProduct.filter(p => resolve(p))
  const blocked = BOOST_BLOCKED_STATUS.includes(video.delivery)

  // Dua sebab berbeda, dua keterangan berbeda — jangan disamarkan jadi satu.
  if (!places.length) {
    return withProduct.length
      ? <span className="text-[10px] text-ink-faint" title="Campaign-nya nonaktif atau settingnya belum tertangkap snapshot">campaign nonaktif</span>
      : <span className="text-[10px] text-ink-faint" title="Baris ini tak terikat SPU produk — aksi butuh spu_id">tanpa produk</span>
  }

  // Sasaran ditentukan sistem lewat tangga bukti; menu hanya muncul kalau
  // buktinya memang tak ada. Lihat gmvmaxBoostTarget.js.
  const target = pickBoostTarget({
    video, anchorSpu: anchorOf?.(video.videoId) || null, eligible: (p) => !!resolve(p),
  })

  const go = (kind) => {
    if (target.confident && target.placement) (kind === 'BOOST' ? onBoost : onExclude)(video, target.placement)
    else onOpenChange?.(kind)
  }
  // Tanpa pemanggil yang menyediakan pemilih, tombol untuk sasaran ambigu akan
  // diam saja — lebih baik dinonaktifkan dengan keterangan daripada mengelabui.
  const perluPemilih = !target.confident && !onOpenChange

  const btn = 'px-2 py-0.5 rounded-md text-[10px] font-semibold border disabled:opacity-40 whitespace-nowrap'

  return (
    <div className="inline-flex items-center gap-1">
      {blocked ? (
        <span className="text-[10px] text-ink-faint whitespace-nowrap">{BLOCK_HINT[video.delivery] || '—'}</span>
      ) : (
        <button onClick={() => go('BOOST')} disabled={perluPemilih}
          title={perluPemilih
            ? 'Video ini ikut di beberapa campaign — layar ini belum menyediakan pemilih sasaran'
            : 'Creative Boost — belanja tambahan utk eksplorasi video ini (via 🔔)'}
          className={`${btn} border-violet-500/30 text-violet-300 hover:bg-violet-500/10`}>
          Boost{!target.confident && <ChevronDown className="w-2.5 h-2.5 inline ml-0.5 -mt-px" />}
        </button>
      )}
      <button onClick={() => go('EXCLUDE')} disabled={perluPemilih}
        title={perluPemilih
          ? 'Video ini ikut di beberapa campaign — layar ini belum menyediakan pemilih sasaran'
          : video.delivery === 'EXCLUDED' ? 'Pulihkan ke rotasi (via 🔔)' : 'Keluarkan dari rotasi campaign (via 🔔)'}
        className={video.delivery === 'EXCLUDED'
          ? `${btn} border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/10`
          : `${btn} border-red-500/25 text-red-400 hover:bg-red-500/10`}>
        {video.delivery === 'EXCLUDED' ? 'Pulihkan' : 'Exclude'}
        {!target.confident && <ChevronDown className="w-2.5 h-2.5 inline ml-0.5 -mt-px" />}
      </button>

    </div>
  )
}

// ── Dialog Creative Boost ───────────────────────────────────────────────────
// Portal ke <body>: modal fixed di dalam ancestor ber-backdrop-filter akan
// terjebak (aturan lama repo ini).
export function VideoBoostDialog({ video, placement, storeId, onClose, onQueued }) {
  const MIN = SESSION_MIN_BUDGET_IDR.CREATIVE_BOOST
  const [budget, setBudget] = useState(String(MIN))
  // Jadwal & "sekarang" dibekukan saat dialog dibuka: dihitung ulang tiap render
  // akan membuat durasi merayap turun sementara pengguna mengetik.
  const [sched, setSched] = useState(() => defaultSchedule(24))
  const [nowMs] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function submit() {
    setBusy(true); setErr(null)
    try {
      await requestBoostSession({
        kind: 'CREATIVE_BOOST',
        campaignId: placement.campaignId, campaignName: placement.campaignName,
        storeId, spuId: placement.productId,
        itemId: video.videoId, videoTitle: video.title || '',
        budget: Number(budget), endAt: sched.endAt,
        evidence: {
          dari: 'Performa Video',
          akun: video.account ? `@${video.account}` : null,
          status: video.delivery || null,
          roas: video.lifetime?.roas != null ? Number(video.lifetime.roas.toFixed(2)) : null,
          spend: Math.round(video.lifetime?.cost || 0),
        },
      })
      onQueued(`Creative Boost diajukan — buka 🔔 untuk menyetujui. Nilai hasilnya di H+3–H+7, bukan hari ini.`)
      onClose()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="glass-modal w-full max-w-md rounded-2xl border border-line/15 shadow-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-strong flex items-center gap-1.5">
              <Rocket className="w-4 h-4 text-violet-400" /> Creative Boost
            </h3>
            <p className="text-xs text-ink-muted truncate mt-0.5">
              @{video.account || '?'} · {String(video.title || video.videoId).slice(0, 48)}
            </p>
            <p className="text-[11px] text-ink-faint truncate">
              {placement.campaignName || placement.campaignId} · produk <span className="font-mono">{placement.productId}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1"><X className="w-4 h-4" /></button>
        </div>

        <label className="block mb-3">
          <span className="text-[11px] text-ink-muted">Budget / hari</span>
          <input type="number" value={budget} min={MIN} step={10000} onChange={e => setBudget(e.target.value)}
            className="mt-1 w-full bg-surface2 border border-line/15 rounded-lg px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-violet-500/40" />
          <span className="text-[10px] text-ink-faint">minimal {rp(MIN)}</span>
        </label>

        <SessionSchedule kind="CREATIVE_BOOST" startAt={sched.startAt} endAt={sched.endAt}
          onChange={setSched} nowMs={nowMs} />

        <p className="mt-3 text-[11px] text-amber-400/90 leading-relaxed">
          Sesi boost punya budget terpisah dan tidak dilindungi ROI Protection. Vonisnya baru sahih di H+3–H+7.
        </p>
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button disabled={busy} onClick={submit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Ajukan ke antrean 🔔
          </button>
          <span className="text-[11px] text-ink-faint">Eksekusi setelah kamu Setujui.</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Dialog konfirmasi Exclude / Pulihkan ────────────────────────────────────
export function VideoExcludeDialog({ video, placement, onClose, onQueued }) {
  const restore = video.delivery === 'EXCLUDED'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function submit() {
    setBusy(true); setErr(null)
    try {
      await requestCreativeExclude({
        campaignId: placement.campaignId, campaignName: placement.campaignName,
        videoId: video.videoId, videoTitle: video.title || '',
        tiktokAccount: video.account || '', spuId: placement.productId,
        mode: restore ? 'ADD' : 'REMOVE',
        evidence: {
          dari: 'Performa Video',
          status: video.delivery || null,
          roas: video.lifetime?.roas != null ? Number(video.lifetime.roas.toFixed(2)) : null,
          spend: Math.round(video.lifetime?.cost || 0),
          omzet: Math.round(video.lifetime?.revenue || 0),
        },
      })
      onQueued(`${restore ? 'Pemulihan' : 'Exclude'} diajukan — buka 🔔 untuk menyetujui. Status baru terlihat ±20 menit setelah dieksekusi.`)
      onClose()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="glass-modal w-full max-w-md rounded-2xl border border-line/15 shadow-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-strong flex items-center gap-1.5">
              <Ban className={`w-4 h-4 ${restore ? 'text-emerald-400' : 'text-red-400'}`} />
              {restore ? 'Pulihkan ke rotasi' : 'Keluarkan dari rotasi'}
            </h3>
            <p className="text-xs text-ink-muted truncate mt-0.5">
              @{video.account || '?'} · {String(video.title || video.videoId).slice(0, 48)}
            </p>
            <p className="text-[11px] text-ink-faint truncate">{placement.campaignName || placement.campaignId}</p>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1"><X className="w-4 h-4" /></button>
        </div>

        <p className="text-xs text-ink-muted leading-relaxed">
          {restore
            ? 'Video ini akan kembali ikut kolam auto-selection campaign tersebut.'
            : 'Video ini berhenti ditayangkan di campaign tersebut. Belanja yang sudah berjalan tidak dikembalikan, dan video tetap bisa dipulihkan nanti.'}
        </p>
        {video.lifetime?.cost > 0 && !restore && (
          <p className="mt-2 text-[11px] text-amber-400/90">
            Video ini sudah membelanjakan {rp(video.lifetime.cost)} dengan omzet {rp(video.lifetime.revenue)}
            {video.lifetime.roas != null && ` (ROAS ${video.lifetime.roas.toFixed(2)}×)`}.
          </p>
        )}
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button disabled={busy} onClick={submit}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-40 ${restore ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />} Ajukan ke antrean 🔔
          </button>
          <span className="text-[11px] text-ink-faint">Eksekusi setelah kamu Setujui.</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
