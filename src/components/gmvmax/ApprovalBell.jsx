// 🔔 Persetujuan — elemen global topbar (Execute Layer E0).
// Badge jumlah antrean PENDING; klik → panel daftar approval, setujui/tolak
// di tempat. Panel dirender via createPortal ke <body> — topbar memakai
// glass-panel (backdrop-filter) yang menjebak elemen fixed (lihat memori
// modal-backdrop-trap), jadi JANGAN render panel sebagai anak header.
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Loader2, Check, X, ShieldAlert } from 'lucide-react'
import { listApprovals, decideApproval, ACTION_LABELS, getExecutionSettings } from '../../data/gmvmaxApprovals'
import { executeSparkBind, executeSparkUnbind } from '../../data/gmvmaxSpark'
import { executeCampaignAction } from '../../data/gmvmaxCampaignControl'
import { getCurrentWorkspaceId } from '../../utils/workspace'

const fmtVal = (v) => {
  if (v == null) return '—'
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${typeof x === 'number' ? x.toLocaleString('id-ID') : x}`).join(' · ')
  return typeof v === 'number' ? v.toLocaleString('id-ID') : String(v)
}

export default function ApprovalBell() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [killed, setKilled] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!getCurrentWorkspaceId()) return
    setLoading(true)
    try {
      const [list, settings] = await Promise.all([listApprovals(), getExecutionSettings()])
      setRows(list); setKilled(!settings.enabled); setError(null)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])

  // Badge tetap terisi tanpa membuka panel; refresh ringan tiap 60 dtk.
  // setState dibungkus timeout supaya tak sinkron di badan effect (aturan lint).
  useEffect(() => {
    const kick = setTimeout(refresh, 0)
    const t = setInterval(refresh, 60_000)
    return () => { clearTimeout(kick); clearInterval(t) }
  }, [refresh])
  useEffect(() => {
    if (!open) return
    const kick = setTimeout(refresh, 0)
    return () => clearTimeout(kick)
  }, [open, refresh])

  const [notice, setNotice] = useState(null)

  async function decide(id, decision) {
    setBusyId(id); setError(null); setNotice(null)
    try {
      const row = await decideApproval(id, decision)
      // Aksi yang jalurnya sudah AKTIF dieksekusi langsung setelah disetujui.
      const EXEC = {
        SPARK_BIND: executeSparkBind, SPARK_UNBIND: executeSparkUnbind,
        BUDGET_UPDATE: executeCampaignAction, ROI_UPDATE: executeCampaignAction, STATUS_UPDATE: executeCampaignAction,
        PRODUCTS_UPDATE: executeCampaignAction,
      }
      if (decision === 'APPROVED' && EXEC[row.action_type]) {
        setNotice('Menerapkan ke TikTok…')
        const r = await EXEC[row.action_type](row)
        const rb = r?.read_back
        setNotice(rb?.verified === true
          ? '✓ Diterapkan & terverifikasi (read-back cocok).'
          : '✓ Diterapkan. Cek daftar Spark posts di Boost Center untuk konfirmasi.')
      }
      await refresh()
    } catch (e) {
      setError(e.failed ? `Eksekusi gagal: ${e.message}` : e.message)
      await refresh()
    } finally { setBusyId(null) }
  }

  return (
    <>
      <button onClick={() => setOpen(v => !v)} title="Persetujuan"
        className="relative p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-fill/5 transition-colors">
        <Bell className="w-5 h-5" />
        {rows.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
            {rows.length}
          </span>
        )}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="glass-modal absolute right-4 top-16 w-[420px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-auto rounded-2xl border border-line/15 shadow-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-ink-strong">Menunggu persetujuan · {rows.length}</p>
              {killed
                ? <span className="flex items-center gap-1 text-[11px] text-red-400"><ShieldAlert className="w-3.5 h-3.5" /> kill switch MATI-kan eksekusi</span>
                : <span className="text-[11px] text-ink-faint">kill switch: aktif</span>}
            </div>

            {loading && rows.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-ink-faint py-4"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>
            )}
            {!loading && rows.length === 0 && (
              <p className="text-xs text-ink-faint py-4">Tidak ada antrean. Aksi yang kamu ajukan dari Campaign Ads, Boost Center, atau AI Insight akan muncul di sini.</p>
            )}

            <div className="space-y-3">
              {rows.map(r => (
                <div key={r.id} className="rounded-xl border border-blue-500/25 bg-surface2 p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[13px] font-semibold text-ink-strong truncate">{ACTION_LABELS[r.action_type] || r.action_type}</p>
                    <span className="text-[10px] text-ink-faint whitespace-nowrap">exp {new Date(r.expires_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {(r.target?.campaign_name || r.target?.video_title) && (
                    <p className="text-[12px] text-ink truncate">{r.target.campaign_name || r.target.video_title}</p>
                  )}
                  {(r.current_value != null || r.proposed_value != null) && (
                    <p className="text-[12px] font-mono mt-0.5">
                      <span className="text-ink-faint line-through">{fmtVal(r.current_value)}</span>
                      <span className="text-ink-muted"> → </span>
                      <span className="text-green-400 font-semibold">{fmtVal(r.proposed_value)}</span>
                    </p>
                  )}
                  {r.reason && <p className="text-[11px] text-ink-muted mt-1 leading-relaxed">Kenapa: {r.reason}</p>}
                  {(r.evidence?.ditambah?.length > 0 || r.evidence?.dicabut?.length > 0) && (
                    <div className="text-[11px] mt-1 space-y-0.5">
                      {r.evidence.ditambah?.length > 0 && <p className="text-green-300 truncate">＋ {r.evidence.ditambah.join(', ')}</p>}
                      {r.evidence.dicabut?.length > 0 && <p className="text-red-300 truncate">− {r.evidence.dicabut.join(', ')}</p>}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2.5">
                    <button disabled={busyId === r.id || killed} onClick={() => decide(r.id, 'APPROVED')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                      {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Setujui
                    </button>
                    <button disabled={busyId === r.id} onClick={() => decide(r.id, 'REJECTED')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-line/20 text-ink-muted hover:text-ink disabled:opacity-40">
                      <X className="w-3 h-3" /> Tolak
                    </button>
                    <span className="text-[10px] text-ink-faint ml-auto">{r.source}</span>
                  </div>
                </div>
              ))}
            </div>
            {notice && !error && <p className="text-[11px] text-green-300 mt-3">{notice}</p>}
            {error && <p className="text-[11px] text-red-300 mt-3">{error}</p>}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
