// Boost Center — rekomendasi video jempolan untuk di-boost + pipeline kode boost
// (diminta → ada kode → terpasang). Alur: Specialist minta kode ke kreator,
// simpan kodenya, tim Ads pasang. Sumber rekomendasi = rollup videos; pipeline =
// gmvmax_boost via context.
import { useState, useMemo } from 'react'
import { Rocket, Copy, Check, Trash2, Zap } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { EmptyState, Pill, RoasBadge, VideoLabel, fmtRp } from '../../components/gmvmax/ui'

const STATUS = [
  { id: 'diminta', label: 'Diminta ke kreator', tone: 'amber' },
  { id: 'ada_kode', label: 'Kode tersedia', tone: 'blue' },
  { id: 'terpasang', label: 'Terpasang (Ads)', tone: 'green' },
  { id: 'skip', label: 'Dilewati', tone: 'muted' },
]
const STATUS_TONE = {
  amber: 'bg-amber-500/15 text-amber-500', blue: 'bg-blue-500/15 text-blue-500',
  green: 'bg-emerald-500/15 text-emerald-500', muted: 'bg-fill/10 text-ink-faint',
}
const statusMeta = id => STATUS.find(s => s.id === id) || STATUS[0]

export default function BoostPage() {
  const { videos, thresholds, boost, hasData, requestBoost, updateBoost, removeBoost } = useGmvMax()
  const [filter, setFilter] = useState('all')

  // Rekomendasi: pemenang terbukti (ROAS ≥ ambang bagus, ada revenue & order) yang
  // BELUM masuk pipeline. Kandidat spend-kecil ditandai "organik" (prioritas).
  const recs = useMemo(() => {
    return videos
      .filter(v => v.videoId && !boost[v.videoId]
        && (v.lifetime.roas ?? 0) >= thresholds.roasGood
        && v.lifetime.revenue > 0 && (v.lifetime.orders || 0) >= 1)
      .map(v => ({ ...v, organic: v.lifetime.cost < thresholds.spendFloor }))
      .sort((a, b) => b.lifetime.revenue - a.lifetime.revenue)
      .slice(0, 30)
  }, [videos, boost, thresholds])

  const pipeline = useMemo(() => {
    let list = Object.values(boost)
    if (filter !== 'all') list = list.filter(b => b.status === filter)
    return list.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
  }, [boost, filter])

  const counts = STATUS.reduce((acc, s) => {
    acc[s.id] = Object.values(boost).filter(b => b.status === s.id).length
    return acc
  }, { all: Object.values(boost).length })

  if (!hasData) return <EmptyState title="Belum ada data"
    desc="Upload dulu di Input Data untuk melihat rekomendasi video yang layak di-boost." />

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* ── Rekomendasi ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-lg bg-violet-500/15 text-violet-500 flex items-center justify-center"><Zap className="w-4 h-4" /></span>
          <h3 className="text-sm font-bold text-ink-strong">Rekomendasi minta kode boost</h3>
          <span className="text-xs text-ink-faint">{recs.length} video jempolan</span>
        </div>
        {recs.length === 0 ? (
          <p className="text-sm text-ink-faint bg-surface rounded-2xl border border-line/10 p-4">
            Tak ada video baru yang memenuhi syarat (ROAS ≥ {thresholds.roasGood}x, ada order) di luar pipeline. 🎉
          </p>
        ) : (
          <div className="space-y-2">
            {recs.map(v => (
              <div key={v.videoId} className="bg-surface rounded-2xl border border-line/10 p-3.5 shadow-sm flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <VideoLabel title={v.title} account={v.account} videoId={v.videoId} compact linkVideo />
                  <div className="flex items-center gap-2 mt-1">
                    <RoasBadge roas={v.lifetime.roas} thresholds={thresholds} showLabel={false} />
                    <span className="text-xs text-ink-faint">{fmtRp(v.lifetime.revenue)} · {v.lifetime.orders || 0} order</span>
                    {v.organic && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-500 font-medium">organik · spend kecil</span>}
                  </div>
                </div>
                <button onClick={() => requestBoost(v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium flex-shrink-0">
                  <Rocket className="w-4 h-4" /> Minta kode
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Pipeline ────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-bold text-ink-strong mb-3">Pipeline boost</h3>
        {Object.values(boost).length === 0 ? (
          <p className="text-sm text-ink-faint bg-surface rounded-2xl border border-line/10 p-4">
            Belum ada video di pipeline. Klik "Minta kode" di rekomendasi untuk memulai.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <Pill active={filter === 'all'} tone="blue" count={counts.all} onClick={() => setFilter('all')}>Semua</Pill>
              {STATUS.map(s => (
                <Pill key={s.id} active={filter === s.id} tone={s.tone} count={counts[s.id]} onClick={() => setFilter(s.id)}>{s.label}</Pill>
              ))}
            </div>
            <div className="space-y-2">
              {pipeline.map(b => (
                <BoostRow key={b.video_id} b={b} thresholds={thresholds}
                  onUpdate={updateBoost} onRemove={removeBoost} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function BoostRow({ b, onUpdate, onRemove }) {
  const [code, setCode] = useState(b.boost_code || '')
  const [note, setNote] = useState(b.note || '')
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const meta = statusMeta(b.status)
  const dirty = code !== (b.boost_code || '') || note !== (b.note || '')

  const copy = () => {
    if (!code) return
    navigator.clipboard?.writeText(code)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  // Isi kode → auto-naikkan status ke 'ada_kode' bila masih 'diminta'.
  const saveCode = () => {
    const nextStatus = b.status === 'diminta' && code.trim() ? 'ada_kode' : b.status
    onUpdate(b.video_id, { boostCode: code.trim() || null, note: note.trim() || null, status: nextStatus })
  }

  return (
    <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <VideoLabel title={b.video_title} account={b.tiktok_account} videoId={b.video_id} compact linkVideo />
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${STATUS_TONE[meta.tone]}`}>{meta.label}</span>
            {b.roas != null && <span className="text-xs text-ink-faint">ROAS {(+b.roas).toFixed(1)}x</span>}
          </div>
        </div>
        <select value={b.status} onChange={e => onUpdate(b.video_id, { status: e.target.value })}
          className="px-2 py-1.5 rounded-lg bg-surface2 border border-line/15 text-ink text-xs">
          {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {confirm ? (
          <div className="flex gap-1">
            <button onClick={() => onRemove(b.video_id)} className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs">Hapus</button>
            <button onClick={() => setConfirm(false)} className="px-2 py-1 rounded-lg text-ink-muted text-xs">Batal</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className="text-ink-faint hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <div className="relative flex-1">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="Tempel kode boost / spark code dari kreator…"
            className="w-full px-3 py-2 pr-9 rounded-lg bg-surface2 border border-line/15 text-ink text-sm font-mono" />
          {code && (
            <button onClick={copy} title="Salin kode" className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-accent">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Catatan (opsional) — mis. sudah diserahkan ke tim Ads"
        className="w-full mt-2 px-3 py-2 rounded-lg bg-surface2 border border-line/15 text-ink text-sm" />
      {dirty && (
        <div className="flex justify-end mt-2">
          <button onClick={saveCode} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium">Simpan</button>
        </div>
      )}
    </div>
  )
}
