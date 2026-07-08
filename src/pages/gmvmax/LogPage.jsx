// Log Optimasi — jurnal kronologis semua tindakan optimasi (append). Filter per
// jenis aksi + cari, hapus per entri. Sumber: gmvmax_action_log via context.
import { useState, useMemo } from 'react'
import { Search, Trash2, ClipboardList } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { EmptyState, Pill, VideoLabel } from '../../components/gmvmax/ui'

const FILTERS = [
  { id: 'all', label: 'Semua', tone: 'blue' },
  { id: 'Scale', label: 'Scale', tone: 'green' },
  { id: 'Boost', label: 'Boost', tone: 'violet' },
  { id: 'Refresh', label: 'Refresh', tone: 'blue' },
  { id: 'Watch', label: 'Watch', tone: 'amber' },
  { id: 'Kill', label: 'Kill', tone: 'red' },
]
const ACTION_TONE = {
  Scale: 'bg-emerald-500/15 text-emerald-500', Boost: 'bg-violet-500/15 text-violet-500',
  Refresh: 'bg-blue-500/15 text-blue-500', Watch: 'bg-amber-500/15 text-amber-500',
  Kill: 'bg-red-500/15 text-red-500',
}
const fmtDate = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function LogPage() {
  const { actionLog, removeActionLog } = useGmvMax()
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  const filtered = useMemo(() => {
    let list = actionLog
    if (filter !== 'all') list = list.filter(e => e.action_tag === filter)
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(e => (e.video_title || '').toLowerCase().includes(s)
        || (e.tiktok_account || '').toLowerCase().includes(s)
        || (e.body || '').toLowerCase().includes(s)
        || (e.video_id || '').includes(s))
    }
    return list
  }, [actionLog, filter, q])

  const counts = FILTERS.reduce((acc, f) => {
    acc[f.id] = f.id === 'all' ? actionLog.length : actionLog.filter(e => e.action_tag === f.id).length
    return acc
  }, {})

  if (!actionLog.length) return <EmptyState title="Belum ada log optimasi"
    desc="Setiap kali kamu simpan aksi/catatan di sebuah video (naikkan budget, refresh hook, dll), tindakan itu tercatat di sini beserta tanggal & ROAS-nya." />

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <Pill key={f.id} active={filter === f.id} tone={f.tone} count={counts[f.id]} onClick={() => setFilter(f.id)}>{f.label}</Pill>
        ))}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari video, akun, atau isi catatan…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface border border-line/10 text-sm text-ink" />
      </div>

      <p className="text-xs text-ink-faint">{filtered.length} entri</p>

      <div className="space-y-2">
        {filtered.map(e => (
          <div key={e.id} className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0 mt-0.5">
              <ClipboardList className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {e.action_tag && <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${ACTION_TONE[e.action_tag] || 'bg-fill/10 text-ink-faint'}`}>{e.action_tag}</span>}
                <span className="text-xs text-ink-faint">{fmtDate(e.created_at)}</span>
                {e.roas != null && <span className="text-xs text-ink-faint">· ROAS {(+e.roas).toFixed(1)}x</span>}
                {e.snapshot_date && <span className="text-xs text-ink-faint">· snapshot {e.snapshot_date}</span>}
              </div>
              {(e.video_title || e.video_id) && (
                <div className="mt-1">
                  <VideoLabel title={e.video_title} account={e.tiktok_account} videoId={e.video_id} compact linkVideo />
                </div>
              )}
              {e.body && <p className="text-sm text-ink-muted mt-1">{e.body}</p>}
            </div>
            {confirmId === e.id ? (
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => { removeActionLog(e.id); setConfirmId(null) }} className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs">Hapus</button>
                <button onClick={() => setConfirmId(null)} className="px-2 py-1 rounded-lg text-ink-muted text-xs">Batal</button>
              </div>
            ) : (
              <button onClick={() => setConfirmId(e.id)} className="text-ink-faint hover:text-red-500 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
