// Drawer detail eksperimen. Semua isi dari data yang sudah ada: titik ukur
// tersimpan, vonis live + alasannya (classifyOutcome), deret harian
// loadExperimentDaily, potret sesi boost (migrasi 0048), daftar tanggal data
// dari context. Bagian harian (kartu rentang, grafik, tabel, pembanding,
// retensi) ada di ExperimentDailyView.
// PENCATATAN MURNI: Tutup/Hapus hanya mengubah baris eksperimen — TIDAK
// menghentikan boost/campaign di TikTok (eksekusi nyata = jalur approval).
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink } from 'lucide-react'
import { loadExperimentDaily, loadExperimentIdentity } from '../../data/gmvmaxImports'
import { loadBoostSessions } from '../../data/gmvmaxBoostSessions'
import { loadVideoMeta } from '../../data/gmvmaxVideoMeta'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import {
  closeExperiment, deleteExperiment, EXPERIMENT_TYPES, CONCLUSION_LABEL,
} from '../../data/gmvmaxExperiments'
import { liveConclusion } from '../../utils/gmvmaxExperimentLive'
import {
  dayOne, windowOf, windowStats, windowJudged, resolveRuleConfig, actionDirection, isContaminated, contaminationInWindow,
} from '../../gmvmax/skills/experimentWindows.mjs'
import { latestSeenOf } from '../../utils/gmvmaxExperimentAlerts'
import {
  addDaysISO, aggregateDays, boostWindow, buildCalendar, checkpointKind, fmtDayID, fmtSpanID, fmtStartWib,
  latestWorkerSnapshot, pickBoostSession, spanDaysByDate,
} from '../../utils/gmvmaxExperimentDaily'
import {
  fmtRpID, fmtRpRbID, fmtRpTinyID, fmtRoiID, fmtRoiVsFloorID, fmtFloorID, fmtSignedX, reasonTextID, verdictReasonID, CONFIDENCE_LABEL, STATUS_LABEL,
} from '../../utils/gmvmaxExperimentFormat'
import ExperimentDailyView from './ExperimentDailyView'

const typeLabel = (t) => (EXPERIMENT_TYPES.find(([k]) => k === t)?.[1]) || t
const CONC = {
  SUSTAINABLE_WINNER: 'text-emerald-400', WINNER_CANDIDATE: 'text-emerald-400',
  TEMPORARY_SPIKE: 'text-amber-400', WEAK: 'text-red-400',
  INCONCLUSIVE: 'text-ink-muted', STOPPED: 'text-ink-muted', DATA_INSUFFICIENT: 'text-ink-faint',
}
const CK_TEXT = {
  nospend: 'tanpa belanja', closed: 'tidak diukur', uncomputed: 'belum dihitung',
  missing: 'data tidak masuk', pending: 'menunggu data',
}
// Hanya dua jenis ini yang benar-benar "boost"; sisanya (kecualikan kreatif,
// ubah budget/ROAS, pasang kode spark, …) disebut "perubahan".
const BOOST_TYPES = new Set(['MANUAL_BOOST', 'ACCELERATE_TESTING'])
const bidLabel = (b) => (b === 'CREATIVE_NO_BID' ? 'Creative Boost' : b === 'NO_BID' ? 'Max Delivery' : (b || 'Sesi boost'))

const SubHead = ({ children }) => (
  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint mb-2">{children}</p>
)

// Satu titik ukur = ROI SATU hari. Belanjanya selalu ditulis di sebelahnya:
// 41x dari belanja Rp6 ribu bukan hal yang sama dengan 41x dari Rp30 ribu.
function CheckpointChip({ c, kind, roiFloor }) {
  const tone = roiFloor == null ? 'text-ink' : Number(c.roi) >= roiFloor ? 'text-emerald-400' : 'text-red-400'
  return (
    <div className="rounded-lg bg-fill/[0.04] px-2.5 py-1.5 min-w-0">
      <p className="text-[11px] text-ink-muted">{c.label} · {fmtDayID(c.date)}</p>
      {kind === 'measured' ? (
        <p className="truncate">
          <b className={`text-[13px] font-semibold tabular-nums ${tone}`}>{fmtRoiID(Number(c.roi))}</b>
          {c.spend != null && <span className="text-[11px] text-ink-faint"> belanja {fmtRpID(Number(c.spend))}</span>}
        </p>
      ) : <p className="text-xs text-ink-faint">{CK_TEXT[kind]}</p>}
    </div>
  )
}

// Satu jendela vonis (aturan v2): ROI GABUNGAN + belanja + berapa hari
// berbelanja yang di atas ambang. Warna hanya bila jendelanya memang dinilai
// (lengkap dan belanjanya mencapai lantai) — ROI dari belanja receh tetap
// ditulis, tetapi tidak diberi warna pemenang/lemah.
function WindowChip({ w, cfg, direction }) {
  const st = windowStats(w, cfg)
  // Satu syarat dengan aturan vonis (cukup hari berdata, lantai, arah aksi).
  const judged = windowJudged(w, cfg, direction)
  const roi = w.spend > 0 ? w.revenue / w.spend : null
  const tone = !judged ? 'text-ink' : roi >= cfg.roiFloor ? 'text-emerald-400' : 'text-red-400'
  const note = w.counted === 0 ? (w.complete ? 'tidak ada data' : 'menunggu data')
    : !w.complete ? `baru ${w.counted} dari ${w.days} hari`
      : w.spend < cfg.spendFloor ? `belanja di bawah lantai ${fmtRpRbID(cfg.spendFloor)}`
        : cfg.roiFloor != null ? `${st.above} dari ${st.spendDays} hari berbelanja ≥ ${fmtFloorID(cfg.roiFloor)}`
          : `${st.spendDays} hari berbelanja`
  return (
    <div className="rounded-lg bg-fill/[0.04] px-2.5 py-1.5 min-w-0">
      <p className="text-[11px] text-ink-muted">{w.label} · {fmtSpanID(w.from, w.to)}</p>
      {/* Belanja di bawah lantai: ROI-nya tidak ditonjolkan (Rp450 bisa "200x"). */}
      {w.spend > 0 && w.spend < cfg.spendFloor ? (
        <p className="truncate text-[13px] font-semibold tabular-nums text-ink">belanja {fmtRpTinyID(w.spend)}</p>
      ) : (
        <p className="truncate">
          <b className={`text-[13px] font-semibold tabular-nums ${tone}`}>{fmtRoiVsFloorID(roi, cfg.roiFloor)}</b>
          <span className="text-[11px] text-ink-faint"> belanja {fmtRpRbID(w.spend)}</span>
        </p>
      )}
      <p className="text-[10.5px] text-ink-faint truncate">{note}{w.missing > 0 ? ` · ${w.missing} hari data tidak masuk` : ''}</p>
    </div>
  )
}

// Kejadian yang membuat eksperimen "tercampur", dari kolom contamination.
// Hanya kejadian di dalam hari ke-1..7. Tanggal aksi pada baris lama tersimpan
// sebagai tanggal UTC, sehingga aksi pukul 00.00–06.59 WIB tampak sehari lebih
// awal — bahkan sebelum hari ke-1. Aksi itu pasti terjadi SETELAH mulai, jadi
// tanggalnya tidak pernah ditampilkan lebih awal dari hari ke-1.
function mixText(exp) {
  const k = contaminationInWindow(exp)
  const list = k ? k.kept : []
  const tgl = (x) => fmtDayID(x.jenis !== 'setelan_campaign' && k && x.tanggal < k.day1 ? k.day1 : x.tanggal)
  return list.slice(0, 2).map(x => (x.jenis === 'setelan_campaign'
    ? `${tgl(x)}: ${x.bidang || 'setelan campaign'} diubah${x.dari != null && x.jadi != null ? ` (${x.dari} → ${x.jadi})` : ''}`
    : `${tgl(x)}: aksi lain di campaign/video yang sama`)).join(' · ') + (list.length > 2 ? ` · +${list.length - 2} lagi` : '')
}

// Cadangan saat deret harian kosong/gagal: titik ukur tersimpan tetap terbaca.
function SavedCheckpoints({ rows, kindOf, roiFloor }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-ink-faint">
          {['Titik ukur', 'Tanggal', 'ROI', 'Selisih', 'Omzet', 'Belanja'].map(h => <th key={h} className="text-left font-semibold py-1.5 pr-2">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(c => {
          const kind = kindOf(c)
          return (
            <tr key={c.label} className="border-t border-line/10">
              <td className="py-1.5 pr-2 font-medium text-ink">{c.label}</td>
              <td className="py-1.5 pr-2 text-ink-muted">{fmtDayID(c.date)}</td>
              <td className={`py-1.5 pr-2 ${kind !== 'measured' ? 'text-ink-faint' : roiFloor == null ? 'text-ink' : Number(c.roi) >= roiFloor ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}`}>
                {kind === 'measured' ? fmtRoiID(Number(c.roi)) : CK_TEXT[kind]}
              </td>
              <td className="py-1.5 pr-2 text-ink-muted">{c.roi_delta_vs_baseline != null ? fmtSignedX(Number(c.roi_delta_vs_baseline)) : '—'}</td>
              <td className="py-1.5 pr-2 text-ink-muted">{c.revenue != null ? fmtRpID(Number(c.revenue)) : '—'}</td>
              <td className="py-1.5 text-ink-muted">{c.spend != null ? fmtRpID(Number(c.spend)) : '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// cfg: setelan vonis yang SAMA dengan daftar ({ roiFloor, spendFloor } hasil
// resolveRuleConfig) — drawer tidak mengambil ulang sendiri, supaya vonisnya
// tak pernah berbeda dari baris yang baru diklik.
export default function ExperimentDetailDrawer({ exp: e, cfg: cfgIn, onClose, onChanged, onNavigate }) {
  // null = memuat. Deret harian disimpan BERSAMA daftar tanggal data yang
  // berlaku saat ia dimuat, supaya keduanya tak pernah beda umur: daftar di
  // context menyegarkan diri (fokus tab, tiap 10 menit), dan tanggal yang ada di
  // daftar tapi belum ada di deret akan terbaca sebagai "tak tayang".
  const [daily, setDaily] = useState(null)
  const [dailyErr, setDailyErr] = useState(false)
  const [allSessions, setAllSessions] = useState([])
  const [sessionsReady, setSessionsReady] = useState(false)
  // Potret worker terbaru SAAT sesi dimuat. Saksi "boost sudah tak terlihat"
  // harus seumur dengan daftar sesinya: saksi yang lebih baru + sesi yang basi
  // = boost yang masih jalan tertulis sudah dicabut.
  const [workerSnap, setWorkerSnap] = useState(null)
  const [ident, setIdent] = useState() // undefined=memuat · null=tak ketemu · objek={videoTitle,…}
  const [metaAcct, setMetaAcct] = useState(null) // fallback akun dari cache oEmbed
  const { productNames, imports, freshness } = useGmvMax()
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const liveLast = freshness?.date || null
  // Tanggal yang datanya masuk (semua potret current) — pembeda "tak tayang"
  // dari "data tidak masuk" tanpa query tambahan.
  const liveSnaps = useMemo(
    () => new Set((imports || []).map(i => i.snapshot_date).filter(Boolean)), [imports])
  const liveSpans = useMemo(() => spanDaysByDate(imports || []), [imports])
  // Muat ulang hanya bila ISI daftar potret berubah, bukan tiap kali context
  // membuat larik baru. Dari id (tanda tangan yang sama dengan context): unggah
  // ulang/koreksi tanggal lama mengganti id tanpa mengubah jumlah maupun
  // tanggal terakhir.
  const importsSig = (imports || []).map(i => i.id).join('|')

  useEffect(() => {
    let on = true
    const at = { snapshotDates: liveSnaps, lastDataDate: liveLast, spanByDate: liveSpans }
    loadExperimentDaily({ videoId: e.creative_video_id, productId: e.product_id, campaignId: e.campaign_id })
      .then(rows => { if (on) { setDaily({ rows, ...at }); setDailyErr(false) } })
      .catch(() => { if (on) { setDaily({ rows: [], ...at }); setDailyErr(true) } })
    return () => { on = false }
    // liveSnaps/liveSpans sengaja tak masuk dependensi: keduanya berganti
    // identitas tiap context memuat ulang; importsSig mewakili isinya.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.id, e.creative_video_id, e.product_id, e.campaign_id, importsSig, retry])

  useEffect(() => {
    let on = true
    if (e.creative_video_id) {
      // Semua sesi disimpan (bukan hanya milik video ini): potret terakhir dari
      // sesi mana pun menentukan apakah sebuah sesi "tak terlihat lagi".
      const snapAt = latestWorkerSnapshot(imports || [])
      loadBoostSessions({ days: 60 })
        .then(all => { if (on) { setAllSessions(all); setWorkerSnap(snapAt) } })
        .catch(() => {})
        .finally(() => { if (on) setSessionsReady(true) })
      // Kolom AKUN export sering kosong — cache oEmbed jadi cadangan nama kreator.
      loadVideoMeta([e.creative_video_id])
        .then(m => { if (on) setMetaAcct(m[e.creative_video_id] || null) })
        .catch(() => {})
    }
    loadExperimentIdentity({ videoId: e.creative_video_id, productId: e.product_id, campaignId: e.campaign_id })
      .then(r => { if (on) setIdent(r) })
      .catch(() => { if (on) setIdent(null) })
    return () => { on = false }
    // Sesi dimuat ulang bersama daftar potret (importsSig mewakili `imports`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.id, e.creative_video_id, e.product_id, e.campaign_id, importsSig])

  useEffect(() => {
    const onKey = (ev) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Hari ke-1 = tanggal WIB mulai (aturan v2). Titik ukur LAMA masih bertanggal
  // dari potongan UTC — dipakai hanya untuk tanggal jatuh tempo chip lama.
  const startDate = dayOne(e)
  const legacyStart = String(e.start_at || '').slice(0, 10) || null
  const lastDataDate = daily ? daily.lastDataDate : liveLast
  const calendar = useMemo(() => (daily && daily.rows.length && startDate ? buildCalendar({
    daily: daily.rows, startDate,
    baselineStart: e.baseline_start || null, baselineEnd: e.baseline_end || null,
    snapshotDates: daily.snapshotDates, lastDataDate: daily.lastDataDate, spanByDate: daily.spanByDate,
  }) : []), [daily, startDate, e.baseline_start, e.baseline_end])
  const noun = BOOST_TYPES.has(e.experiment_type) ? 'boost' : 'perubahan'
  // Formulir manual hanya menyimpan tanggal — jangan menulis jam karangan.
  const startLabel = fmtStartWib(e.start_at, { dateOnly: !e.source_session_id && !e.source_approval_id })

  const cfg = resolveRuleConfig(cfgIn || {})
  const { roiFloor, spendFloor } = cfg
  const oc = liveConclusion(e, cfg)
  const isV2 = oc.format === 'v2'
  const direction = actionDirection(e)
  // Dua pembatas vonis dari LUAR eksperimen.
  const mixed = isContaminated(e)
  const overlapDay = isV2 ? (windowOf(e.checkpoints, 'w7')?.overlap_day ?? null) : null
  // Akibatnya hanya ditulis bila vonis ini MEMANG terkena pembatas — bukan pada
  // "Data kurang" / aksi berhenti / ambang kosong, yang sebabnya lain.
  const limitNote = oc.code === 'W7_WIN_CAPPED' ? ' Karena itu vonisnya dibatasi paling tinggi "Kandidat pemenang".'
    : oc.code === 'W7_WEAK' || oc.code === 'W7_SPIKE' || /^W3_/.test(oc.code || '') ? ' Karena itu keyakinannya rendah.' : ''
  const checkpoints = Array.isArray(e.checkpoints) ? e.checkpoints : []
  const w3 = windowOf(checkpoints, 'w3'), w7 = windowOf(checkpoints, 'w7')
  // Tiga titik ukur selalu tampil: yang tersimpan, atau tanggal jatuh temponya
  // bila eval harian belum menuliskannya.
  const ckRows = ['H+1', 'H+3', 'H+7'].map(label => {
    const saved = checkpoints.find(c => c.label === label)
    if (saved) return saved
    return { label, date: legacyStart ? addDaysISO(legacyStart, +label.slice(2)) : null, roi: null }
  })
  const stateByDate = new Map(calendar.map(d => [d.date, d.state]))
  // Kalender kosong (deret harian kosong/gagal, eksperimen tanpa sasaran): saksinya
  // daftar tanggal potret — server menulis satu entri per tanggal potret, jadi
  // potret ada + titik ukur belum terisi = belum dihitung, bukan "data tidak masuk".
  const snapsNow = daily ? daily.snapshotDates : liveSnaps
  const kindOf = (c) => checkpointKind(c, {
    status: e.status, lastDataDate,
    dayState: stateByDate.get(c.date) || (snapsNow.has(c.date) ? 'idle' : null),
  })
  // Batas pengaman kalender membuang hari TERBARU — jangan diam-diam.
  const calEnd = calendar.length ? calendar[calendar.length - 1].date : null
  const lastRow = daily?.rows.length ? daily.rows[daily.rows.length - 1].date : null
  const calCut = !!calEnd && [lastDataDate, lastRow].some(d => d && d > calEnd)

  const sessions = allSessions.filter(s => s.item_id === e.creative_video_id)
  const latestSeen = latestSeenOf(allSessions)
  // Hanya eksperimen boost yang punya "sesi boost-nya"; untuk jenis lain, sesi
  // boost di video yang sama adalah kejadian LAIN (tetap dicatat di Riwayat).
  const session = noun === 'boost' && e.creative_video_id ? pickBoostSession(sessions, e, startDate) : null
  // "Tak terlihat lagi" butuh potret yang LEBIH BARU daripada penampakan terakhir
  // sesi: stempel sesi mana pun, atau potret harian worker (ditulis di run yang sama).
  const witness = [latestSeen && String(latestSeen).slice(0, 10), workerSnap]
    .filter(Boolean).sort().pop() || null
  const boost = session ? boostWindow(session, witness) : null

  const preAgg = aggregateDays(calendar.filter(d => d.phase === 'pre'))
  // Sebanding atau tidak: keputusan SERVER dulu (penanda di titik ukur
  // tersimpan), baru hitungan peramban. null = belum bisa dinilai → selisih
  // ROI dan biaya/order disembunyikan, bukan ditebak.
  const srvBase = checkpoints.find(c => c.baseline_state)?.baseline_state
  const preComparable = srvBase === 'DISCLOSED_NOT_COMPARABLE' ? false : srvBase === 'DISCLOSED' ? true
    : (preAgg.counted > 0 && spendFloor != null ? preAgg.cost >= spendFloor : null)
  const deltas = ckRows.filter(c => c.roi_delta_vs_baseline != null)

  async function act(fn) {
    setBusy(true)
    try { await fn(e.id); onChanged(); onClose() }
    catch (err) { alert('Gagal: ' + err.message); setBusy(false) }
  }
  function jumpToVideo() {
    try { sessionStorage.setItem('gmvJumpVideo', e.creative_video_id) } catch { /* storage penuh/di-block — lompat tanpa prefill */ }
    onClose()
    onNavigate?.('gmv_overview')
  }

  // Kreator: akun dari creatives dulu; kosong → cache oEmbed (handle + nama tampilan).
  const creatorHandle = metaAcct?.username || null
  const creatorLabel = ident?.tiktokAccount
    || (metaAcct?.username ? `@${metaAcct.username}${metaAcct.authorName ? ` (${metaAcct.authorName})` : ''}` : metaAcct?.authorName)
    || null
  const targetNote = e.creative_video_id
    ? `Angka di bawah = seluruh penayangan video ini di GMV Max, semua campaign${noun === 'boost' ? ' — bukan khusus sesi boost' : ''}.`
    : e.product_id ? 'Angka di bawah = jumlah semua materi iklan produk ini di GMV Max, semua campaign.'
      : e.campaign_id ? 'Angka di bawah = jumlah semua materi iklan di campaign ini.'
        : 'Eksperimen ini tidak punya sasaran (video, produk, atau campaign): titik ukur dihitung untuk seluruh toko dan data harian tidak tersedia.'
  const conf = CONFIDENCE_LABEL[oc.confidence]
  const viewReady = !e.creative_video_id || sessionsReady

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="glass-modal absolute right-0 top-0 h-full w-[600px] max-w-[94vw] border-l border-line/15 overflow-y-auto p-5">
        <button onClick={onClose} className="absolute top-4 right-4 text-ink-faint hover:text-ink" aria-label="Tutup">
          <X className="w-4 h-4" />
        </button>

        {/* Header sasaran */}
        <div className="flex items-center gap-2 flex-wrap pr-8">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${e.status === 'RUNNING'
            ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' : 'text-ink-muted border-line/30 bg-fill/5'}`}>{STATUS_LABEL[e.status] || e.status}</span>
          <span className="text-[11px] text-ink-faint">{typeLabel(e.experiment_type)}</span>
          <span className="text-[11px] text-ink-faint">· mulai {startLabel}{lastDataDate ? ` · data sampai ${fmtDayID(lastDataDate)}` : ''}</span>
        </div>
        <p className="text-[15px] font-semibold text-ink-strong mt-2">{e.treatment || '—'}</p>

        {/* Identitas sasaran: video apa, kreator siapa, campaign mana. Nama dari
            baris creatives terbaru; akun kosong → cadangan cache oEmbed; produk
            di-label-kan dari master produk bila kodenya cocok. */}
        <div className="mt-3 rounded-xl border border-line/15 bg-surface p-3 text-xs space-y-1.5">
          {e.creative_video_id && (
            <div className="flex items-start gap-2">
              <span className="text-ink-faint shrink-0 w-16">Video</span>
              <span className="text-ink min-w-0">
                {ident === undefined ? 'memuat…' : (ident?.videoTitle || <span className="font-mono break-all">{e.creative_video_id}</span>)}
                {' '}
                <a href={`https://www.tiktok.com/@${creatorHandle || 'x'}/video/${e.creative_video_id}`}
                  target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
                  className="text-accent hover:underline whitespace-nowrap">buka ↗</a>
              </span>
            </div>
          )}
          {e.creative_video_id && (
            <div className="flex items-start gap-2">
              <span className="text-ink-faint shrink-0 w-16">Kreator</span>
              <span className="text-ink">{creatorLabel || <span className="text-ink-faint">tak dikenal — nama akun tidak ada di data TikTok</span>}</span>
            </div>
          )}
          {(ident?.campaignNames?.length || e.campaign_id) && (
            <div className="flex items-start gap-2">
              <span className="text-ink-faint shrink-0 w-16">Campaign</span>
              <span className="text-ink min-w-0 break-words">{ident?.campaignNames?.length ? ident.campaignNames.join(' · ') : <span className="font-mono break-all">{e.campaign_id}</span>}</span>
            </div>
          )}
          {(e.product_id || (ident?.productIds?.length ?? 0) > 0) && (
            <div className="flex items-start gap-2">
              <span className="text-ink-faint shrink-0 w-16">Produk</span>
              <span className="text-ink min-w-0 break-words">
                {(e.product_id ? [e.product_id] : ident.productIds).map(pid =>
                  productNames?.[String(pid).trim()] || pid).join(' · ')}
              </span>
            </div>
          )}
          <p className="text-[11px] text-ink-faint pt-1">{targetNote}</p>
        </div>

        {/* Vonis + dasar vonis. Isinya TIDAK berubah saat rentang di bawah diganti. */}
        <div className="mt-4 rounded-xl border border-line/15 bg-fill/[0.03] p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${mixed && !isV2 ? 'text-ink-muted' : (CONC[oc.conclusion] || 'text-ink-muted')}`}>{CONCLUSION_LABEL[oc.conclusion] || oc.conclusion}</span>
            {conf && <span className="text-[11px] rounded-md border border-line/15 bg-fill/5 px-2 py-0.5 text-ink-muted">keyakinan <b className="text-ink">{conf}</b></span>}
            <span className="text-[11px] rounded-md border border-line/15 bg-fill/5 px-2 py-0.5 text-ink-muted">ambang ROI <b className="text-ink">{roiFloor != null ? fmtFloorID(roiFloor) : 'belum diisi'}</b></span>
          </div>
          {mixed && (
            <p className="mt-2 text-xs text-amber-400">
              <b>Tercampur</b> — ada perubahan lain di jendela ukur{mixText(e) ? `: ${mixText(e)}` : ''}.
              {!isV2 ? ' Vonis ini jangan dipakai menyimpulkan.' : limitNote}
            </p>
          )}
          {overlapDay != null && (
            <p className="mt-2 text-xs text-amber-400">
              <b>Ada boost lain</b> pada video/produk yang sama mulai hari ke-{overlapDay} — hasil jendela ini bukan dari {noun} ini saja.{limitNote}
            </p>
          )}
          {isV2 ? (
            <>
              <p className="mt-2 text-xs text-ink">{verdictReasonID(oc, { noun })}</p>
              <p className="mt-2.5 text-[11px] text-ink-faint">Dasar vonis — total dua jendela, semua hari dijumlah</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {w3 && <WindowChip w={w3} cfg={cfg} direction={direction} />}
                {w7 && <WindowChip w={w7} cfg={cfg} direction={direction} />}
              </div>
              {oc.provisional && (
                <p className="mt-2 text-[11px] text-ink-muted">Vonis ini masih <b className="text-ink">sementara</b> — jendela 7 hari belum lengkap.</p>
              )}
            </>
          ) : oc.code === 'NOT_EVALUATED' ? (
            // Baru dicatat: evaluator akan menulis dua jendela (hari ke-1–3 dan
            // ke-1–7) — jangan menjanjikan tiga titik ukur lama.
            <p className="mt-2 text-xs text-ink-muted">{verdictReasonID(oc, { noun })} Vonis memakai total hari ke-1–3 dan hari ke-1–7{startDate ? ` (${fmtSpanID(startDate, addDaysISO(startDate, 6))})` : ''}.</p>
          ) : (
            <>
              <p className="mt-2.5 text-[11px] text-ink-faint">Dasar vonis — ROI satu hari di tiga titik ukur</p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {ckRows.map(c => <CheckpointChip key={c.label} c={c} kind={kindOf(c)} roiFloor={roiFloor} />)}
              </div>
              {(oc.reasons || []).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {oc.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-ink-muted flex gap-2"><span className="text-ink-faint">·</span><span>{reasonTextID(r, noun)}</span></li>
                  ))}
                </ul>
              )}
              {oc.format === 'legacy' && oc.conclusion !== 'STOPPED' && (
                <p className="mt-2 text-[11px] text-ink-muted">
                  Vonis ini masih dari aturan lama (tiga hari tunggal). Server belum menghitung ulang dengan total hari ke-1–3 dan ke-1–7{calendar.length > 0 ? ' — totalnya sudah bisa dilihat di kartu di bawah' : ''}.
                </p>
              )}
              {preComparable === false ? (
                <p className="mt-1 text-[11px] text-ink-faint">
                  Selisih terhadap sebelum {noun}: tidak dibandingkan — belanja sebelum {noun}{preAgg.counted > 0 ? ` ${fmtRpID(preAgg.cost)}` : ''}{` di bawah lantai belanja ${fmtRpRbID(spendFloor)}`}.
                </p>
              ) : deltas.length > 0 && (
                <p className="mt-1 text-[11px] text-ink-faint">
                  Selisih ROI terhadap sebelum {noun}{preAgg.roi != null ? ` (${fmtRoiID(preAgg.roi)})` : ''}: {deltas.map(c => `${c.label} ${fmtSignedX(Number(c.roi_delta_vs_baseline))}`).join(' · ')}
                </p>
              )}
            </>
          )}
        </div>

        {/* Data harian: kartu rentang → grafik → tabel → pembanding → retensi */}
        {/* Sasaran video menunggu sesi boost juga: kartu keempat bergantung padanya,
            dan kartu yang berganti setelah tampil membuat klik salah sasaran. */}
        {(daily == null || (calendar.length > 0 && !viewReady)) && <p className="mt-5 text-xs text-ink-faint py-6 text-center">Memuat data harian…</p>}
        {daily != null && calendar.length === 0 && (
          <div className="mt-5">
            <SubHead>{isV2 || oc.code === 'NOT_EVALUATED' ? 'Data harian' : 'Titik ukur tersimpan'}</SubHead>
            <p className="text-xs text-ink-faint mb-2">
              {dailyErr ? 'Gagal memuat data harian.' : 'Belum ada data harian untuk sasaran ini.'}
              {dailyErr && (
                <button onClick={() => { setDaily(null); setRetry(n => n + 1) }} className="ml-2 text-accent hover:underline">Coba lagi</button>
              )}
            </p>
            {!isV2 && oc.code !== 'NOT_EVALUATED' && <SavedCheckpoints rows={ckRows} kindOf={kindOf} roiFloor={roiFloor} />}
          </div>
        )}
        {calCut && viewReady && (
          <p className="mt-4 text-[11px] text-amber-400">
            Hanya {calendar.length} hari pertama yang ditampilkan (sampai {fmtDayID(calEnd)} {calEnd.slice(0, 4)}); hari sesudahnya tidak ikut dihitung di bawah.
          </p>
        )}
        {calendar.length > 0 && viewReady && (
          <ExperimentDailyView key={e.id} calendar={calendar} roiFloor={roiFloor} spendFloor={spendFloor}
            preComparable={preComparable} checkpoints={isV2 ? [] : checkpoints} boost={boost} isVideo={!!e.creative_video_id}
            startLabel={startLabel} noun={noun} />
        )}

        {/* Riwayat — catatan kejadian saja; angkanya sudah ada di atas */}
        <div className="mt-5">
          <SubHead>Riwayat</SubHead>
          <ul className="space-y-1.5">
            {boost?.ended && (
              <li className="text-xs text-ink-muted flex gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-faint mt-1.5 shrink-0" />
                <span><span className="font-mono text-ink-faint mr-1.5">{fmtDayID(addDaysISO(boost.lastSeen, 1))}</span>Boost <b className="text-ink">tak terlihat lagi</b> di Seller Centre (perkiraan)</span>
              </li>
            )}
            {sessions.map(s => {
              const w = boostWindow(s, witness)
              if (!w) return null
              return (
                <li key={s.session_id} className="text-xs text-ink-muted flex gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <span><span className="font-mono text-ink-faint mr-1.5">{fmtDayID(w.firstSeen)}</span>Sesi <b className="text-ink">{bidLabel(s.bid_type)}</b>{s.budget != null ? ` · ${fmtRpID(Number(s.budget))}` : ''} · terlihat s/d {fmtDayID(w.lastSeen)} (perkiraan)</span>
                </li>
              )
            })}
            <li className="text-xs text-ink-muted flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
              <span><span className="font-mono text-ink-faint mr-1.5">{startLabel.split(',')[0]}</span><b className="text-ink">Dicatat sebagai eksperimen</b> — {typeLabel(e.experiment_type)}</span>
            </li>
            {e.baseline_start && e.baseline_end && (
              <li className="text-xs text-ink-muted flex gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-faint mt-1.5 shrink-0" />
                <span><span className="font-mono text-ink-faint mr-1.5">{fmtSpanID(e.baseline_start, e.baseline_end)}</span>Jendela sebelum {noun}</span>
              </li>
            )}
          </ul>
        </div>

        {/* Footer aksi */}
        <div className="mt-5 pt-4 border-t border-line/10 flex items-center gap-2 flex-wrap">
          {e.creative_video_id && onNavigate && (
            <button onClick={jumpToVideo} className="text-xs px-3 py-1.5 rounded-lg bg-accent/15 text-accent font-medium hover:bg-accent/20 inline-flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Lihat di Performa Video
            </button>
          )}
          {e.status === 'RUNNING' && (
            <span className="ml-auto flex items-center gap-2">
              <button disabled={busy} onClick={() => act(() => closeExperiment(e))}
                title="Menutup catatan eksperimen saja — tidak menghentikan iklan di TikTok"
                className="text-xs text-ink-muted border border-line/25 rounded-lg px-2.5 py-1.5 hover:bg-fill/5 disabled:opacity-50">Tutup</button>
              <button disabled={busy} onClick={() => { if (confirm('Hapus eksperimen ini?')) act(deleteExperiment) }} className="text-xs text-red-400/80 border border-red-500/20 rounded-lg px-2.5 py-1.5 hover:bg-red-500/5 disabled:opacity-50">Hapus</button>
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          Tutup/Hapus hanya mengubah catatan eksperimen — TIDAK menghentikan boost/campaign di TikTok. Menghentikan iklan tetap lewat Seller Centre atau tombol eksekusi yang perlu persetujuan.
        </p>
      </aside>
    </div>,
    document.body,
  )
}
