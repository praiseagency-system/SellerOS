// Video Overview — semua video ditrack, filter tier + status, cari, Export CSV.
import { useState, useMemo } from 'react'
import { Download, Search, Clapperboard, Wallet, TrendingUp, Target, ShoppingCart, Rocket } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { Pill, EmptyState, StatCard, DeltaBadge, fmtRpC, fmtRoasX } from '../../components/gmvmax/ui'
import VideoTable from '../../components/gmvmax/VideoTable'
import { NoteModal } from '../../components/gmvmax/modals'
import { exportVideosCsv } from '../../utils/gmvmaxCsv'

const SEGMENTS = [
  { id: 'all', label: 'Semua', tone: 'blue' },
  { id: 'scale', label: 'Scale', tone: 'green' },
  { id: 'watch', label: 'Watch / Potensi', tone: 'amber' },
  { id: 'kill', label: 'Kill', tone: 'red' },
]

const n = (v) => v.toLocaleString('id-ID')
const videoBase = (arr) => arr.filter(v => v.lifetime.cost > 0 || v.lifetime.revenue > 0)
function sumVideos(arr) {
  const s = { video: arr.length, cost: 0, revenue: 0, orders: 0, roas: null, scale: 0, watch: 0, kill: 0 }
  for (const v of arr) {
    s.cost += v.lifetime.cost || 0
    s.revenue += v.lifetime.revenue || 0
    s.orders += v.lifetime.orders || 0
    if (v.status === 'scale') s.scale++
    else if (v.status === 'watch') s.watch++
    else if (v.status === 'kill') s.kill++
  }
  s.roas = s.cost > 0 ? s.revenue / s.cost : null
  return s
}

export default function OverviewPage({ onOpenUpload }) {
  const { videos, thresholds, notes, hasData, prev, periodName } = useGmvMax()
  const [seg, setSeg] = useState('all')
  const [q, setQ] = useState('')
  const [noteVideo, setNoteVideo] = useState(null)

  const sum = useMemo(() => sumVideos(videoBase(videos)), [videos])
  const prevSum = useMemo(() => (prev ? sumVideos(videoBase(prev.videos)) : null), [prev])

  const filtered = useMemo(() => {
    let list = videos.filter(v => v.lifetime.cost > 0 || v.lifetime.revenue > 0)
    if (seg !== 'all') list = list.filter(v => v.status === seg)
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(v => (v.title || '').toLowerCase().includes(s)
        || (v.account || '').toLowerCase().includes(s) || (v.videoId || '').includes(s))
    }
    return list.sort((a, b) => b.lifetime.revenue - a.lifetime.revenue)
  }, [videos, seg, q])

  if (!hasData) return <EmptyState title="Belum ada data" desc="Upload dulu di Input Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  const counts = SEGMENTS.reduce((acc, s) => {
    acc[s.id] = s.id === 'all'
      ? videos.filter(v => v.lifetime.cost > 0 || v.lifetime.revenue > 0).length
      : videos.filter(v => v.status === s.id).length
    return acc
  }, {})

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {periodName && prev && (
        <p className="text-sm text-ink-muted -mb-1">{periodName} <span className="text-ink-faint">· vs {prev.name}</span></p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Clapperboard} tone="blue" label="Total Video" value={n(sum.video)}
          delta={<DeltaBadge cur={sum.video} prev={prevSum?.video} />} />
        <StatCard icon={Wallet} tone="amber" label="Total Cost" value={fmtRpC(sum.cost)}
          delta={<DeltaBadge cur={sum.cost} prev={prevSum?.cost} fmt={fmtRpC} goodDown />} />
        <StatCard icon={TrendingUp} tone="green" label="Revenue (GMV)" value={fmtRpC(sum.revenue)}
          delta={<DeltaBadge cur={sum.revenue} prev={prevSum?.revenue} fmt={fmtRpC} />} />
        <StatCard icon={Target} tone="blue" label="ROAS" value={fmtRoasX(sum.roas)}
          delta={<DeltaBadge cur={sum.roas} prev={prevSum?.roas} fmt={(v) => v.toFixed(1) + 'x'} />} />
        <StatCard icon={ShoppingCart} tone="blue" label="Total Orders" value={n(sum.orders)}
          delta={<DeltaBadge cur={sum.orders} prev={prevSum?.orders} />} />
        <StatCard icon={Rocket} tone="green" label="Scale" value={n(sum.scale)} sub={`${n(sum.watch)} watch · ${n(sum.kill)} kill`}
          delta={<DeltaBadge cur={sum.scale} prev={prevSum?.scale} />} />
      </div>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-1.5">
          {SEGMENTS.map(s => (
            <Pill key={s.id} active={seg === s.id} tone={s.tone} count={counts[s.id]} onClick={() => setSeg(s.id)}>{s.label}</Pill>
          ))}
        </div>
        <button onClick={() => exportVideosCsv(filtered)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-ink-muted hover:bg-fill/5 border border-line/10">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari video ID, judul, atau akun…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface border border-line/10 text-sm text-ink" />
      </div>

      <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
        <VideoTable videos={filtered} thresholds={thresholds} notes={notes} onNote={setNoteVideo} showHook showStatus />
      </div>

      {noteVideo && <NoteModal video={noteVideo} onClose={() => setNoteVideo(null)} />}
    </div>
  )
}
