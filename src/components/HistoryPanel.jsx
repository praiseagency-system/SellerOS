import { useRef } from 'react'
import { X, Trash2, Download, Upload, Clock, FolderOpen } from 'lucide-react'
import { QUADRANT_CONFIG } from '../utils/quadrantUtils'
import { deleteSession, exportSession, importSession, saveSession } from '../utils/storage'

const PLATFORM_STYLE = {
  shopee: { emoji: '🛍️', color: 'bg-blue-600/15 text-blue-500' },
  tiktok: { emoji: '🎵', color: 'bg-fill/10 text-ink' },
}

function SessionCard({ session, onDelete, onExport, onLoad, isLatest }) {
  const plat = PLATFORM_STYLE[session.platform] || PLATFORM_STYLE.shopee
  const date = new Date(session.savedAt)
  const dateStr = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="bg-fill/3 rounded-xl border border-line/5 p-4 hover:border-line/10 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-ink text-sm truncate">{session.label}</p>
            {isLatest && (
              <span className="text-xs bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full flex-shrink-0">terbaru</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${plat.color}`}>
              {plat.emoji} {session.platform === 'tiktok' ? 'TikTok' : 'Shopee'}
            </span>
            <span className="text-xs text-ink-muted flex items-center gap-1">
              <Clock className="w-3 h-3" />{dateStr}
            </span>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => onLoad(session)} title="Buka periode ini"
            className="p-1.5 rounded-lg text-ink-muted hover:text-accent hover:bg-accent/10">
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onExport(session)} title="Export JSON"
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-fill/5">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(session.id)} title="Hapus"
            className="p-1.5 rounded-lg text-ink-muted hover:text-red-400 hover:bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary quadrant counts */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {[1, 2, 3, 4].map(q => {
          const cfg = QUADRANT_CONFIG[q]
          const count = session.summary?.[q] ?? 0
          return (
            <div key={q} className="text-center rounded-lg py-1.5 px-1"
              style={{ background: cfg.color + '20' }}>
              <p className="text-xs font-bold" style={{ color: cfg.color }}>{count}</p>
              <p className="text-xs text-ink-muted leading-tight mt-0.5">Q{q}</p>
            </div>
          )
        })}
      </div>

      {/* Settings snippet */}
      <div className="text-xs text-ink-faint">
        Benchmark: {session.settings?.trafficThreshold ?? (session.settings?.targetHarian * session.settings?.periodDays)} · {session.settings?.conversionThreshold}% CR · {session.settings?.periodDays}h
      </div>
    </div>
  )
}

export default function HistoryPanel({ sessions, onClose, onSessionsChange, onLoad }) {
  const importRef = useRef(null)

  async function handleImport(file) {
    try {
      const session = await importSession(file)
      saveSession(session)
      onSessionsChange()
    } catch (e) {
      alert('Gagal import: ' + e.message)
    }
  }

  function handleDelete(id) {
    if (!confirm('Hapus sesi ini?')) return
    deleteSession(id)
    onSessionsChange()
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="w-80 bg-surface2 h-full flex flex-col shadow-2xl border-l border-line/10">
        {/* Header */}
        <div className="border-b border-line/5 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-ink-strong text-sm">Riwayat Periode</h3>
            <p className="text-xs text-ink-muted">{sessions.length} periode tersimpan</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => importRef.current?.click()} title="Import JSON"
              className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink border border-line/10 rounded-lg px-2 py-1.5">
              <Upload className="w-3 h-3" />Import
            </button>
            <input ref={importRef} type="file" accept=".json" className="hidden"
              onChange={e => handleImport(e.target.files[0])} />
            <button onClick={onClose} className="text-ink-muted hover:text-ink">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-ink-faint">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Belum ada periode tersimpan</p>
              <p className="text-xs mt-1">Setiap upload otomatis tersimpan di sini</p>
            </div>
          ) : (
            sessions.map((s, i) => (
              <SessionCard
                key={s.id}
                session={s}
                isLatest={i === 0}
                onDelete={handleDelete}
                onExport={exportSession}
                onLoad={onLoad}
              />
            ))
          )}
        </div>

        <div className="border-t border-line/5 px-4 py-3 flex-shrink-0">
          <p className="text-xs text-ink-faint leading-relaxed">
            Saat upload data baru, sistem otomatis membandingkan dengan periode terbaru di workspace ini.
          </p>
        </div>
      </div>
    </div>
  )
}
