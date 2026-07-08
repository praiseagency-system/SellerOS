// Import Data — halaman upload bersih (drag & drop + panduan export). Nama akun
// discrape otomatis di latar belakang setelah upload. Riwayat upload via toggle.
import { useState, useRef } from 'react'
import { UploadCloud, Loader2, History, BookOpen, CheckCircle2 } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { UploadHistoryModal } from '../../components/gmvmax/modals'
import { fmtRp } from '../../components/gmvmax/ui'

export default function InputPage() {
  const { imports, upload, busy, enriching } = useGmvMax()
  const [showHistory, setShowHistory] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)

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
        <p className="text-sm font-medium text-ink mb-3">File Data</p>
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
          <li>Pilih rentang <span className="text-ink">1 s/d hari ini</span> (bulan berjalan) untuk snapshot harian.</li>
          <li>Export "creative data for product campaigns".</li>
          <li>Download file .xlsx.</li>
          <li>Upload file di form di atas.</li>
        </ol>
        <p className="text-xs text-ink-faint mt-3">Nama akun kreator otomatis dilengkapi setelah upload — tak perlu klik apa pun.</p>
      </div>

      {showHistory && <UploadHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  )
}
