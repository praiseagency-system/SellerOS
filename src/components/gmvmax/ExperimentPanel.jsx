// Eksperimen (#3b) — catat aksi sbg eksperimen + lacak hasil. Owner buat definisi
// + stop/simpulkan manual; checkpoint H+1/H+3/H+7 & kesimpulan OTOMATIS diisi
// server (pipeline) dari time-series kanonik. Read-only ke TikTok — pencatatan.
import { useEffect, useState, useCallback } from 'react'
import { EmptyState } from './ui'
import {
  listExperiments, createExperiment, stopExperiment, deleteExperiment,
  EXPERIMENT_TYPES, CONCLUSION_LABEL,
} from '../../data/gmvmaxExperiments'
import { getThresholds, saveExperimentRoiFloor } from '../../data/gmvmaxSettings'
import { classifyOutcome } from '../../gmvmax/skills/experimentClassify.mjs'

// Vonis LIVE dari checkpoint tersimpan + roiFloor terkini (server sinkron tiap eval
// harian). baseline_disclosed direkonstruksi dari adanya delta-vs-baseline.
function liveConclusion(exp, roiFloor) {
  const checkpoints = Array.isArray(exp.checkpoints) ? exp.checkpoints : []
  const disclosed = checkpoints.some(c => c.roi_delta_vs_baseline != null)
  const computed = { baseline: disclosed ? {} : null, baseline_disclosed: disclosed, checkpoints }
  const ruleConfig = roiFloor != null ? { roiFloor } : {}
  return classifyOutcome({ computed, ruleConfig, status: exp.status })
}

const typeLabel = (t) => (EXPERIMENT_TYPES.find(([k]) => k === t)?.[1]) || t
const STATUS = {
  RUNNING: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  CONCLUDED: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  STOPPED: 'text-ink-muted border-line/30 bg-fill/5',
}
const CONC = {
  SUSTAINABLE_WINNER: 'text-emerald-400', WINNER_CANDIDATE: 'text-emerald-400',
  TEMPORARY_SPIKE: 'text-amber-400', WEAK: 'text-red-400',
  INCONCLUSIVE: 'text-ink-muted', STOPPED: 'text-ink-muted', DATA_INSUFFICIENT: 'text-ink-faint',
}
const iso = (d) => d.toISOString().slice(0, 10)
const fmtD = (s) => (s ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '—')

export default function ExperimentPanel({ draft, onDraftUsed }) {
  const [state, setState] = useState({ loading: true })
  // Draft dari tombol "Jadikan eksperimen" (DecisionPanel) → form terbuka saat mount.
  const [showForm, setShowForm] = useState(!!draft)
  const [roiFloor, setRoiFloor] = useState(null)

  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true }))
    listExperiments().then(r => setState({ loading: false, ...r })).catch(e => setState({ loading: false, error: e.message }))
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload() }, [reload])
  useEffect(() => { getThresholds().then(t => setRoiFloor(t.experimentRoiFloor ?? null)).catch(() => {}) }, [])

  if (state.loading) return <p className="text-sm text-ink-muted py-10 text-center">Memuat eksperimen…</p>
  if (state.error) return <EmptyState title="Gagal memuat" desc={state.error} />
  if (state.available === false) return <EmptyState title="Belum aktif" desc="Tabel eksperimen (migrasi 0031) belum di-apply." />

  const rows = state.rows || []
  const running = rows.filter(r => r.status === 'RUNNING')
  const done = rows.filter(r => r.status !== 'RUNNING')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-ink-muted">{running.length} berjalan · {done.length} selesai</p>
        <button onClick={() => setShowForm(v => !v)} className="text-sm px-3 py-1.5 rounded-lg bg-accent/15 text-accent font-medium hover:bg-accent/20">
          {showForm ? 'Tutup form' : '+ Eksperimen baru'}
        </button>
      </div>

      <RoiFloorSetting key={String(roiFloor)} roiFloor={roiFloor} onSaved={setRoiFloor} />

      {showForm && <ExperimentForm draft={draft} onDone={() => { setShowForm(false); onDraftUsed?.(); reload() }} onCancel={() => { setShowForm(false); onDraftUsed?.() }} />}

      {rows.length === 0 && !showForm && (
        <EmptyState title="Belum ada eksperimen" desc="Catat aksi (mis. boost, uji kreatif) sebagai eksperimen untuk melacak hasilnya vs baseline." />
      )}

      {running.length > 0 && <div className="space-y-2">
        <h4 className="text-xs font-semibold text-ink-faint uppercase tracking-wider">Berjalan</h4>
        {running.map(e => <ExperimentCard key={e.id} e={e} roiFloor={roiFloor} onChanged={reload} />)}
      </div>}
      {done.length > 0 && <div className="space-y-2">
        <h4 className="text-xs font-semibold text-ink-faint uppercase tracking-wider">Selesai</h4>
        {done.map(e => <ExperimentCard key={e.id} e={e} roiFloor={roiFloor} onChanged={reload} />)}
      </div>}
    </div>
  )
}

function ExperimentForm({ draft, onDone, onCancel }) {
  const today = new Date()
  const [f, setF] = useState({
    experiment_type: draft?.experiment_type || 'MANUAL_BOOST',
    treatment: draft?.treatment || '',
    product_id: draft?.product_id || '',
    campaign_id: draft?.campaign_id || '',
    creative_video_id: draft?.creative_video_id || '',
    stop_condition: draft?.stop_condition || '',
    baseline_start: iso(new Date(today.getTime() - 3 * 864e5)),
    baseline_end: iso(new Date(today.getTime() - 1 * 864e5)),
    start_at: iso(today),
    notes: draft?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))

  async function save() {
    if (!f.treatment.trim()) { setErr('Isi "treatment" (apa yang diubah).'); return }
    setSaving(true); setErr(null)
    try {
      await createExperiment({ ...f, start_at: new Date(f.start_at).toISOString() })
      onDone()
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  const inp = 'w-full px-3 py-2 rounded-lg bg-surface border border-line/15 text-sm text-ink'
  const lbl = 'text-[11px] text-ink-faint uppercase tracking-wide mb-1 block'
  return (
    <div className="rounded-xl border border-line/20 bg-fill/[0.03] p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className={lbl}>Jenis eksperimen</label>
          <select value={f.experiment_type} onChange={set('experiment_type')} className={inp}>
            {EXPERIMENT_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div><label className={lbl}>Treatment (satu variabel yang diubah)</label>
          <input value={f.treatment} onChange={set('treatment')} placeholder="mis. naikkan budget 20% / boost video X" className={inp} /></div>
        <div><label className={lbl}>Product ID (opsional)</label><input value={f.product_id} onChange={set('product_id')} className={inp} /></div>
        <div><label className={lbl}>Video ID / Campaign ID (opsional)</label><input value={f.creative_video_id} onChange={set('creative_video_id')} className={inp} /></div>
        <div><label className={lbl}>Baseline mulai</label><input type="date" value={f.baseline_start} onChange={set('baseline_start')} className={inp} /></div>
        <div><label className={lbl}>Baseline selesai</label><input type="date" value={f.baseline_end} onChange={set('baseline_end')} className={inp} /></div>
        <div><label className={lbl}>Mulai eksperimen</label><input type="date" value={f.start_at} onChange={set('start_at')} className={inp} /></div>
        <div><label className={lbl}>Stop bila (kondisi henti)</label><input value={f.stop_condition} onChange={set('stop_condition')} placeholder="mis. ROI < 3x 2 hari berturut" className={inp} /></div>
      </div>
      <div><label className={lbl}>Catatan (opsional)</label><input value={f.notes} onChange={set('notes')} className={inp} /></div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex items-center gap-2">
        <button disabled={saving} onClick={save} className="text-sm px-4 py-2 rounded-lg bg-accent text-white font-medium disabled:opacity-50">{saving ? 'Menyimpan…' : 'Simpan eksperimen'}</button>
        <button disabled={saving} onClick={onCancel} className="text-sm px-3 py-2 rounded-lg text-ink-muted border border-line/20">Batal</button>
      </div>
      <p className="text-[11px] text-ink-faint">Checkpoint H+1/H+3/H+7 & kesimpulan diisi otomatis oleh pipeline harian dari data kanonik. Read-only — tak mengeksekusi apa pun.</p>
    </div>
  )
}

function ExperimentCard({ e, roiFloor, onChanged }) {
  const [busy, setBusy] = useState(false)
  const checkpoints = Array.isArray(e.checkpoints) ? e.checkpoints : []
  // Vonis LIVE dari roiFloor terkini (server sinkron tiap eval harian).
  const oc = liveConclusion(e, roiFloor)
  const showConc = e.status !== 'RUNNING' || oc.conclusion !== 'DATA_INSUFFICIENT'
  async function act(fn) {
    setBusy(true)
    try { await fn(e.id); onChanged() } catch (err) { alert('Gagal: ' + err.message); setBusy(false) }
  }
  return (
    <div className="rounded-xl border border-line/15 bg-surface p-4">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${STATUS[e.status] || STATUS.STOPPED}`}>{e.status}</span>
        <span className="text-[11px] text-ink-faint">{typeLabel(e.experiment_type)}</span>
        {showConc && <span className={`text-[11px] font-medium ${CONC[oc.conclusion] || 'text-ink-muted'}`}>· {CONCLUSION_LABEL[oc.conclusion] || oc.conclusion}{oc.confidence ? ` (${oc.confidence})` : ''}</span>}
        <span className="ml-auto text-[11px] text-ink-faint">mulai {fmtD(e.start_at)}</span>
      </div>
      <p className="text-sm text-ink-strong">{e.treatment || '—'}</p>
      <p className="text-[11px] text-ink-faint mt-0.5">
        Baseline {fmtD(e.baseline_start)}–{fmtD(e.baseline_end)}{e.stop_condition ? ` · Stop bila: ${e.stop_condition}` : ''}{e.product_id ? ` · produk ${e.product_id}` : ''}
      </p>
      {checkpoints.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {checkpoints.map((c, i) => (
            <span key={i} className="text-[11px] rounded-md border border-line/15 bg-fill/5 px-2 py-1 text-ink-muted">
              {c.label}: {c.roi != null ? `${Number(c.roi).toFixed(1)}x` : '—'}{c.roi_delta_vs_baseline != null ? ` (${c.roi_delta_vs_baseline >= 0 ? '+' : ''}${Number(c.roi_delta_vs_baseline).toFixed(1)})` : ''}
            </span>
          ))}
        </div>
      )}
      {e.status === 'RUNNING' && (
        <div className="mt-2.5 flex items-center gap-2">
          <button disabled={busy} onClick={() => act(stopExperiment)} className="text-xs text-ink-muted border border-line/25 rounded-lg px-2.5 py-1 hover:bg-fill/5 disabled:opacity-50">Hentikan</button>
          <button disabled={busy} onClick={() => { if (confirm('Hapus eksperimen ini?')) act(deleteExperiment) }} className="text-xs text-red-400/80 border border-red-500/20 rounded-lg px-2.5 py-1 hover:bg-red-500/5 disabled:opacity-50">Hapus</button>
        </div>
      )}
    </div>
  )
}

// Setelan ambang ROI vonis (roiFloor) per-workspace. Simpan → vonis kartu langsung
// terhitung ulang (client) + server ikut memakainya pada eval harian berikutnya.
function RoiFloorSetting({ roiFloor, onSaved }) {
  const [val, setVal] = useState(roiFloor == null ? '' : String(roiFloor))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  async function save(value) {
    setSaving(true); setMsg(null)
    try { const v = await saveExperimentRoiFloor(value); onSaved(v); setMsg(v == null ? 'Direset' : 'Tersimpan') }
    catch (e) { setMsg(e.message) } finally { setSaving(false) }
  }
  return (
    <div className="rounded-xl border border-line/15 bg-fill/[0.03] p-3 flex items-center gap-3 flex-wrap">
      <div className="text-sm text-ink">
        <span className="font-medium">Ambang ROI vonis</span>
        <span className="text-ink-faint text-xs ml-2">roiFloor — ROI ≥ ini = kandidat menang; kosong = vonis konservatif (belum konklusif)</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <input type="number" step="0.1" min="0" value={val} onChange={e => setVal(e.target.value)} placeholder="mis. 5"
          className="w-24 px-3 py-1.5 rounded-lg bg-surface border border-line/15 text-sm text-ink" />
        <span className="text-ink-faint text-sm">x</span>
        <button disabled={saving} onClick={() => save(val)} className="text-sm px-3 py-1.5 rounded-lg bg-accent/15 text-accent font-medium disabled:opacity-50">Simpan</button>
        {roiFloor != null && <button disabled={saving} onClick={() => save(null)} className="text-xs text-ink-muted hover:text-ink">reset</button>}
        {msg && <span className="text-xs text-ink-faint">{msg}</span>}
      </div>
    </div>
  )
}
