// Video Check — saring video per kondisi ROAS & spending (preset), + rekomendasi
// aksi dan catatan. Meniru "Video ID Check" Lacak.
import { useState, useMemo } from 'react'
import { Search, Sliders } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { Pill, EmptyState } from '../../components/gmvmax/ui'
import VideoTable from '../../components/gmvmax/VideoTable'
import { NoteModal, ThresholdModal } from '../../components/gmvmax/modals'

const PRESETS = [
  { id: 'top', label: 'Top Revenue + ROAS Tinggi', tone: 'green' },
  { id: 'low', label: 'ROAS Rendah', tone: 'red' },
  { id: 'hidden', label: 'ROAS Tinggi + Spending Kecil', tone: 'amber' },
]

export default function CheckPage({ onOpenUpload }) {
  const { videos, thresholds, notes, hasData } = useGmvMax()
  const [preset, setPreset] = useState('top')
  const [q, setQ] = useState('')
  const [noteVideo, setNoteVideo] = useState(null)
  const [showThreshold, setShowThreshold] = useState(false)

  const filtered = useMemo(() => {
    const spend = videos.filter(v => v.lifetime.cost > 0)
    let list
    if (preset === 'top') {
      list = spend.filter(v => v.lifetime.revenue > 0 && (v.lifetime.roas ?? 0) >= thresholds.roasGood)
        .sort((a, b) => b.lifetime.revenue - a.lifetime.revenue)
    } else if (preset === 'low') {
      list = spend.filter(v => (v.lifetime.roas ?? 0) < thresholds.roasBad && v.lifetime.cost >= thresholds.spendFloor)
        .sort((a, b) => b.lifetime.cost - a.lifetime.cost)
    } else {
      list = spend.filter(v => (v.lifetime.roas ?? 0) >= thresholds.roasGood && v.lifetime.cost < thresholds.spendFloor)
        .sort((a, b) => (b.lifetime.roas ?? 0) - (a.lifetime.roas ?? 0))
    }
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(v => (v.title || '').toLowerCase().includes(s)
        || (v.account || '').toLowerCase().includes(s) || (v.videoId || '').includes(s))
    }
    return list
  }, [videos, preset, q, thresholds])

  if (!hasData) return <EmptyState title="Belum ada data" desc="Upload dulu di Input Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <Pill key={p.id} active={preset === p.id} tone={p.tone} onClick={() => setPreset(p.id)}>{p.label}</Pill>
          ))}
        </div>
        <button onClick={() => setShowThreshold(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-ink-muted hover:bg-fill/5 border border-line/10">
          <Sliders className="w-4 h-4" /> Atur Threshold
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari video ID, judul, atau akun…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface border border-line/10 text-sm text-ink" />
      </div>

      <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
        <p className="text-xs text-ink-faint mb-2">{filtered.length} video</p>
        <VideoTable videos={filtered} thresholds={thresholds} notes={notes} onNote={setNoteVideo} showAction />
      </div>

      {noteVideo && <NoteModal video={noteVideo} onClose={() => setNoteVideo(null)} />}
      {showThreshold && <ThresholdModal onClose={() => setShowThreshold(false)} />}
    </div>
  )
}
