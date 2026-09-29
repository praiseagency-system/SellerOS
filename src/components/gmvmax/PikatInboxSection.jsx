// Kotak "Kode dari Pikat" (Boost → Spark Binding) — mockup opsi A, 28 Sep 2026.
// Kode spark yang dikumpulkan Pikat dari kreator ditarik server ke
// pikat_spark_inbox, lalu tiap kode baru DIPRATINJAU (read-only) sebelum tim Ads
// memutuskan. Pemeriksaan sengaja terjadi SEBELUM mengikat: video yang terikat
// masuk kolam GMV Max dan bisa langsung memakai budget iklan.
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, RefreshCw, Link2, AlertCircle, CheckCircle2 } from 'lucide-react'
import {
  getPikatLink, pullPikat, reportPikat, harvestPikat, listInbox, loadBoundVideoIds, loadAdsStats, previewRow, bindRow, dismissRows,
  OPEN_STATUSES,
} from '../../data/pikatSpark'
import { APPROVAL_EVENT } from '../../data/gmvmaxApprovals'
import { tiktokVideoUrl, fmtRpC } from './ui'
import { usePaged, Pager } from '../ui/DataTable'
import { prioritasIkat, bandingPrioritas, roasTerpercaya, engagementRate, STATUS_TAYANG, MIN_SPEND } from '../../utils/pikatPriority'

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

// READY + approval_id = sudah diajukan, menunggu disetujui di lonceng.
const diLonceng = (r) => r.status === 'READY' && !!r.approval_id
const LONCENG = { label: 'Menunggu di lonceng', tone: 'bg-blue-500/15 text-blue-300' }

const FILTERS = [
  { id: 'open', label: 'Perlu keputusan', match: r => OPEN_STATUSES.includes(r.status) && !diLonceng(r) },
  { id: 'ready', label: 'Siap diajukan', match: r => r.status === 'READY' && !r.approval_id },
  { id: 'lonceng', label: 'Menunggu di lonceng', match: diLonceng },
  { id: 'cek', label: 'Perlu dicek', match: r => ['INVALID', 'MISMATCH', 'FAILED'].includes(r.status) },
  { id: 'bound', label: 'Sudah terikat', match: r => ['ALREADY', 'BOUND'].includes(r.status) },
  { id: 'dismissed', label: 'Diabaikan', match: r => r.status === 'DISMISSED' },
]

const fmtViews = (n) => n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} jt` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace('.', ',')} rb` : String(n)
const jam = (iso) => iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const PRIORITAS = {
  tinggi: { label: 'Tinggi', tone: 'bg-emerald-500/15 text-emerald-400' },
  sedang: { label: 'Sedang', tone: 'bg-amber-500/15 text-amber-400' },
  rendah: { label: 'Rendah', tone: 'bg-fill/10 text-ink-muted' },
}
const angka = (n) => (n == null ? '—' : Number(n).toLocaleString('id-ID'))
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
      // Panen kode ad account & permintaan kode: panggilan kedua, gagal tak menggagalkan tarikan.
      const h = await harvestPikat().catch(() => null)
      const bagian = [
        r.baru || r.berubah ? `${r.baru} kode baru${r.berubah ? ` · ${r.berubah} diperbarui kreator` : ''}` : 'Tak ada kode baru',
        h?.panen?.diisi ? `${h.panen.diisi} video di Pikat diisi kode dari ad account` : null,
        h?.diminta ? `${h.diminta} video "Minta kode" ditagih ke kreator lewat Pikat` : null,
        h?.sudahBerkode ? `${h.sudahBerkode} video "Minta kode" ternyata sudah berkode di Pikat — masuk kotak` : null,
        h?.bukanPikat ? `${h.bukanPikat} video "Minta kode" bukan kreator Pikat (minta manual)` : null,
        h?.terpasang ? `${h.terpasang} video di pipeline sudah terpasang di ad account` : null,
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

  // Keputusan di 🔔 (setuju → dieksekusi, tolak, kedaluwarsa) langsung tercermin di
  // kotak ini, dan status baru ikut dikirim ke Spark Center Pikat.
  useEffect(() => {
    let t = null
    const onChange = () => {
      clearTimeout(t)
      t = setTimeout(async () => {
        try { await refresh(); lapor(); onBound?.() } catch { /* dicoba lagi di keputusan berikutnya */ }
      }, 800)
    }
    window.addEventListener(APPROVAL_EVENT, onChange)
    return () => { clearTimeout(t); window.removeEventListener(APPROVAL_EVENT, onChange) }
  }, [refresh, onBound])

  // M1: satu baris = { row, ads, p }, diurut prioritas ikat (lihat utils/pikatPriority).
  const f = FILTERS.find(x => x.id === filter) || FILTERS[0]
  const items = rows.filter(f.match)
    .map(row => { const a = ads.get(String(row.video_id)); return { row, ads: a, p: prioritasIkat(row, a) } })
    .sort(bandingPrioritas)
  const shown = items.map(i => i.row)
  const pg = usePaged(items)

  if (link === undefined) return null
  if (link === null) {
    return (
      <div className="mb-3 rounded-2xl border border-line/10 bg-surface px-4 py-3 flex items-center gap-2.5 text-[11.5px] text-ink-muted">
        <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-blue-600 text-white">PIKAT</span>
        Kode spark dari kreator bisa masuk otomatis ke sini — sambungkan Pikat di <span className="text-ink font-medium">Pengaturan → Integrasi</span>.
      </div>
    )
  }

  const counts = Object.fromEntries(FILTERS.map(x => [x.id, rows.filter(x.match).length]))
  const selectable = (r) => OPEN_STATUSES.includes(r.status) && r.status !== 'NEW' && !diLonceng(r)
  const pickedRows = rows.filter(r => selected.has(r.id))
  const readyPicked = pickedRows.filter(r => r.status === 'READY' && !r.approval_id)

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
    setNote(`${ok} video diajukan ke lonceng — setujui di sana untuk mengikat${gagal ? ` · ${gagal} gagal diajukan` : ''}.`)
    setBinding(false)
  }

  async function bindOne(r) {
    setRowBusy(r.id); setError(null); setNote(null)
    const hasil = await bindRow(r)
    setSelected(prev => { const n = new Set(prev); n.delete(r.id); return n })
    await refresh()
    setRowBusy(null)
    if (hasil.ok) setNote(`@${r.tiktok_username || '?'} diajukan ke lonceng — setujui di sana untuk mengikat.`)
    else setError(`Gagal mengajukan @${r.tiktok_username || '?'}: ${hasil.error}`)
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
          <div className="min-w-[1000px]">
            <div className="grid grid-cols-[28px_minmax(220px,2.2fr)_minmax(170px,1.8fr)_minmax(190px,2fr)_minmax(140px,1.3fr)_minmax(110px,0.9fr)] gap-x-3.5 text-[10px] font-bold tracking-wider text-ink-faint">
              <span />
              <span />
              <span className="pb-1 border-b-2 border-emerald-500/50">ORGANIK (PIKAT)</span>
              <span className="pb-1 border-b-2 border-blue-500/60">IKLAN GMV MAX · 7 HARI</span>
              <span />
              <span />
            </div>
            <div className="grid grid-cols-[28px_minmax(220px,2.2fr)_minmax(170px,1.8fr)_minmax(190px,2fr)_minmax(140px,1.3fr)_minmax(110px,0.9fr)] gap-x-3.5 items-center py-2 text-[11px] font-semibold text-ink-faint border-b border-line/10">
              <input type="checkbox" aria-label="Pilih semua" checked={allShownPicked} onChange={toggleAll}
                disabled={!shown.some(selectable) || busy} className="accent-blue-600 justify-self-center" />
              <span>Video</span>
              <span>Views · interaksi · GMV</span>
              <span>Omzet · biaya · ROAS · status</span>
              <span>Prioritas ikat</span>
              <span className="text-right">Aksi</span>
            </div>
            {pg.paged.map(({ row: r, ads: a, p }) => {
              const st = diLonceng(r) ? LONCENG : (STATUS[r.status] || STATUS.NEW)
              const umurDari = r.uploaded_at || r.recorded_at
              const umur = umurDari && loadedAt ? Math.max(0, Math.floor((loadedAt - Date.parse(umurDari)) / 86400000)) : null
              const judul = r.preview?.title || r.label || '(tanpa judul)'
              const erR = engagementRate(r)
              const roas = roasTerpercaya(a)
              const pr = PRIORITAS[p.level]
              return (
                <div key={r.id} className="grid grid-cols-[28px_minmax(220px,2.2fr)_minmax(170px,1.8fr)_minmax(190px,2fr)_minmax(140px,1.3fr)_minmax(110px,0.9fr)] gap-x-3.5 items-center py-2.5 border-b border-line/5 text-[11.5px]">
                  <input type="checkbox" aria-label={`Pilih video ${r.video_id}`} checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)} disabled={!selectable(r) || busy} className="accent-blue-600 justify-self-center" />
                  <div className="min-w-0">
                    <a href={tiktokVideoUrl(r.video_id, r.tiktok_username) || '#'} target="_blank" rel="noreferrer"
                      className="block text-ink hover:text-blue-300 truncate">{judul}</a>
                    <p className="text-[10.5px] text-ink-faint truncate">
                      @{r.tiktok_username || '?'} · {SUMBER[r.source] || r.source || '—'}{umur == null ? '' : ` · ${umur} hr`}
                      <span className="font-mono"> · …{String(r.spark_code).slice(-6)}</span>
                    </p>
                    <span className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${st.tone}`}
                      title={r.preview?.error || r.preview?.note || (r.status === 'MISMATCH' && r.preview?.item_id ? `kode untuk video ${r.preview.item_id}` : '')}>
                      {r.status === 'NEW' && <Loader2 className="w-3 h-3 animate-spin mr-1" />}{st.label}
                    </span>
                  </div>
                  <div className="font-mono space-y-0.5">
                    <p className="text-ink">{fmtViews(r.views)} views <span className="text-ink-faint">· ER {erR == null ? '—' : `${erR.toFixed(1).replace('.', ',')}%`}</span></p>
                    <p className="text-[10.5px] text-ink-faint">{angka(r.likes)} suka · {angka(r.comments)} komentar · {angka(r.shares)} share</p>
                    <p className={`text-[11px] ${Number(r.gmv_organic) > 0 ? 'text-emerald-400' : 'text-ink-faint'}`}>
                      GMV {r.gmv_organic == null ? '—' : fmtRpC(Number(r.gmv_organic))}
                    </p>
                  </div>
                  <div className="font-mono space-y-0.5">
                    {a && (a.cost > 0 || a.revenue > 0) ? (
                      <>
                        <p className="text-ink">Omzet {fmtRpC(a.revenue)} <span className="text-ink-faint">· {a.orders} order</span></p>
                        <p className="text-[10.5px] text-ink-faint">
                          biaya {fmtRpC(a.cost)} · ROAS {roas == null ? '—' : roas.toFixed(1).replace('.', ',')}
                          {roas == null && a.cost > 0 && <span className="text-amber-400"> belanja &lt; {fmtRpC(MIN_SPEND)}</span>}
                        </p>
                        <p className="text-[10.5px] text-blue-300 font-sans">
                          ● {STATUS_TAYANG[a.status] || a.status || '—'}{a.authTypes.has('AFFILIATE') ? ' · izin afiliasi' : ''}
                        </p>
                      </>
                    ) : <p className="text-[10.5px] text-ink-faint font-sans">belum tayang di GMV Max</p>}
                  </div>
                  <div className="space-y-1">
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10.5px] font-bold ${pr.tone}`}>{pr.label}</span>
                    <p className="text-[10.5px] text-ink-faint leading-snug">{p.alasan}</p>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    {rowBusy === r.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-faint" />}
                    {r.status === 'READY' && !r.approval_id && (
                      <button onClick={() => bindOne(r)} disabled={busy} title="Ajukan ikatan ke lonceng persetujuan"
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                        Ajukan
                      </button>
                    )}
                    {selectable(r) && (
                      <button onClick={() => dismissOne(r)} disabled={busy} aria-label="Abaikan" title="Abaikan"
                        className="w-7 h-7 rounded-lg text-[13px] border border-line/15 text-ink-muted hover:text-ink disabled:opacity-40 transition-colors">
                        ×
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            <Pager {...pg} unit="kode" />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <p className="text-[11px] text-ink-faint leading-relaxed max-w-[560px]">
          Ajukan → video masuk lonceng persetujuan. Setelah disetujui di sana, kodenya diikat ke ad account, tercatat di
          Log Optimasi, dan tunduk pada kill switch. Video yang diikat masuk kolam GMV Max dan bisa langsung memakai budget iklan.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={dismissPicked} disabled={busy || !pickedRows.length}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-line/15 text-ink hover:bg-fill/5 disabled:opacity-40 transition-colors">
            Abaikan terpilih
          </button>
          <button onClick={bindPicked} disabled={busy || !readyPicked.length}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {binding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Ajukan {readyPicked.length || ''} video ke lonceng
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
