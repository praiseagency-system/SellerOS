// Boost Center — rekomendasi video jempolan untuk di-boost + pipeline kode boost
// (diminta → ada kode → terpasang). Alur: Specialist minta kode ke kreator,
// simpan kodenya, tim Ads pasang. Sumber rekomendasi = rollup videos; pipeline =
// gmvmax_boost via context.
import { useState, useMemo, useEffect } from 'react'
import { Rocket, Copy, Check, Trash2, Zap, Plus, Search, X, CalendarClock } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { EmptyState, Pill, RoasBadge, VideoLabel, fmtRp, fmtRpC, fmtRoasX, DeltaBadge } from '../../components/gmvmax/ui'
import { loadVideosDaily } from '../../data/gmvmaxImports'
import { boostStatus, boostWindow, computeBoostPerf } from '../../utils/boostPerf'

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

const fmtD = (iso) => {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  return isNaN(d) ? iso : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

// Badge status boost berjangka (Berlangsung/Selesai) dari tanggal.
function BoostStatusBadge({ b }) {
  const st = boostStatus(b)
  if (!st) return null
  if (st === 'live') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 0 3px rgba(52,211,153,0.2)' }} />
      Berlangsung
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-fill/10 text-ink-faint">
      <span className="w-1.5 h-1.5 rounded-full bg-ink-faint" /> Selesai
    </span>
  )
}

// Panel performa "sejak di-boost" + delta vs periode sebelum (panjang sama).
function BoostPerfPanel({ b, daily }) {
  const perf = computeBoostPerf(daily, b)
  if (!perf) return null
  const { window: w, since, before } = perf
  const hasBefore = before.cost > 0 || before.revenue > 0
  return (
    <div className="mt-2.5 rounded-xl border p-3 bg-accent/[0.06] border-accent/20">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-blue-400 mb-2">
        Performa sejak di-boost · {fmtD(w.start)} {w.ongoing ? '→ kini' : `– ${fmtD(w.end)}`} · {w.lengthDays} hari
        {hasBefore && <span className="text-ink-faint"> · vs {w.lengthDays} hari sebelumnya</span>}
      </p>
      <div className="flex items-stretch divide-x divide-line/10">
        <PerfCell label="Cost" value={fmtRpC(since.cost)} />
        <PerfCell label="Revenue" value={fmtRpC(since.revenue)} tone="text-emerald-500"
          delta={hasBefore && <DeltaBadge cur={since.revenue} prev={before.revenue} fmt={fmtRpC} />} />
        <PerfCell label="Orders" value={since.orders.toLocaleString('id-ID')}
          delta={hasBefore && <DeltaBadge cur={since.orders} prev={before.orders} />} />
        <PerfCell label="ROAS" value={fmtRoasX(since.roas)}
          delta={hasBefore && before.roas != null && since.roas != null &&
            <DeltaBadge cur={since.roas} prev={before.roas} fmt={(v) => v.toFixed(1) + 'x'} percent={false} />} />
      </div>
    </div>
  )
}
function PerfCell({ label, value, delta, tone = 'text-ink-strong' }) {
  return (
    <div className="flex-1 min-w-0 px-3 first:pl-0">
      <p className="text-[9px] uppercase tracking-wide text-ink-faint mb-0.5">{label}</p>
      <p className={`text-[13px] font-semibold tabular-nums whitespace-nowrap ${tone}`}>{value}</p>
      {delta && <div className="mt-0.5">{delta}</div>}
    </div>
  )
}

export default function BoostPage() {
  const { videos, thresholds, boost, hasData, requestBoost, updateBoost, removeBoost } = useGmvMax()
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)

  // Metrik harian per video yang punya tanggal boost → hitung performa sejak
  // boost. Di-load sekali; refresh saat daftar video-berjangka berubah.
  const [daily, setDaily] = useState(new Map())
  const datedIds = useMemo(
    () => Object.values(boost).filter(b => b.boost_start).map(b => b.video_id).sort().join(','),
    [boost])
  useEffect(() => {
    const ids = datedIds ? datedIds.split(',') : []
    let active = true
    // loadVideosDaily([]) balik Map kosong — tak perlu setState sinkron.
    loadVideosDaily(ids).then(m => { if (active) setDaily(m) }).catch(() => {})
    return () => { active = false }
  }, [datedIds])

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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-ink-strong">Pipeline boost</h3>
          <button onClick={() => setShowAdd(s => !s)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              showAdd ? 'border-line/15 text-ink-muted' : 'border-accent/40 text-accent hover:bg-accent/10'
            }`}>
            {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showAdd ? 'Tutup' : 'Tambah kode'}
          </button>
        </div>
        {showAdd && (
          <AddManualPanel videos={videos} boost={boost}
            onAdd={async (v, code) => {
              await requestBoost(v)
              if (code) await updateBoost(v.videoId, { boostCode: code, status: 'ada_kode' })
              setShowAdd(false)
            }} />
        )}
        {Object.values(boost).length === 0 ? (
          <p className="text-sm text-ink-faint bg-surface rounded-2xl border border-line/10 p-4">
            Belum ada video di pipeline. Klik "Minta kode" di rekomendasi, atau "Tambah kode" untuk memasukkan video mana pun.
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
                  daily={daily.get(b.video_id)}
                  onUpdate={updateBoost} onRemove={removeBoost} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// Panel "Tambah kode" manual: cari video mana pun (judul/akun/video ID) yang
// belum di pipeline, opsional langsung tempel kodenya → status ada_kode.
function AddManualPanel({ videos, boost, onAdd }) {
  const [q, setQ] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const cands = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return videos
      .filter(v => v.videoId && !boost[v.videoId] && (
        (v.title || '').toLowerCase().includes(s) ||
        (v.account || '').toLowerCase().includes(s) ||
        v.videoId.includes(s)
      ))
      .slice(0, 8)
  }, [q, videos, boost])

  async function add(v) {
    if (busy) return
    setBusy(true)
    try { await onAdd(v, code.trim() || null) } finally { setBusy(false) }
  }

  return (
    <div className="bg-surface rounded-2xl border border-line/10 p-4 shadow-sm mb-3 space-y-2.5">
      <div className="relative">
        <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          placeholder="Cari video: judul, akun kreator, atau video ID…"
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface2 border border-line/15 text-ink text-sm" />
      </div>
      <input value={code} onChange={e => setCode(e.target.value)}
        placeholder="Kode boost / spark code (opsional — bisa diisi nanti)"
        className="w-full px-3 py-2 rounded-lg bg-surface2 border border-line/15 text-ink text-sm font-mono" />
      {q.trim() && (cands.length === 0 ? (
        <p className="text-xs text-ink-faint py-2 text-center">
          Tidak ketemu — video mungkin sudah ada di pipeline, atau di luar rentang tanggal terpilih.
        </p>
      ) : (
        <div className="space-y-1">
          {cands.map(v => (
            <button key={v.videoId} onClick={() => add(v)} disabled={busy}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-fill/5 text-left disabled:opacity-50">
              <div className="flex-1 min-w-0">
                <VideoLabel title={v.title} account={v.account} videoId={v.videoId} compact />
              </div>
              <span className="text-xs text-ink-faint flex-shrink-0">{fmtRp(v.lifetime.revenue)}</span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent text-white text-xs font-medium flex-shrink-0">
                <Plus className="w-3 h-3" /> {code.trim() ? 'Tambah + kode' : 'Tambah'}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function BoostRow({ b, daily, onUpdate, onRemove }) {
  const [code, setCode] = useState(b.boost_code || '')
  const [note, setNote] = useState(b.note || '')
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const meta = statusMeta(b.status)
  const dirty = code !== (b.boost_code || '') || note !== (b.note || '')
  const win = boostWindow(b)

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
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${STATUS_TONE[meta.tone]}`}>{meta.label}</span>
            <BoostStatusBadge b={b} />
            {win && <span className="text-xs text-ink-faint">{fmtD(win.start)} {win.ongoing ? '→ kini' : `– ${fmtD(win.end)}`} · {win.lengthDays} hari</span>}
            {!win && b.roas != null && <span className="text-xs text-ink-faint">ROAS {(+b.roas).toFixed(1)}x</span>}
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

      {/* Rentang boost — tanggal disimpan langsung saat diubah */}
      <div className="flex items-center gap-3 mt-2.5 flex-wrap">
        <CalendarClock className="w-4 h-4 text-ink-faint flex-shrink-0" />
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          Mulai boost
          <input type="date" value={b.boost_start || ''}
            onChange={e => onUpdate(b.video_id, { boostStart: e.target.value || null })}
            className="px-2 py-1 rounded-lg bg-surface2 border border-line/15 text-ink text-xs" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          Berakhir
          <input type="date" value={b.boost_end || ''} min={b.boost_start || undefined}
            onChange={e => onUpdate(b.video_id, { boostEnd: e.target.value || null })}
            className="px-2 py-1 rounded-lg bg-surface2 border border-line/15 text-ink text-xs" />
        </label>
        {b.boost_start && <span className="text-[10px] text-ink-faint">kosongkan "Berakhir" = masih berlangsung</span>}
      </div>

      {b.boost_start && <BoostPerfPanel b={b} daily={daily} />}

      {dirty && (
        <div className="flex justify-end mt-2">
          <button onClick={saveCode} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium">Simpan</button>
        </div>
      )}
    </div>
  )
}
