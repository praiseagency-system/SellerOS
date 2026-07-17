import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight, GitCompare, BarChart2, X } from 'lucide-react'
import { PlatformIcon } from './PlatformIcon'

const PLATFORMS = [
  {
    id: 'shopee',
    label: 'Shopee',
    color: 'bg-blue-600',
    border: 'border-blue-600',
    ring: 'ring-blue-500',
    files: [
      { key: 'perf',  label: 'Data Performa Produk', required: true,  accept: '.xlsx,.xls,.csv', hint: 'Seller Center → Performa Toko → Produk → Performa Produk → Download' },
      { key: 'iklan', label: 'Data Iklan Shopee',    required: false, accept: '.csv',             hint: 'Iklan Shopee → Laporan → Data Keseluruhan Iklan → Download CSV' },
    ],
  },
  {
    id: 'tiktok',
    label: 'TikTok Shop',
    color: 'bg-gray-900',
    border: 'border-gray-900',
    ring: 'ring-gray-400',
    files: [
      { key: 'perf', label: 'Products Card List', required: true, accept: '.xlsx,.xls,.csv', hint: 'Seller Center → Analitik Produk → Kartu Produk → Export' },
    ],
  },
]

function UploadZone({ label, hint, required, accept, file, onFile }) {
  const ref = useRef(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-ink">{label}</span>
        {required
          ? <span className="text-xs bg-blue-600/15 text-blue-500 px-1.5 py-0.5 rounded-full">Wajib</span>
          : <span className="text-xs bg-fill/5 text-ink-muted px-1.5 py-0.5 rounded-full">Opsional</span>}
      </div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]) }}
        onClick={() => ref.current?.click()}
        className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all
          ${file ? 'border-green-500/40 bg-green-500/5' : dragging ? 'border-blue-500/60 bg-blue-600/5' : 'border-line/10 hover:border-blue-600/40 hover:bg-fill/5'}`}
      >
        <input ref={ref} type="file" accept={accept} className="hidden"
          onChange={e => onFile(e.target.files[0])} />
        {file ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-xs font-medium text-green-700 truncate flex-1">{file.name}</span>
            <button onClick={e => { e.stopPropagation(); onFile(null) }}
              className="text-ink-muted hover:text-ink-faint text-xs flex-shrink-0">×</button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-1">
            <Upload className="w-3.5 h-3.5 text-ink" />
            <span className="text-xs text-ink-muted">Klik atau drop</span>
          </div>
        )}
      </div>
      <p className="text-xs text-ink-muted leading-snug">{hint}</p>
    </div>
  )
}

function PeriodeBlock({ label, accent, fileKeys, files, setFiles, platformFiles }) {
  return (
    <div className={`space-y-3 p-4 rounded-xl border ${accent}`}>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${accent.includes('orange') ? 'bg-blue-600' : 'bg-gray-400'}`} />
        <span className={`text-xs font-bold uppercase tracking-wide ${accent.includes('orange') ? 'text-blue-500' : 'text-ink-muted'}`}>
          {label}
        </span>
      </div>
      {platformFiles.map(f => (
        <UploadZone key={f.key} label={f.label} hint={f.hint} required={f.required} accept={f.accept}
          file={files[fileKeys[f.key]]}
          onFile={v => setFiles(prev => ({ ...prev, [fileKeys[f.key]]: v }))} />
      ))}
    </div>
  )
}

export default function FileUpload({ onUpload, isLoading, error, pendingPrevSession, onClearPending }) {
  const [platform, setPlatform] = useState('shopee')
  const [mode, setMode] = useState('single')
  const [files, setFiles] = useState({})

  const plat = PLATFORMS.find(p => p.id === platform)

  // Check if ready to submit
  const ready = mode === 'single'
    ? !!files.perf
    : (!!files.perf && !!files.prevPerf)

  function handleSubmit() {
    if (!ready) return
    onUpload({
      platform,
      mode,
      perf:     files.perf  || null,
      iklan:    files.iklan || null,
      prevPerf: files.prevPerf  || null,
      prevIklan: files.prevIklan || null,
    })
  }

  // Reset files when platform changes
  function switchPlatform(id) {
    setPlatform(id)
    setFiles({})
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-transparent">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600/15 mb-3">
            <FileSpreadsheet className="w-6 h-6 text-blue-500" />
          </div>
          <h1 className="text-xl font-bold text-ink-strong">Kuadran Traffic Conversion</h1>
          <p className="text-ink-muted mt-1 text-sm">Pilih platform dan upload data untuk memulai analisis</p>
        </div>

        {/* Banner: comparing from history */}
        {pendingPrevSession && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 flex items-center gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-purple-700">Membandingkan dengan sesi tersimpan</p>
              <p className="text-xs text-purple-500 truncate mt-0.5">Periode Lalu: <strong>{pendingPrevSession.label}</strong></p>
            </div>
            <button onClick={onClearPending} className="text-purple-400 hover:text-purple-600 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="bg-surface rounded-2xl border border-line/8 shadow-xl p-5 space-y-4">

          {/* Platform selector */}
          <div>
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2 select-none">Platform</p>
            <div className="flex gap-2">
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={() => switchPlatform(p.id)}
                  className={`flex items-center gap-2 flex-1 justify-center py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    platform === p.id
                      ? `${p.color} text-white ${p.border}`
                      : 'border-line/10 text-ink-muted hover:border-line/20 bg-fill/5'
                  }`}>
                  <PlatformIcon id={p.id} />{p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-line/10" />

          {/* Mode toggle */}
          <div>
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2 select-none">Mode</p>
            <div className="flex gap-2">
              {[
                { id: 'single',  label: 'Satu Periode',           icon: BarChart2 },
                { id: 'compare', label: 'Bandingkan Dua Periode',  icon: GitCompare },
              ].map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => { setMode(id); setFiles({}) }}
                  className={`flex items-center gap-2 flex-1 justify-center py-2 rounded-xl text-sm font-medium border transition-all ${
                    mode === id
                      ? 'bg-fill/10 text-ink-strong border-line/20'
                      : 'border-line/10 text-ink-muted hover:border-line/20 hover:text-ink'
                  }`}>
                  <Icon className="w-4 h-4" />{label}
                </button>
              ))}
            </div>
          </div>

          {/* Upload zones */}
          {mode === 'single' ? (
            <div className="space-y-4">
              {plat.files.map(f => (
                <UploadZone key={f.key} label={f.label} hint={f.hint} required={f.required} accept={f.accept}
                  file={files[f.key]}
                  onFile={v => setFiles(prev => ({ ...prev, [f.key]: v }))} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <PeriodeBlock label="Periode Lalu" accent="bg-fill/3 border-line/8"
                fileKeys={{ perf: 'prevPerf', iklan: 'prevIklan' }}
                files={files} setFiles={setFiles} platformFiles={plat.files} />
              <PeriodeBlock label="Periode Ini" accent="bg-blue-600/5 border-blue-600/15"
                fileKeys={{ perf: 'perf', iklan: 'iklan' }}
                files={files} setFiles={setFiles} platformFiles={plat.files} />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <button onClick={handleSubmit} disabled={!ready || isLoading}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
              ready && !isLoading
                ? `${plat.color} text-white shadow-sm hover:opacity-90`
                : 'bg-gray-100 text-ink-muted cursor-not-allowed'
            }`}>
            {isLoading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Memproses...</>
              : <>{mode === 'compare' ? 'Bandingkan Periode' : 'Mulai Analisis'}<ArrowRight className="w-4 h-4" /></>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
