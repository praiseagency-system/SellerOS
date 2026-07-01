// Modal modul GMV Max: Upload data, Atur Threshold, Note/Log per video.
import { useState, useRef } from 'react'
import { X, UploadCloud, Loader2, Sliders, FileSpreadsheet } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { fmtRp } from './ui'

function Overlay({ title, icon: Icon, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-line/10 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-line/10">
          {Icon && <Icon className="w-4 h-4 text-accent" />}
          <h3 className="font-semibold text-ink-strong flex-1">{title}</h3>
          <button onClick={onClose} className="text-ink-faint hover:text-ink"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line/10 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

// ─── Upload ──────────────────────────────────────────────────────────────────
export function UploadModal({ onClose }) {
  const { upload, busy } = useGmvMax()
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)
  const inputRef = useRef(null)

  async function handleFile(file) {
    if (!file) return
    setErr(null)
    const r = await upload(file)
    if (r.ok) setResult(r.meta)
    else setErr(r.error)
  }

  return (
    <Overlay title="Upload Data GMV Max" icon={UploadCloud} onClose={onClose}
      footer={result
        ? <button onClick={onClose} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Selesai</button>
        : null}>
      {!result ? (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="w-full border-2 border-dashed border-line/20 rounded-xl py-10 flex flex-col items-center gap-2 hover:border-accent/50 transition-colors disabled:opacity-60"
          >
            {busy
              ? <Loader2 className="w-6 h-6 text-accent animate-spin" />
              : <FileSpreadsheet className="w-6 h-6 text-ink-faint" />}
            <span className="text-sm text-ink-muted">{busy ? 'Memproses…' : 'Klik untuk pilih file .xlsx'}</span>
            <span className="text-xs text-ink-faint">Export "creative data for product campaigns" TikTok Shop</span>
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => handleFile(e.target.files?.[0])} />
          {err && <p className="text-xs text-red-500 mt-3">{err}</p>}
        </>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-emerald-500 font-medium">✓ Berhasil diimpor — {result.name}</p>
          <div className="grid grid-cols-2 gap-2 text-ink-muted">
            <Info label="Baris" value={result.rowCount} />
            <Info label="Video" value={result.videoCount} />
            <Info label="Total Cost" value={fmtRp(result.totals?.cost)} />
            <Info label="Total Revenue" value={fmtRp(result.totals?.revenue)} />
          </div>
        </div>
      )}
    </Overlay>
  )
}
const Info = ({ label, value }) => (
  <div><span className="text-ink-faint">{label}: </span><span className="text-ink font-medium">{value}</span></div>
)

// ─── Threshold ───────────────────────────────────────────────────────────────
export function ThresholdModal({ onClose }) {
  const { thresholds, updateThresholds } = useGmvMax()
  const [t, setT] = useState(thresholds)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setT(s => ({ ...s, [k]: Number(v) }))

  async function save() {
    setSaving(true)
    try { await updateThresholds(t); onClose() } finally { setSaving(false) }
  }

  return (
    <Overlay title="Atur Threshold ROAS" icon={Sliders} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-ink-muted text-sm">Batal</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </>}>
      <div className="space-y-3">
        <Field label="Sangat Bagus (≥)" hint="ROAS minimal tier tertinggi" value={t.roasGreat} onChange={v => set('roasGreat', v)} />
        <Field label="Bagus / Tinggi (≥)" hint="Ambang hijau" value={t.roasGood} onChange={v => set('roasGood', v)} />
        <Field label="Buruk / Rendah (<)" hint="Di bawah ini = merah" value={t.roasBad} onChange={v => set('roasBad', v)} />
        <Field label="Lantai Spend (Rp)" hint="ROAS tinggi di bawah ini = Potensi, bukan Scale" value={t.spendFloor} step={10000} onChange={v => set('spendFloor', v)} />
      </div>
    </Overlay>
  )
}
function Field({ label, hint, value, onChange, step = 0.5 }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input type="number" step={step} value={value} onChange={e => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-surface2 border border-line/15 text-ink text-sm" />
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  )
}

// ─── Note/Log ────────────────────────────────────────────────────────────────
const ACTIONS = ['', 'Scale', 'Boost', 'Refresh', 'Watch', 'Kill']
export function NoteModal({ video, onClose }) {
  const { notes, setNote, clearNote } = useGmvMax()
  const existing = notes[video.videoId]
  const [body, setBody] = useState(existing?.body || '')
  const [actionTag, setActionTag] = useState(existing?.action_tag || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try { await setNote(video.videoId, { body, actionTag: actionTag || null }); onClose() }
    finally { setSaving(false) }
  }

  return (
    <Overlay title="Catatan / Log Video" onClose={onClose}
      footer={<>
        {existing && <button onClick={async () => { await clearNote(video.videoId); onClose() }}
          className="px-4 py-2 rounded-lg text-red-500 text-sm mr-auto">Hapus</button>}
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-ink-muted text-sm">Batal</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </>}>
      <p className="text-sm text-ink-muted mb-3 truncate">{video.title || video.videoId}</p>
      <label className="block mb-3">
        <span className="text-sm font-medium text-ink">Aksi</span>
        <select value={actionTag} onChange={e => setActionTag(e.target.value)}
          className="mt-1 w-full px-3 py-2 rounded-lg bg-surface2 border border-line/15 text-ink text-sm">
          {ACTIONS.map(a => <option key={a} value={a}>{a || '— tanpa aksi —'}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">Catatan</span>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
          placeholder="mis. Naikkan budget 30%, brief kreator reshoot hook before-after…"
          className="mt-1 w-full px-3 py-2 rounded-lg bg-surface2 border border-line/15 text-ink text-sm resize-none" />
      </label>
    </Overlay>
  )
}
