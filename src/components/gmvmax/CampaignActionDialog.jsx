// Dialog aksi campaign (E3): ubah budget / Target ROI / pause-aktifkan.
// Mengajukan ke antrean 🔔 — bukan eksekusi langsung. createPortal ke <body>
// (aturan backdrop-trap). Menampilkan nilai sekarang → input nilai baru +
// alasan, plus pagar (batas % & cooldown) yang divalidasi data layer.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Send } from 'lucide-react'
import { requestBudgetChange, requestRoiChange, requestStatusChange } from '../../data/gmvmaxCampaignControl'
import { getExecutionSettings } from '../../data/gmvmaxApprovals'
import { useEffect } from 'react'

const TITLES = {
  BUDGET_UPDATE: 'Ubah budget harian',
  ROI_UPDATE: 'Ubah Target ROI',
  ENABLE: 'Aktifkan campaign',
  DISABLE: 'Pause campaign',
}

export default function CampaignActionDialog({ action, campaign, onClose, onQueued }) {
  // action: 'BUDGET_UPDATE' | 'ROI_UPDATE' | 'ENABLE' | 'DISABLE'
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [maxPct, setMaxPct] = useState(null)

  useEffect(() => {
    let alive = true
    getExecutionSettings().then(s => { if (alive) setMaxPct(s.max_budget_increase_pct ?? 50) }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!action || !campaign) return null
  const curBudget = Number(campaign.budget) || 0
  const curRoi = campaign.roas_bid != null ? Number(campaign.roas_bid) : null
  const isStatus = action === 'ENABLE' || action === 'DISABLE'

  async function submit() {
    setBusy(true); setError(null)
    try {
      const base = { campaignId: campaign.campaign_id, campaignName: campaign.campaign_name, reason: reason || null }
      if (action === 'BUDGET_UPDATE') {
        await requestBudgetChange({ ...base, currentBudget: curBudget, newBudget: Number(value) })
      } else if (action === 'ROI_UPDATE') {
        await requestRoiChange({ ...base, currentRoi: curRoi, newRoi: Number(value) })
      } else {
        await requestStatusChange({ ...base, currentStatus: campaign.operation_status, newStatus: action })
      }
      onQueued?.()
      onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const canSubmit = isStatus || (value !== '' && Number(value) > 0)

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="glass-modal w-full max-w-md rounded-2xl border border-line/15 shadow-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-strong">{TITLES[action]}</h3>
            <p className="text-xs text-ink-muted truncate">{campaign.campaign_name}</p>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="mt-3 space-y-3">
          {action === 'BUDGET_UPDATE' && (
            <>
              <p className="text-xs text-ink-muted">Sekarang: <span className="font-mono text-ink">Rp {curBudget.toLocaleString('id-ID')}</span>/hari
                {maxPct != null && curBudget > 0 && <> · batas naik: <span className="font-mono text-ink">Rp {Math.floor(curBudget * (1 + maxPct / 100)).toLocaleString('id-ID')}</span> (+{maxPct}%)</>}
              </p>
              <input type="number" min="1" value={value} onChange={e => setValue(e.target.value)} autoFocus
                placeholder="Budget baru (Rp/hari)"
                className="w-full bg-surface2 border border-line/15 rounded-xl px-3 py-2.5 text-sm text-ink font-mono focus:outline-none focus:border-blue-500/40" />
            </>
          )}
          {action === 'ROI_UPDATE' && (
            <>
              <p className="text-xs text-ink-muted">Sekarang: <span className="font-mono text-ink">{curRoi ?? '—'}×</span> · maksimal 1 angka desimal (aturan TikTok). Menurunkan target = delivery longgar = spend naik.</p>
              <input type="number" step="0.1" min="0.1" value={value} onChange={e => setValue(e.target.value)} autoFocus
                placeholder="Target ROI baru (mis. 6.5)"
                className="w-full bg-surface2 border border-line/15 rounded-xl px-3 py-2.5 text-sm text-ink font-mono focus:outline-none focus:border-blue-500/40" />
            </>
          )}
          {isStatus && (
            <p className="text-xs text-ink-muted">
              Status sekarang: <span className="font-mono text-ink">{campaign.operation_status || '—'}</span> → akan menjadi <span className={`font-semibold ${action === 'ENABLE' ? 'text-green-400' : 'text-red-400'}`}>{action}</span>.
              {action === 'DISABLE' && ' Iklan campaign ini berhenti tayang sampai diaktifkan lagi.'}
            </p>
          )}
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
            placeholder="Alasan (opsional — tercatat di Log Optimasi)"
            className="w-full bg-surface2 border border-line/15 rounded-xl px-3 py-2.5 text-xs text-ink resize-none focus:outline-none focus:border-blue-500/40" />
        </div>

        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button disabled={busy || !canSubmit} onClick={submit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Ajukan ke antrean 🔔
          </button>
          <span className="text-[11px] text-ink-faint">Eksekusi terjadi setelah kamu Setujui di lonceng.</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
