// Modal detail creative per produk (desain disetujui user 2026-07-12):
// funnel agregat Impressions→Clicks→Orders→Revenue + Cost·ROAS·CPO, tab status
// urutan In queue → Learning → Delivering, tabel per-video (Cost/Revenue/ROAS/
// Orders/CTR/CVR/Hook 2s/bar retensi). Baca-saja dari rollup yang sudah ada.
import { useState, useMemo, useEffect } from 'react'
import { X, ChevronDown, Loader2, Radar, Plus } from 'lucide-react'
import { fmtRpC, fmtRoasX, VideoLabel } from './ui'
import { loadExcludedHistory, loadProductVideoIds, loadCodeVideos, loadVideosDaily } from '../../data/gmvmaxImports'
import { boostStatus, boostWindow, windowFromDates, sumDaily } from '../../utils/boostPerf'

// Dua skala berbeda di data: ctr/cvr dihitung rollup sebagai PECAHAN (0–1),
// sedangkan view-rate (vr2s..vr100) tersimpan sebagai PERSEN (0–100) apa adanya
// dari xlsx/API. Jangan disamakan formatternya.
const pct = (v, d = 1) => (v == null ? '—' : (v * 100).toFixed(d) + '%')      // pecahan 0–1
const pctRaw = (v, d = 0) => (v == null ? '—' : v.toFixed(d) + '%')           // persen 0–100

// Urutan tab sesuai keputusan user: In queue → Learning → Delivering, lalu
// Excluded (status TikTok) dan tab pipeline Boost Center (internal):
// "Kode masuk" = ada_kode, "Boosted" = terpasang.
const TABS = [
  { key: 'in_queue',   label: 'In queue',   dot: 'bg-amber-400',   on: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  { key: 'learning',   label: 'Learning',   dot: 'bg-blue-400',    on: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  { key: 'delivering', label: 'Delivering', dot: 'bg-emerald-400', on: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  { key: 'excluded',   label: 'Excluded',   dot: 'bg-red-400',     on: 'bg-red-500/15 text-red-400 border-red-500/25' },
]
const BOOST_TABS = [
  { key: 'ada_kode', label: 'Kode masuk', dot: 'bg-sky-400',    on: 'bg-sky-500/15 text-sky-400 border-sky-500/25' },
  { key: 'boosted',  label: 'Boosted',    dot: 'bg-violet-400', on: 'bg-violet-500/15 text-violet-400 border-violet-500/25' },
]
const ALL_TABS = [...TABS, ...BOOST_TABS]
// "Boosted" = pernah/sedang di-boost: punya rentang tanggal ATAU status terpasang.
const isBoosted = (b) => !!b && (!!b.boost_start || b.status === 'terpasang')
const fmtDate = (iso) => {
  if (!iso) return '?'
  const d = new Date(`${iso}T00:00:00`)
  return isNaN(d) ? iso : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

// Bar retensi mini 25/50/75/100% durasi — tinggi relatif thd bar tertinggi,
// tooltip memuat angka persisnya. Null semua (snapshot lama) → "—".
function RetentionBars({ funnel }) {
  const vals = ['vr25', 'vr50', 'vr75', 'vr100'].map(k => funnel?.[k])
  if (vals.every(v => v == null)) return <span className="text-ink-faint">—</span>
  const max = Math.max(...vals.map(v => v ?? 0), 0.0001)
  const tip = `25% ${pctRaw(vals[0], 1)} · 50% ${pctRaw(vals[1], 1)} · 75% ${pctRaw(vals[2], 1)} · 100% ${pctRaw(vals[3], 1)}`
  return (
    <span className="inline-flex items-end gap-[2px] h-3.5 align-middle" title={tip}>
      {vals.map((v, i) => (
        <i key={i} className="inline-block w-1 rounded-[1px] bg-blue-500/85"
          style={{ height: `${Math.max(2, Math.round(((v ?? 0) / max) * 14))}px` }} />
      ))}
    </span>
  )
}

// Chip status boost pada baris video: Berlangsung (hijau) / Selesai (abu),
// opsional dengan rentang tanggalnya (di tab Boosted).
function BoostChip({ b, withRange }) {
  const st = boostStatus(b)
  const w = boostWindow(b)
  const range = w ? `${fmtDate(w.start)}${w.ongoing ? ' → kini' : ` – ${fmtDate(w.end)}`} · ${w.lengthDays} hari` : null
  const tone = st === 'live' ? 'bg-emerald-500/15 text-emerald-400'
    : st === 'ended' ? 'bg-fill/10 text-ink-faint'
    : 'bg-violet-500/15 text-violet-400'
  const label = st === 'live' ? 'Berlangsung' : st === 'ended' ? 'Selesai' : 'boosted'
  return (
    <span className="inline-flex items-center gap-1 mt-0.5" title={b.boost_code ? `Kode: ${b.boost_code}` : undefined}>
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ${tone}`}>
        {st && <span className={`w-1 h-1 rounded-full ${st === 'live' ? 'bg-emerald-400' : 'bg-ink-faint'}`} />}
        {label}
      </span>
      {withRange && range && <span className="text-[9px] text-ink-faint">{range}</span>}
    </span>
  )
}

function FunnelCell({ label, value, sub, subTone = 'text-ink-faint' }) {
  return (
    <div className="flex-1 min-w-0 px-3 py-2">
      <p className="text-[9px] font-medium uppercase tracking-widest text-ink-faint mb-0.5">{label}</p>
      <p className="text-[13px] font-semibold text-ink-strong tabular-nums whitespace-nowrap">
        {value}{sub && <span className={`text-[10px] font-medium ml-1.5 ${subTone}`}>{sub}</span>}
      </p>
    </div>
  )
}

const SORTS = [
  { key: 'revenue', label: 'Revenue' }, { key: 'cost', label: 'Cost' },
  { key: 'roas', label: 'ROAS' }, { key: 'orders', label: 'Orders' },
  { key: 'ctr', label: 'CTR' }, { key: 'cvr', label: 'CVR' }, { key: 'vr2s', label: 'Hook 2s' },
]
const sortVal = (v, key) => (key === 'vr2s' ? v.lifetime?.funnel?.vr2s : v.lifetime?.[key]) ?? -1

export default function ProductDetailModal({ product, videos, boost = {}, periodName, onClose, onTrackBoost }) {
  // Video milik produk ini (window aktif), dipetakan per bucket status + boost.
  const mine = useMemo(
    () => videos.filter(v => v.productId && v.productId === product.productId),
    [videos, product.productId])

  // Riwayat excluded LENGKAP (lintas semua snapshot, bukan window) — query
  // read-only saat modal dibuka. null = sedang dimuat.
  // Modal di-mount ulang per produk (ProductPage), jadi state awal null =
  // loading; cukup set saat fetch selesai (tanpa reset sinkron di effect).
  const [exclHist, setExclHist] = useState(null)
  useEffect(() => {
    let active = true
    loadExcludedHistory(product.productId)
      .then(h => { if (active) setExclHist(h) })
      .catch(() => { if (active) setExclHist([]) })
    return () => { active = false }
  }, [product.productId])

  // Tab status TikTok (In queue/Learning/Delivering) tetap dari window aktif.
  const byTab = useMemo(() => {
    const m = { in_queue: [], learning: [], delivering: [] }
    for (const v of mine) if (m[v.deliveryCanon]) m[v.deliveryCanon].push(v)
    return m
  }, [mine])

  // Set video milik produk lintas SEMUA snapshot → memetakan record boost
  // (tanpa product_id) ke produk agar tab boost pakai data keseluruhan.
  const [productVids, setProductVids] = useState(null)
  // Video terdeteksi "video code" (auth_type=AUTH_CODE) = boosted menurut TikTok.
  const [codeVids, setCodeVids] = useState(null)
  useEffect(() => {
    let active = true
    loadProductVideoIds(product.productId)
      .then(s => { if (active) setProductVids(s) }).catch(() => { if (active) setProductVids(new Set()) })
    loadCodeVideos(product.productId)
      .then(m => { if (active) setCodeVids(m) }).catch(() => { if (active) setCodeVids(new Map()) })
    return () => { active = false }
  }, [product.productId])

  // Tab Kode masuk = record boost ada_kode ∩ video produk (data keseluruhan).
  const kodeRows = useMemo(() => {
    if (!productVids) return null
    const byIdMine = new Map(mine.map(v => [v.videoId, v]))
    return Object.values(boost)
      .filter(b => b.video_id && productVids.has(b.video_id) && b.status === 'ada_kode' && !isBoosted(b))
      .map(b => { const m = byIdMine.get(b.video_id)
        return { videoId: b.video_id, title: b.video_title || m?.title || '',
                 account: b.tiktok_account || m?.account || null, lifetime: m?.lifetime || null } })
  }, [productVids, boost, mine])

  // Tab Boosted = GABUNGAN terdeteksi TikTok (AUTH_CODE) ∪ pipeline manual.
  // Tiap baris ditandai byCode (deteksi) & inPipeline (dicatat manual).
  const boostedRows = useMemo(() => {
    if (!productVids || !codeVids) return null
    const byIdMine = new Map(mine.map(v => [v.videoId, v]))
    const ids = new Set(codeVids.keys())
    for (const b of Object.values(boost)) {
      if (b.video_id && productVids.has(b.video_id) && isBoosted(b)) ids.add(b.video_id)
    }
    const rows = [...ids].map(vid => {
      const m = byIdMine.get(vid), b = boost[vid], cv = codeVids.get(vid)
      // Rentang boost: pipeline (boost_start→end) diutamakan; else rentang
      // AUTH_CODE terdeteksi (first→last). Dipakai menjumlahkan hasil selama boost.
      const win = (isBoosted(b) && b?.boost_start) ? boostWindow(b)
        : cv ? windowFromDates(cv.first, cv.last) : null
      return {
        videoId: vid,
        title: b?.video_title || cv?.title || m?.title || '',
        account: b?.tiktok_account || cv?.account || m?.account || null,
        lifetime: m?.lifetime || null,
        byCode: !!cv, inPipeline: isBoosted(b), codeInfo: cv || null, win,
      }
    })
    // Berlangsung dulu → belum-dilacak (byCode tanpa pipeline) → sisanya; revenue desc.
    const rank = (r) => (r.inPipeline && boostStatus(boost[r.videoId]) === 'live' ? 3
      : r.byCode && !r.inPipeline ? 2 : r.inPipeline ? 1 : 0)
    return rows.sort((a, c) => rank(c) - rank(a) || ((c.lifetime?.revenue || 0) - (a.lifetime?.revenue || 0)))
  }, [productVids, codeVids, boost, mine])

  // Rekonsiliasi: terdeteksi TikTok vs tercatat di pipeline.
  const boostRecon = useMemo(() => {
    if (!codeVids || !boostedRows) return null
    const detected = codeVids.size
    const tracked = boostedRows.filter(r => r.byCode && r.inPipeline).length
    return { detected, tracked, untracked: detected - tracked }
  }, [codeVids, boostedRows])

  // Metrik HARIAN video-boosted → hitung hasil SELAMA masa boost (per rentang
  // masing-masing baris). Di-load saat daftar boosted resolve.
  const [boostDaily, setBoostDaily] = useState(null)
  const boostedIdsKey = useMemo(
    () => (boostedRows ? boostedRows.map(r => r.videoId).sort().join(',') : ''),
    [boostedRows])
  useEffect(() => {
    const ids = boostedIdsKey ? boostedIdsKey.split(',') : []
    let active = true
    loadVideosDaily(ids).then(m => { if (active) setBoostDaily(m) }).catch(() => {})
    return () => { active = false }
  }, [boostedIdsKey])
  // { videoId: {cost,revenue,orders,roas,days} } selama rentang boost.
  const boostPerf = useMemo(() => {
    if (!boostedRows || !boostDaily) return {}
    const out = {}
    for (const r of boostedRows) {
      out[r.videoId] = r.win ? sumDaily(boostDaily.get(r.videoId), r.win.start, r.win.end) : null
    }
    return out
  }, [boostedRows, boostDaily])

  // Baris tab Excluded = riwayat lengkap, digabung metrik lifetime bila video
  // itu juga ada di window aktif (kalau tidak → metrik "—", timeline tetap ada).
  const excludedRows = useMemo(() => {
    if (!exclHist) return null
    const byIdMine = new Map(mine.map(v => [v.videoId, v]))
    return exclHist.map(e => {
      const m = byIdMine.get(e.videoId)
      return {
        videoId: e.videoId, title: e.title || m?.title || '', account: e.account || m?.account || null,
        lifetime: m?.lifetime || null, excl: e,
      }
    })
  }, [exclHist, mine])

  const exclCount = exclHist == null ? null : exclHist.length

  // Rekap excluded per campaign (dari riwayat lengkap).
  const exclByCampaign = useMemo(() => {
    if (!exclHist) return []
    const m = new Map()
    for (const e of exclHist) {
      const c = e.campaign || '(tanpa campaign)'
      m.set(c, (m.get(c) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [exclHist])

  // Default: tab pertama (urutan user) yang ada isinya (dari window).
  const [tab, setTab] = useState(() => ALL_TABS.find(t => byTab[t.key]?.length)?.key || 'in_queue')
  const [sortKey, setSortKey] = useState('revenue')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const tabCount = (key) => {
    if (key === 'excluded') return exclCount
    if (key === 'ada_kode') return kodeRows == null ? null : kodeRows.length
    if (key === 'boosted') return boostedRows == null ? null : boostedRows.length
    return byTab[key]?.length || 0
  }

  const rows = useMemo(() => {
    if (tab === 'excluded') return excludedRows   // null saat loading
    if (tab === 'ada_kode') return kodeRows
    if (tab === 'boosted') return boostedRows
    return [...(byTab[tab] || [])].sort((a, b) => sortVal(b, sortKey) - sortVal(a, sortKey))
  }, [tab, byTab, sortKey, excludedRows, kodeRows, boostedRows])

  const cvrTone = (v) => {
    const cvr = v.lifetime?.cvr, clicks = v.lifetime?.clicks
    if (cvr != null && cvr >= 0.05) return 'text-emerald-500'
    if (cvr === 0 && (clicks ?? 0) > 0) return 'text-red-400'
    return 'text-ink'
  }
  // vr2s berskala persen (0–100): ≥30 = hook kuat.
  const hookTone = (h) => (h != null && h >= 30 ? 'text-emerald-500' : 'text-ink')

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="glass-modal rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-strong truncate">{product.name || product.productId}</p>
            <p className="text-[11px] text-ink-faint truncate">
              {product.name && <span className="font-mono">{product.productId} · </span>}
              {product.videoCount} video{periodName ? ` · ${periodName}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="text-ink-muted hover:text-ink p-1 -m-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-4 overflow-y-auto">
          {/* Funnel agregat produk */}
          <div className="flex items-stretch divide-x divide-line/10 bg-fill/5 border border-line/10 rounded-xl mb-3 overflow-x-auto">
            <FunnelCell label="Impressions" value={product.impressions ? product.impressions.toLocaleString('id-ID') : '—'} />
            <FunnelCell label="Clicks" value={product.clicks ? product.clicks.toLocaleString('id-ID') : '—'}
              sub={product.ctr != null ? `CTR ${pct(product.ctr)}` : null} subTone="text-emerald-500" />
            <FunnelCell label="Orders" value={(product.orders || 0).toLocaleString('id-ID')}
              sub={product.cvr != null ? `CVR ${pct(product.cvr)}` : null} subTone="text-emerald-500" />
            <FunnelCell label="Revenue" value={<span className="text-emerald-500">{fmtRpC(product.revenue)}</span>} />
            <FunnelCell label="Cost · ROAS · CPO" value={fmtRpC(product.cost)}
              sub={`${fmtRoasX(product.roas)}${product.cpo != null ? ` · ${fmtRpC(product.cpo)}` : ''}`} />
          </div>

          {/* Tab status TikTok (In queue → Learning → Delivering → Excluded)
              + pipeline Boost Center (Kode masuk → Boosted), dipisah divider */}
          <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
            {TABS.map(({ key, label, dot, on }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  tab === key ? on : 'border-transparent text-ink-muted hover:bg-fill/5 hover:text-ink'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                {label} <span className="opacity-70 text-[10px]">{tabCount(key) ?? '…'}</span>
              </button>
            ))}
            <span className="w-px h-4 bg-line/15 mx-0.5" aria-hidden />
            {BOOST_TABS.map(({ key, label, dot, on }) => (
              <button key={key} onClick={() => setTab(key)}
                title={key === 'ada_kode' ? 'Video yang kode boost-nya sudah masuk (Boost Center)' : 'Seluruh video yang pernah/sedang di-boost (lintas semua tanggal)'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  tab === key ? on : 'border-transparent text-ink-muted hover:bg-fill/5 hover:text-ink'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                {label} <span className="opacity-70 text-[10px]">{tabCount(key) ?? '…'}</span>
              </button>
            ))}
            {['in_queue', 'learning', 'delivering'].includes(tab) && (
            <label className="ml-auto inline-flex items-center gap-1 text-[10px] text-ink-faint">
              urut:
              <select value={sortKey} onChange={e => setSortKey(e.target.value)}
                className="bg-transparent text-ink-muted text-[11px] focus:outline-none cursor-pointer">
                {SORTS.map(s => <option key={s.key} value={s.key} className="bg-surface">{s.label}</option>)}
              </select>
              <ChevronDown className="w-3 h-3 -ml-4 pointer-events-none" />
            </label>
            )}
            {tab === 'excluded' && <span className="ml-auto text-[10px] text-ink-faint">urut: exclude terakhir</span>}
            {tab === 'boosted' && <span className="ml-auto text-[10px] text-ink-faint">urut: berlangsung dulu</span>}
          </div>

          {/* Banner rekonsiliasi boost — terdeteksi TikTok vs pipeline */}
          {tab === 'boosted' && boostRecon && boostRecon.detected > 0 && (
            <div className="flex items-center gap-2.5 bg-accent/[0.08] border border-accent/25 rounded-xl px-3 py-2 mb-2.5">
              <Radar className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <p className="text-[11px] text-ink-muted leading-snug">
                <b className="text-ink">{boostRecon.detected} video</b> terdeteksi pakai video code di TikTok ·
                <b className="text-emerald-400"> {boostRecon.tracked}</b> di pipeline ·
                {boostRecon.untracked > 0
                  ? <b className="text-amber-400"> {boostRecon.untracked} belum dilacak</b>
                  : <span className="text-emerald-400"> semua terlacak ✓</span>}
              </p>
            </div>
          )}

          {/* Rekap excluded per campaign (hanya di tab Excluded) */}
          {tab === 'excluded' && exclByCampaign.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
              <span className="text-[10px] text-ink-faint uppercase tracking-wide">Per campaign:</span>
              {exclByCampaign.map(([c, n]) => (
                <span key={c} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] bg-red-500/10 text-red-400 border border-red-500/20">
                  <span className="max-w-[160px] truncate">{c}</span>
                  <b className="font-semibold">{n} video</b>
                </span>
              ))}
            </div>
          )}

          {/* Tabel creative */}
          {rows == null ? (
            <div className="flex items-center justify-center py-10 text-ink-faint gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-sm">Memuat…</span>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-ink-faint py-8 text-center">
              {tab === 'excluded' ? 'Belum ada video yang pernah di-exclude untuk produk ini.'
                : tab === 'boosted' ? 'Belum ada video yang pernah/sedang di-boost untuk produk ini.'
                : tab === 'ada_kode' ? 'Belum ada video dengan kode boost masuk untuk produk ini.'
                : `Tidak ada video berstatus ${ALL_TABS.find(t => t.key === tab)?.label} di periode ini.`}
            </p>
          ) : tab === 'boosted' ? (
            <BoostedTable rows={rows} perf={boostPerf} daysLoading={boostDaily == null}
              boost={boost} onTrackBoost={onTrackBoost} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] uppercase tracking-wider text-ink-faint border-b border-line/10">
                    <th className="py-2 pr-2 text-left font-medium">Creative</th>
                    <th className="py-2 px-2 text-right font-medium">Cost</th>
                    <th className="py-2 px-2 text-right font-medium">Revenue</th>
                    <th className="py-2 px-2 text-right font-medium">ROAS</th>
                    <th className="py-2 px-2 text-right font-medium">Ord</th>
                    <th className="py-2 px-2 text-right font-medium">CTR</th>
                    <th className="py-2 px-2 text-right font-medium">CVR</th>
                    <th className="py-2 px-2 text-right font-medium" title="% penonton bertahan >2 detik pertama">Hook 2s</th>
                    <th className="py-2 pl-2 text-right font-medium" title="Sisa penonton di 25/50/75/100% durasi">Retensi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(v => (
                    <tr key={v.videoId} className="border-b border-line/5 hover:bg-fill/5">
                      <td className="py-2 pr-2 max-w-[200px]">
                        <VideoLabel title={v.title} account={v.account} videoId={v.videoId} compact linkVideo />
                        {tab === 'excluded' && v.excl && (
                          <p className="text-[9px] text-red-400/90 mt-0.5">
                            Excluded sejak {fmtDate(v.excl.first)}
                            {v.excl.last !== v.excl.first && ` · terakhir ${fmtDate(v.excl.last)}`}
                            {v.excl.dayCount > 1 && <span className="text-ink-faint"> · {v.excl.dayCount} hari</span>}
                            {v.excl.campaign && <span className="text-ink-faint"> · {v.excl.campaign}</span>}
                          </p>
                        )}
                        {boost[v.videoId]?.status === 'ada_kode' && !isBoosted(boost[v.videoId]) && (
                          <span title={boost[v.videoId].boost_code ? `Kode: ${boost[v.videoId].boost_code}` : 'Kode boost tersedia'}
                            className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/15 text-sky-400">
                            kode masuk
                          </span>
                        )}
                        {isBoosted(boost[v.videoId]) && <BoostChip b={boost[v.videoId]} />}
                      </td>
                      <td className="py-2 px-2 text-right text-ink-muted tabular-nums whitespace-nowrap">{v.lifetime ? fmtRpC(v.lifetime.cost) : '—'}</td>
                      <td className="py-2 px-2 text-right text-ink tabular-nums whitespace-nowrap">{v.lifetime ? fmtRpC(v.lifetime.revenue) : '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-medium text-ink">{v.lifetime ? fmtRoasX(v.lifetime.roas) : '—'}</td>
                      <td className="py-2 px-2 text-right text-ink-muted tabular-nums">{v.lifetime ? (v.lifetime.orders || 0) : '—'}</td>
                      <td className="py-2 px-2 text-right text-ink-muted tabular-nums">{pct(v.lifetime?.ctr)}</td>
                      <td className={`py-2 px-2 text-right tabular-nums ${cvrTone(v)}`}>{pct(v.lifetime?.cvr)}</td>
                      <td className={`py-2 px-2 text-right tabular-nums ${hookTone(v.lifetime?.funnel?.vr2s)}`}>{pctRaw(v.lifetime?.funnel?.vr2s)}</td>
                      <td className="py-2 pl-2 text-right"><RetentionBars funnel={v.lifetime?.funnel} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">
            {tab === 'boosted'
              ? <>Metrik di tab Boosted = <span className="text-violet-300">hasil selama masa boost</span> tiap video
                  (dijumlahkan dari rentang boost pipeline, atau rentang deteksi video code TikTok). Rate
                  (CTR/CVR/Hook) lihat tab Delivering.</>
              : <>Hook 2s = % penonton bertahan lewat 2 detik pertama (scroll-stop). Retensi = sisa penonton
                  di 25/50/75/100% durasi (hover bar untuk angka). Tab <span className="text-red-400">Excluded</span> =
                  seluruh video yang PERNAH di-exclude lintas semua tanggal. Metrik "—" bila di luar periode aktif.</>}
          </p>
        </div>
      </div>
    </div>
  )
}

// Tabel tab Boosted — metrik = HASIL SELAMA MASA BOOST (bukan window aktif) +
// kolom Periode boost. Rate sengaja dilepas (kurang bermakna di rentang custom).
function BoostedTable({ rows, perf, daysLoading, boost, onTrackBoost }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-ink-faint border-b border-line/10">
            <th className="py-2 pr-2 text-left font-medium">Creative</th>
            <th className="py-2 px-2 text-right font-medium">Cost</th>
            <th className="py-2 px-2 text-right font-medium">Revenue</th>
            <th className="py-2 px-2 text-right font-medium">ROAS</th>
            <th className="py-2 px-2 text-right font-medium">Ord</th>
            <th className="py-2 pl-2 text-left font-medium">Periode boost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(v => {
            const p = perf[v.videoId]   // undefined = daily loading · null = tak ada rentang · obj = hasil
            const cell = (val) => (daysLoading || p === undefined) ? '…' : (p == null ? '—' : val)
            const w = v.win
            return (
              <tr key={v.videoId} className="border-b border-line/5 hover:bg-fill/5">
                <td className="py-2 pr-2 max-w-[200px]">
                  <VideoLabel title={v.title} account={v.account} videoId={v.videoId} compact linkVideo />
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {v.byCode && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/15 text-blue-400">
                        <span className="w-1 h-1 rounded-full bg-blue-400" /> Video code (TikTok)
                      </span>
                    )}
                    {v.inPipeline && <BoostChip b={boost[v.videoId]} />}
                    {v.byCode && !v.inPipeline && (
                      <>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-400">
                          <span className="w-1 h-1 rounded-full bg-amber-400" /> Belum di pipeline
                        </span>
                        {onTrackBoost && (
                          <button onClick={(e) => { e.stopPropagation(); onTrackBoost(v) }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-violet-500/20 text-violet-300 hover:bg-violet-500/30">
                            <Plus className="w-2.5 h-2.5" /> Lacak boost
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
                <td className="py-2 px-2 text-right text-ink-muted tabular-nums whitespace-nowrap">{cell(fmtRpC(p?.cost))}</td>
                <td className="py-2 px-2 text-right text-ink tabular-nums whitespace-nowrap">{cell(fmtRpC(p?.revenue))}</td>
                <td className="py-2 px-2 text-right tabular-nums font-medium text-ink">{cell(fmtRoasX(p?.roas))}</td>
                <td className="py-2 px-2 text-right text-ink-muted tabular-nums">{cell((p?.orders || 0).toLocaleString('id-ID'))}</td>
                <td className="py-2 pl-2 text-left text-ink-muted whitespace-nowrap">
                  {w ? <>{fmtDate(w.start)}{w.ongoing ? ' → kini' : ` – ${fmtDate(w.end)}`}
                    <span className="block text-[9px] text-ink-faint">{w.lengthDays} hari{v.byCode && !v.inPipeline ? ' · deteksi TikTok' : ''}</span></> : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
