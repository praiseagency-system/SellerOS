// Modal modul GMV Max: Upload data, Atur Threshold, Note/Log per video.
import { useState, useRef } from 'react'
import { X, UploadCloud, Loader2, Sliders, FileSpreadsheet, History, Calendar, Trash2 } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { fmtRp, fmtRoasX } from './ui'

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
          <p className="text-xs text-ink-faint mt-3 leading-relaxed">
            <span className="text-ink-muted font-medium">Tips harian:</span> export rentang <b>1 s/d hari ini</b> bulan
            berjalan, lalu upload sekali sehari. Tiap upload jadi snapshot bertanggal — tool otomatis menghitung angka
            harian & tren. Upload ulang tanggal sama akan menimpa (memperbaiki).
          </p>
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

// ─── Riwayat Upload ──────────────────────────────────────────────────────────
// Daftar snapshot yang sudah di-upload + hapus. Dibuka dari toggle di Import Data.
export function UploadHistoryModal({ onClose }) {
  const { imports, removeImport, busy } = useGmvMax()
  const [confirmId, setConfirmId] = useState(null)
  return (
    <Overlay title="Riwayat upload" icon={History} onClose={onClose}>
      {imports.length === 0 ? (
        <p className="text-sm text-ink-faint py-6 text-center">Belum ada upload.</p>
      ) : (
        <ul className="space-y-2 max-h-[24rem] overflow-y-auto">
          {imports.map(imp => (
            <li key={imp.id} className="flex items-center gap-3 bg-surface2 rounded-xl border border-line/10 p-3">
              <span className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink text-sm">{imp.name}</p>
                <p className="text-xs text-ink-faint truncate">
                  {imp.start_date && imp.end_date ? `${imp.start_date} — ${imp.end_date} · ` : ''}{imp.source_filename}
                </p>
              </div>
              <div className="text-right text-xs flex-shrink-0 hidden sm:block">
                <p className="text-ink">{fmtRp(imp.totals?.revenue)}</p>
                <p className="text-ink-faint">ROAS {fmtRoasX(imp.totals?.roas)}</p>
              </div>
              {confirmId === imp.id ? (
                <div className="flex gap-1 flex-shrink-0">
                  <button disabled={busy} onClick={() => removeImport(imp.id)} className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs">Hapus</button>
                  <button onClick={() => setConfirmId(null)} className="px-2 py-1 rounded-lg text-ink-muted text-xs">Batal</button>
                </div>
              ) : (
                <button onClick={() => setConfirmId(imp.id)} className="text-ink-faint hover:text-red-500 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Overlay>
  )
}

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
        <Field label="Lantai Kill (Rp)" hint="ROAS rugi tapi spend di bawah ini = Watch, bukan Kill" value={t.killFloor} step={10000} onChange={v => set('killFloor', v)} />
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
const ACTION_TONE = {
  Scale: 'bg-emerald-500/15 text-emerald-500', Boost: 'bg-violet-500/15 text-violet-500',
  Refresh: 'bg-blue-500/15 text-blue-500', Watch: 'bg-amber-500/15 text-amber-500',
  Kill: 'bg-red-500/15 text-red-500',
}
const fmtLogDate = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function NoteModal({ video, onClose }) {
  const { notes, setNote, clearNote, actionLog, logAction, removeActionLog } = useGmvMax()
  const existing = notes[video.videoId]
  const [body, setBody] = useState(existing?.body || '')
  const [actionTag, setActionTag] = useState(existing?.action_tag || '')
  const [saving, setSaving] = useState(false)

  const history = actionLog.filter(e => e.video_id === video.videoId)

  async function save() {
    setSaving(true)
    try {
      await setNote(video.videoId, { body, actionTag: actionTag || null })
      // Rekam ke Log Optimasi (append) hanya bila ada isi.
      if (actionTag || body.trim()) {
        await logAction({
          videoId: video.videoId, videoTitle: video.title, tiktokAccount: video.account,
          actionTag: actionTag || null, body: body.trim() || null, roas: video.lifetime?.roas ?? null,
        })
      }
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Overlay title="Catatan / Log Video" onClose={onClose}
      footer={<>
        {existing && <button onClick={async () => { await clearNote(video.videoId); onClose() }}
          className="px-4 py-2 rounded-lg text-red-500 text-sm mr-auto">Hapus catatan aktif</button>}
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-ink-muted text-sm">Batal</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">
          {saving ? 'Menyimpan…' : 'Simpan & catat'}
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
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
          placeholder="mis. Naikkan budget 30%, brief kreator reshoot hook before-after…"
          className="mt-1 w-full px-3 py-2 rounded-lg bg-surface2 border border-line/15 text-ink text-sm resize-none" />
      </label>

      {history.length > 0 && (
        <div className="mt-4 border-t border-line/10 pt-3">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-faint mb-2">Riwayat optimasi</p>
          <ul className="space-y-2 max-h-44 overflow-y-auto">
            {history.map(e => (
              <li key={e.id} className="flex items-start gap-2 text-sm group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {e.action_tag && <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${ACTION_TONE[e.action_tag] || 'bg-fill/10 text-ink-faint'}`}>{e.action_tag}</span>}
                    <span className="text-xs text-ink-faint">{fmtLogDate(e.created_at)}</span>
                    {e.roas != null && <span className="text-xs text-ink-faint">· ROAS {(+e.roas).toFixed(1)}x</span>}
                  </div>
                  {e.body && <p className="text-ink-muted text-xs mt-0.5">{e.body}</p>}
                </div>
                <button onClick={() => removeActionLog(e.id)}
                  className="text-ink-faint hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Hapus entri">
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Overlay>
  )
}
