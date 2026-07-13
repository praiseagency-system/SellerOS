// Import Data — halaman upload bersih (drag & drop + panduan export). Nama akun
// discrape otomatis di latar belakang setelah upload. Riwayat upload via toggle.
import { useState, useRef } from 'react'
import { UploadCloud, Loader2, History, BookOpen, CheckCircle2, Zap, RefreshCw } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { UploadHistoryModal } from '../../components/gmvmax/modals'
import { fmtRp } from '../../components/gmvmax/ui'

// Selisih hari dari 'YYYY-MM-DD' ke hari ini (UTC).
function daysSince(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00Z`)
  if (isNaN(d)) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

export default function InputPage() {
  const { imports, upload, busy, enriching, reload } = useGmvMax()
  const [showHistory, setShowHistory] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)
  const [drag, setDrag] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const inputRef = useRef(null)

  // Snapshot via API = tanpa nama file sumber (upload manual selalu punya filename).
  const apiSnaps = imports.filter(i => !i.source_filename)
  const latest = imports[0] || null
  const lag = daysSince(latest?.snapshot_date)
  const fresh = lag != null && lag <= 2

  async function handleRefresh() {
    setSyncing(true)
    try { await reload() } finally { setSyncing(false) }
  }

  async function handleFile(file) {
    if (!file) return
    setErr(null); setResult(null)
    const r = await upload(file)
    if (r.ok) setResult(r.meta); else setErr(r.error)
  }
  function onDrop(e) {
    e.preventDefault(); setDrag(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setShowHistory(true)}
          className="px-3 py-1.5 rounded-lg text-sm border border-line/15 text-ink-muted hover:bg-fill/5 inline-flex items-center gap-2">
          <History className="w-4 h-4" /> Riwayat ({imports.length})
        </button>
      </div>

      <div className="bg-surface rounded-2xl border border-line/10 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-ink inline-flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent" /> Sinkron Otomatis — TikTok GMV Max API
          </p>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${fresh
            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
            : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
            {latest ? (fresh ? 'Terkini' : `${lag} hari lalu`) : 'Belum ada data'}
          </span>
        </div>
        {latest ? (
          <div className="text-sm text-ink-muted">
            Snapshot terbaru: <span className="text-ink font-medium">{latest.name}</span>
            <span className="text-ink-faint"> · {latest.snapshot_date}</span>
            {latest.totals?.cost != null && <> · Cost {fmtRp(latest.totals.cost)}</>}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Belum ada data tersinkron. Worker terjadwal akan mengisinya otomatis.</p>
        )}
        <p className="mt-1 text-xs text-ink-faint">
          {apiSnaps.length} snapshot dari TikTok API · disinkronkan otomatis dari akun iklan (tanpa upload manual).
        </p>
        <button onClick={handleRefresh} disabled={syncing}
          className="mt-4 px-3 py-1.5 rounded-lg text-sm bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 inline-flex items-center gap-2 disabled:opacity-60">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Segarkan data
        </button>
      </div>

      <div className="bg-surface rounded-2xl border border-line/10 p-6 shadow-sm">
        <p className="text-sm font-medium text-ink mb-3">Upload Manual (.xlsx) — cadangan</p>
        <div
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl py-12 flex flex-col items-center gap-2 cursor-pointer transition-colors
            ${drag ? 'border-accent bg-accent/5' : 'border-line/20 hover:border-accent/50'} ${busy ? 'opacity-70 cursor-wait' : ''}`}
        >
          {busy
            ? <><Loader2 className="w-7 h-7 text-accent animate-spin" /><span className="text-sm text-ink-muted">Memproses…</span></>
            : <>
                <UploadCloud className="w-7 h-7 text-ink-faint" />
                <span className="text-sm text-ink-muted">Drag &amp; drop, atau <span className="text-accent font-medium">Pilih File</span></span>
                <span className="text-xs text-ink-faint">Export "creative data for product campaigns" TikTok Shop GMV Max (.xlsx)</span>
              </>}
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => handleFile(e.target.files?.[0])} />

        {enriching && (
          <p className="mt-3 text-xs text-ink-muted inline-flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Melengkapi nama akun otomatis… {enriching.done}/{enriching.total}
          </p>
        )}
        {err && <p className="mt-3 text-sm text-red-500">{err}</p>}
        {result && (
          <div className="mt-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
            <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Berhasil diimpor — {result.name}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs text-ink-muted">
              <span><span className="text-ink-faint">Baris: </span>{result.rowCount}</span>
              <span><span className="text-ink-faint">Video: </span>{result.videoCount}</span>
              <span><span className="text-ink-faint">Cost: </span>{fmtRp(result.totals?.cost)}</span>
              <span><span className="text-ink-faint">Revenue: </span>{fmtRp(result.totals?.revenue)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="bg-surface/60 rounded-2xl border border-line/10 p-5">
        <p className="text-sm font-semibold text-ink inline-flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-accent" /> Cara export dari TikTok
        </p>
        <ol className="text-sm text-ink-muted space-y-1.5 list-decimal list-inside">
          <li>Buka TikTok Seller Center → GMV Max / iklan.</li>
          <li>Pilih rentang <span className="text-ink">1 hari</span> (mis. kemarin atau hari ini) — tiap file = 1 hari.</li>
          <li>Export "creative data for product campaigns".</li>
          <li>Download file .xlsx.</li>
          <li>Upload file di form di atas.</li>
        </ol>
        <p className="text-xs text-ink-faint mt-3">Tanggal dibaca otomatis dari nama file. Nama akun kreator juga otomatis dilengkapi setelah upload — tak perlu klik apa pun.</p>
      </div>

      {showHistory && <UploadHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  )
}
