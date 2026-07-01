// Input Data — tabel mentah semua baris + filter, tombol Upload. Meniru
// "Input Data Ads" Lacak.
import { useState, useMemo } from 'react'
import { UploadCloud, Search, AtSign, Loader2 } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { RoasBadge, EmptyState, fmtRp, VideoIdLink } from '../../components/gmvmax/ui'

const LIMIT = 300

export default function InputPage({ onOpenUpload }) {
  const { rows, thresholds, hasData, missingAccountCount, enriching, enrichUsernames } = useGmvMax()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [roasMin, setRoasMin] = useState('')
  const [costMax, setCostMax] = useState('')

  const statuses = useMemo(() => [...new Set(rows.map(r => r.status).filter(Boolean))], [rows])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (status && r.status !== status) return false
      if (type && r.creativeType !== type) return false
      if (roasMin && (r.roas ?? -1) < Number(roasMin)) return false
      if (costMax && (r.cost ?? 0) > Number(costMax)) return false
      if (q.trim()) {
        const s = q.toLowerCase()
        if (!((r.campaignName || '').toLowerCase().includes(s)
          || (r.videoTitle || '').toLowerCase().includes(s)
          || (r.tiktokAccount || '').toLowerCase().includes(s))) return false
      }
      return true
    }).sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
  }, [rows, status, type, roasMin, costMax, q])

  if (!hasData) return <EmptyState title="Belum ada data GMV Max"
    desc="Upload file export creative TikTok Shop untuk mulai."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium inline-flex items-center gap-2"><UploadCloud className="w-4 h-4" /> Upload Data</button>} />

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Total {rows.length.toLocaleString('id-ID')} baris · Threshold ROAS: <span className="text-emerald-500 font-medium">{thresholds.roasGood}</span> / <span className="text-red-500 font-medium">{thresholds.roasBad}</span></p>
        <div className="flex items-center gap-2">
          {(missingAccountCount > 0 || enriching) && (
            <button onClick={() => enrichUsernames()} disabled={!!enriching}
              className="px-3 py-2 rounded-lg text-sm border border-line/15 text-ink-muted hover:bg-fill/5 inline-flex items-center gap-2 disabled:opacity-70">
              {enriching
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Scraping {enriching.done}/{enriching.total}…</>
                : <><AtSign className="w-4 h-4" /> Lengkapi nama akun ({missingAccountCount})</>}
            </button>
          )}
          <button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium inline-flex items-center gap-2">
            <UploadCloud className="w-4 h-4" /> Upload Data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="relative col-span-2 md:col-span-1">
          <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari…"
            className="w-full pl-9 pr-2 py-2 rounded-lg bg-surface border border-line/10 text-sm text-ink" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className="px-2 py-2 rounded-lg bg-surface border border-line/10 text-sm text-ink">
          <option value="">Semua status</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} className="px-2 py-2 rounded-lg bg-surface border border-line/10 text-sm text-ink">
          <option value="">Semua tipe</option>
          <option value="Video">Video</option>
          <option value="Product card">Product card</option>
        </select>
        <input value={roasMin} onChange={e => setRoasMin(e.target.value)} type="number" placeholder="ROAS min"
          className="px-2 py-2 rounded-lg bg-surface border border-line/10 text-sm text-ink" />
        <input value={costMax} onChange={e => setCostMax(e.target.value)} type="number" placeholder="Cost max"
          className="px-2 py-2 rounded-lg bg-surface border border-line/10 text-sm text-ink" />
      </div>

      <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm overflow-x-auto">
        <p className="text-xs text-ink-faint mb-2">{filtered.length.toLocaleString('id-ID')} baris {filtered.length > LIMIT && `(menampilkan ${LIMIT})`}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-faint border-b border-line/10">
              <th className="py-2 pr-3 font-medium">VIDEO ID</th>
              <th className="py-2 px-3 font-medium">STATUS</th>
              <th className="py-2 px-3 font-medium">TIPE</th>
              <th className="py-2 px-3 font-medium">AKUN</th>
              <th className="py-2 px-3 font-medium">KAMPANYE</th>
              <th className="py-2 px-3 font-medium text-right">COST</th>
              <th className="py-2 px-3 font-medium text-right">REVENUE</th>
              <th className="py-2 px-3 font-medium text-right">ROAS</th>
              <th className="py-2 pl-3 font-medium text-right">ORDERS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, LIMIT).map((r, i) => (
              <tr key={r.videoId ? r.videoId + i : i} className="border-b border-line/5 hover:bg-fill/5">
                <td className="py-2 pr-3">{r.creativeType === 'Video' ? <VideoIdLink videoId={r.videoId} account={r.tiktokAccount} /> : <span className="text-ink-faint">—</span>}</td>
                <td className="py-2 px-3 text-ink-muted whitespace-nowrap">{r.status || '—'}</td>
                <td className="py-2 px-3 text-ink-muted">{r.creativeType}</td>
                <td className="py-2 px-3 text-ink-muted truncate max-w-[120px]">{r.tiktokAccount || '—'}</td>
                <td className="py-2 px-3 text-ink truncate max-w-[160px]">{r.campaignName}</td>
                <td className="py-2 px-3 text-right text-ink-muted whitespace-nowrap">{fmtRp(r.cost)}</td>
                <td className="py-2 px-3 text-right text-ink whitespace-nowrap">{fmtRp(r.grossRevenue)}</td>
                <td className="py-2 px-3 text-right"><RoasBadge roas={r.roas} thresholds={thresholds} showLabel={false} /></td>
                <td className="py-2 pl-3 text-right text-ink-muted">{r.skuOrders || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
