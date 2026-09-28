// Kotak "Kode dari Pikat" (Boost → Spark Binding) — mockup opsi A, 28 Sep 2026.
// Kode spark yang dikumpulkan Pikat dari kreator ditarik server ke
// pikat_spark_inbox, lalu tiap kode baru DIPRATINJAU (read-only) sebelum tim Ads
// memutuskan. Pemeriksaan sengaja terjadi SEBELUM mengikat: video yang terikat
// masuk kolam GMV Max dan bisa langsung memakai budget iklan.
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, RefreshCw, Link2, AlertCircle, CheckCircle2 } from 'lucide-react'
import {
  getPikatLink, pullPikat, reportPikat, listInbox, loadBoundVideoIds, loadAdsStats, previewRow, bindRow, dismissRows,
  OPEN_STATUSES,
} from '../../data/pikatSpark'
import { tiktokVideoUrl, fmtRpC } from './ui'

const TARIK_ULANG_MS = 30 * 60 * 1000   // tarik otomatis bila tarikan terakhir > 30 menit
const PRATINJAU_MAKS = 1000            // semua kode baru diperiksa selama halaman terbuka
const JEDA_PRATINJAU_MS = 1200          // tt-video dibatasi 60/menit per user

const STATUS = {
  NEW: { label: 'Memeriksa…', tone: 'bg-fill/10 text-ink-faint' },
  READY: { label: 'Cocok · siap diikat', tone: 'bg-emerald-500/15 text-emerald-400' },
  INVALID: { label: 'Kode tidak valid', tone: 'bg-red-500/15 text-red-400' },
  MISMATCH: { label: 'Kode milik video lain', tone: 'bg-amber-500/15 text-amber-400' },
  FAILED: { label: 'Gagal diikat', tone: 'bg-red-500/15 text-red-400' },
  ALREADY: { label: 'Sudah terikat', tone: 'bg-fill/10 text-ink-muted' },
  BOUND: { label: 'Diikat dari sini', tone: 'bg-emerald-500/15 text-emerald-400' },
  DISMISSED: { label: 'Diabaikan', tone: 'bg-fill/10 text-ink-faint' },
}
const SUMBER = { campaign: 'Campaign', sample: 'Sampel', manual: 'Input manual' }

const FILTERS = [
  { id: 'open', label: 'Perlu keputusan', match: r => OPEN_STATUSES.includes(r.status) },
  { id: 'ready', label: 'Siap diikat', match: r => r.status === 'READY' },
  { id: 'cek', label: 'Perlu dicek', match: r => ['INVALID', 'MISMATCH', 'FAILED'].includes(r.status) },
  { id: 'bound', label: 'Sudah terikat', match: r => ['ALREADY', 'BOUND'].includes(r.status) },
  { id: 'dismissed', label: 'Diabaikan', match: r => r.status === 'DISMISSED' },
]

const fmtViews = (n) => n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} jt` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace('.', ',')} rb` : String(n)
const jam = (iso) => iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const er = (r) => r.views ? (((r.likes || 0) + (r.comments || 0) + (r.shares || 0)) / r.views) * 100 : null
// Status di Spark Center Pikat ikut diperbarui; gagal lapor tak mengganggu kerja tim Ads.
const lapor = () => { reportPikat().catch(() => {}) }

export default function PikatInboxSection({ boundIds: boundFromList, onBound }) {
  const [link, setLink] = useState(undefined)       // undefined = memuat, null = belum tersambung
  const [rows, setRows] = useState([])
  const [loadedAt, setLoadedAt] = useState(0)  // patokan hitung umur (Date.now di luar render)
  const [filter, setFilter] = useState('open')
  const [selected, setSelected] = useState(() => new Set())
  const [pulling, setPulling] = useState(false)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState(null)    // { done, total } selama pratinjau berjalan
  const [binding, setBinding] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [ads, setAds] = useState(() => new Map())   // video_id → kinerja GMV Max 7 snapshot terakhir
  const [rowBusy, setRowBusy] = useState(null)      // id baris yang sedang diikat/diabaikan satuan
  const boundRef = useRef(new Set())

  const refresh = useCallback(async () => {
    const data = await listInbox()
    setRows(data); setLoadedAt(Date.now())
    loadAdsStats(data.map(r => r.video_id)).then(setAds).catch(() => { /* kolom iklan jadi "—" */ })
    return data
  }, [])

  // Pratinjau baris NEW satu per satu (read-only ke TikTok), hasil langsung terlihat.
  const checkNew = useCallback(async (data) => {
    const antre = data.filter(r => r.status === 'NEW').slice(0, PRATINJAU_MAKS)
    if (!antre.length) return
    setChecking(true)
    setProgress({ done: 0, total: antre.length })
    try {
      const bound = new Set([...boundRef.current, ...(boundFromList || [])])
      let jeda = false
      for (const [i, r] of antre.entries()) {
        // Video yang sudah terikat tak perlu bertanya ke TikTok — tanpa jeda.
        const perluTikTok = !bound.has(String(r.video_id))
        if (jeda && perluTikTok) await sleep(JEDA_PRATINJAU_MS)
        const hasil = await previewRow(r, bound)
        jeda = perluTikTok
        setRows(prev => prev.map(x => x.id === r.id ? hasil : x))
        setProgress({ done: i + 1, total: antre.length })
        // Lapor bertahap supaya Spark Center tak menunggu seluruh antrean.
        if ((i + 1) % 50 === 0) lapor()
      }
    } catch (e) { setError(`Pratinjau terhenti: ${e.message}`) }
    finally { setChecking(false); setProgress(null); lapor() }
  }, [boundFromList])

  const pull = useCallback(async () => {
    setPulling(true); setError(null); setNote(null)
    try {
      const r = await pullPikat()
      const bagian = [
        r.baru || r.berubah ? `${r.baru} kode baru${r.berubah ? ` · ${r.berubah} diperbarui kreator` : ''}` : 'Tak ada kode baru',
        r.panen?.panen?.diisi ? `${r.panen.panen.diisi} video di Pikat diisi kode dari ad account` : null,
        r.panen?.diminta ? `${r.panen.diminta} video afiliasi berbelanja tanpa kode diminta ke kreator` : null,
      ].filter(Boolean)
      setNote(`${bagian.join(' · ')}.`)
      setLink(await getPikatLink())
    } catch (e) {
      setError(e.message)
    } finally { setPulling(false) }
    const data = await refresh()
    await checkNew(data)
  }, [refresh, checkNew])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const l = await getPikatLink()
        if (!active) return
        setLink(l)
        if (!l) return
        try { boundRef.current = await loadBoundVideoIds() } catch { /* potret belum ada — pratinjau tetap jalan */ }
        const basi = !l.last_pulled_at || Date.now() - Date.parse(l.last_pulled_at) > TARIK_ULANG_MS
        if (basi) { await pull(); return }
        const data = await refresh()
        if (active) await checkNew(data)
      } catch (e) { if (active) setError(e.message) }
    })()
    return () => { active = false }
    // Sekali per halaman dibuka; tarikan berikutnya lewat tombol.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (link === undefined) return null
  if (link === null) {
    return (
      <div className="mb-3 rounded-2xl border border-line/10 bg-surface px-4 py-3 flex items-center gap-2.5 text-[11.5px] text-ink-muted">
        <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-blue-600 text-white">PIKAT</span>
        Kode spark dari kreator bisa masuk otomatis ke sini — sambungkan Pikat di <span className="text-ink font-medium">Pengaturan → Integrasi</span>.
      </div>
    )
  }

  const f = FILTERS.find(x => x.id === filter) || FILTERS[0]
  // GMV organik tertinggi dulu — video yang paling menghasilkan paling perlu diamankan kodenya.
  const shown = rows.filter(f.match).sort((a, b) =>
    (Number(b.gmv_organic) || 0) - (Number(a.gmv_organic) || 0) || (b.views || 0) - (a.views || 0))
  const counts = Object.fromEntries(FILTERS.map(x => [x.id, rows.filter(x.match).length]))
  const selectable = (r) => OPEN_STATUSES.includes(r.status) && r.status !== 'NEW'
  const pickedRows = rows.filter(r => selected.has(r.id))
  const readyPicked = pickedRows.filter(r => r.status === 'READY')

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAll() {
    const ids = shown.filter(selectable).map(r => r.id)
    const all = ids.length && ids.every(id => selected.has(id))
    setSelected(prev => { const n = new Set(prev); ids.forEach(id => all ? n.delete(id) : n.add(id)); return n })
  }

  async function bindPicked() {
    setBinding(true); setError(null); setNote(null)
    let ok = 0, gagal = 0
    for (const r of readyPicked) {
      const hasil = await bindRow(r)
      if (hasil.ok) ok++; else gagal++
    }
    setSelected(new Set())
    await refresh()
    setNote(`${ok} video terikat${gagal ? ` · ${gagal} gagal (lihat tab Perlu dicek)` : ''}.`)
    setBinding(false)
    lapor()
    if (ok) onBound?.()
  }

  async function bindOne(r) {
    setRowBusy(r.id); setError(null); setNote(null)
    const hasil = await bindRow(r)
    setSelected(prev => { const n = new Set(prev); n.delete(r.id); return n })
    await refresh()
    setRowBusy(null)
    if (hasil.ok) { setNote(`@${r.tiktok_username || '?'} terikat${hasil.verified ? ' ✓ terverifikasi' : ''}.`); onBound?.() }
    else setError(`Gagal mengikat @${r.tiktok_username || '?'}: ${hasil.error}`)
    lapor()
  }

  async function dismissOne(r) {
    setRowBusy(r.id); setError(null)
    try { await dismissRows([r.id]); await refresh(); lapor() }
    catch (e) { setError(e.message) }
    finally { setRowBusy(null) }
  }

  async function dismissPicked() {
    setError(null)
    try {
      await dismissRows(pickedRows.map(r => r.id))
      setSelected(new Set())
      await refresh()
      lapor()
    } catch (e) { setError(e.message) }
  }

  const busy = pulling || binding || rowBusy != null
  const allShownPicked = shown.some(selectable) && shown.filter(selectable).every(r => selected.has(r.id))

  return (
    <div className="mb-3 bg-surface rounded-2xl border border-blue-500/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-blue-600 text-white">PIKAT</span>
          <p className="text-sm font-bold text-ink-strong">Kode dari Pikat · {counts.open}</p>
          <span className="text-[11px] text-ink-faint truncate">
            dikumpulkan dari kreator{link.pikat_workspace_name ? ` ${link.pikat_workspace_name}` : ''} lewat DM reminder, form sampel &amp; campaign
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-ink-faint">
            {checking ? `memeriksa kode ${progress ? `${progress.done}/${progress.total}` : '…'}` : `ditarik ${jam(link.last_pulled_at)}`}
          </span>
          <button onClick={pull} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-line/15 text-ink hover:bg-fill/5 disabled:opacity-40 transition-colors">
            {pulling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Tarik sekarang
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(x => (
          <button key={x.id} onClick={() => { setFilter(x.id); setSelected(new Set()) }}
            className={`px-3 py-1 rounded-full text-[11.5px] border transition-colors ${filter === x.id
              ? 'border-blue-500 bg-blue-500/15 text-ink-strong font-semibold'
              : 'border-line/15 text-ink-muted hover:text-ink'}`}>
            {x.label} · {counts[x.id]}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-[11.5px] text-ink-faint py-2">
          {filter === 'open' ? 'Tak ada kode yang menunggu keputusan.' : 'Kosong.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] min-w-[980px]">
            <thead><tr className="text-left text-ink-faint border-b border-line/10">
              <th className="py-1.5 pr-2 w-8">
                <input type="checkbox" aria-label="Pilih semua" checked={allShownPicked} onChange={toggleAll}
                  disabled={!shown.some(selectable) || busy} className="accent-blue-600" />
              </th>
              <th className="py-1.5 pr-3 font-semibold">Video</th>
              <th className="py-1.5 pr-3 font-semibold">Kreator</th>
              <th className="py-1.5 pr-3 font-semibold">Engagement</th>
              <th className="py-1.5 pr-3 font-semibold">GMV organik</th>
              <th className="py-1.5 pr-3 font-semibold" title="Biaya & ROAS video ini di GMV Max, 7 snapshot terakhir">Di GMV Max (7 hr)</th>
              <th className="py-1.5 pr-3 font-semibold">Hasil pratinjau</th>
              <th className="py-1.5 font-semibold text-right">Aksi</th>
            </tr></thead>
            <tbody>
              {shown.map(r => {
                const st = STATUS[r.status] || STATUS.NEW
                const umurDari = r.uploaded_at || r.recorded_at
                const umur = umurDari && loadedAt ? Math.max(0, Math.floor((loadedAt - Date.parse(umurDari)) / 86400000)) : null
                const judul = r.preview?.title || r.label || '(tanpa judul)'
                const erR = er(r)
                const a = ads.get(String(r.video_id))
                return (
                  <tr key={r.id} className="border-b border-line/5">
                    <td className="py-2 pr-2">
                      <input type="checkbox" aria-label={`Pilih video ${r.video_id}`} checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)} disabled={!selectable(r) || busy} className="accent-blue-600" />
                    </td>
                    <td className="py-2 pr-3">
                      <a href={tiktokVideoUrl(r.video_id, r.tiktok_username) || '#'} target="_blank" rel="noreferrer"
                        className="block text-ink hover:text-blue-300 truncate max-w-[280px]">{judul}</a>
                      <p className="text-[10.5px] text-ink-faint">
                        {SUMBER[r.source] || r.source || '—'}{r.label && r.preview?.title ? ` · ${r.label}` : ''}{umur == null ? '' : ` · ${umur} hr`}
                        <span className="font-mono"> · kode …{String(r.spark_code).slice(-6)}</span>
                      </p>
                    </td>
                    <td className="py-2 pr-3 text-ink-muted whitespace-nowrap">@{r.tiktok_username || '?'}</td>
                    <td className="py-2 pr-3 font-mono whitespace-nowrap">
                      <p className="text-ink">{fmtViews(r.views)} views</p>
                      <p className="text-[10.5px] text-ink-faint">{erR == null ? '—' : `ER ${erR.toFixed(1).replace('.', ',')}%`}</p>
                    </td>
                    <td className={`py-2 pr-3 font-mono whitespace-nowrap ${Number(r.gmv_organic) > 0 ? 'text-emerald-400' : 'text-ink-faint'}`}>
                      {r.gmv_organic == null ? '—' : fmtRpC(Number(r.gmv_organic))}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {a && a.cost > 0 ? (
                        <>
                          <p className="font-mono text-ink">{fmtRpC(a.cost)} · ROAS {(a.revenue / a.cost).toFixed(1).replace('.', ',')}</p>
                          <p className="text-[10.5px] text-ink-faint">
                            {a.authTypes.has('AFFILIATE') ? 'tayang lewat izin afiliasi' : 'sudah tayang'}
                          </p>
                        </>
                      ) : <p className="text-[10.5px] text-ink-faint">belum tayang</p>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold ${st.tone}`}
                        title={r.preview?.error || r.preview?.note || ''}>
                        {r.status === 'NEW' && <Loader2 className="w-3 h-3 animate-spin mr-1" />}{st.label}
                      </span>
                      {r.status === 'MISMATCH' && r.preview?.item_id && (
                        <p className="text-[10px] text-ink-faint mt-0.5">kode untuk video {r.preview.item_id}</p>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {rowBusy === r.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-faint" />}
                        {r.status === 'READY' && (
                          <button onClick={() => bindOne(r)} disabled={busy}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                            Ikat
                          </button>
                        )}
                        {selectable(r) && (
                          <button onClick={() => dismissOne(r)} disabled={busy}
                            className="px-2 py-1 rounded-lg text-[11px] border border-line/15 text-ink-muted hover:text-ink disabled:opacity-40 transition-colors">
                            Abaikan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <p className="text-[11px] text-ink-faint leading-relaxed max-w-[560px]">
          Setiap ikatan tercatat di antrean persetujuan &amp; Log Optimasi dan tunduk pada kill switch. Video yang diikat
          masuk kolam GMV Max dan bisa langsung memakai budget iklan.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={dismissPicked} disabled={busy || !pickedRows.length}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-line/15 text-ink hover:bg-fill/5 disabled:opacity-40 transition-colors">
            Abaikan terpilih
          </button>
          <button onClick={bindPicked} disabled={busy || !readyPicked.length}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {binding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Ikat {readyPicked.length || ''} video terpilih
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[11px] flex items-start gap-1.5 text-red-300">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{error}
        </p>
      )}
      {note && !error && (
        <p className="text-[11px] flex items-start gap-1.5 text-green-300">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{note}
        </p>
      )}
    </div>
  )
}
