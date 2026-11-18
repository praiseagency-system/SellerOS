// Dialog "Catat alasan tidak ikut campaign" — menulis campaigns.skipped
// (migrasi 0069) untuk satu produk di satu atau beberapa campaign sekaligus.
import { useState, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from './Modal'
import { productVariations } from '../utils/product'
import { periodsSummary } from '../utils/campaignPeriods'
import {
  SKIP_REASON, SKIP_REASON_ORDER, GAP_REASON, buildSkipEntries, isOpenCampaign,
} from '../utils/campaignByProduct'

const campName = c => c.name || 'Tanpa Nama'

export default function SkipReasonModal({ product, initialCampaignId, gapRows, campaigns, actor, onClose, onSave }) {
  const vars = productVariations(product)

  // Campaign yang bisa diberi alasan: masih terbuka, marketplace sama, dan
  // produk ini memang punya celah di sana.
  const options = useMemo(() => {
    const gapBy = new Map()
    for (const r of gapRows) {
      const list = gapBy.get(r.campaign.id) || []
      list.push(r)
      gapBy.set(r.campaign.id, list)
    }
    return campaigns
      .filter(c => gapBy.has(c.id) && isOpenCampaign(c))
      .map(c => ({ c, rows: gapBy.get(c.id) }))
  }, [campaigns, gapRows])

  const initial = campaigns.find(c => c.id === initialCampaignId)
  const existing = (initial?.skipped || []).filter(e => e?.productId === product.id)
  const seed = existing[0] || null

  const [picked, setPicked] = useState(() => new Set(initialCampaignId ? [initialCampaignId] : []))
  const [mode, setMode] = useState(() => (existing.length && existing.every(e => e.varIdx != null) ? 'some' : 'all'))
  const [chosen, setChosen] = useState(() => new Set(existing.filter(e => e.varIdx != null).map(e => e.varIdx)))
  const [reason, setReason] = useState(seed?.reason || '')
  const [note, setNote] = useState(seed?.note || '')
  const [showToClient, setShowToClient] = useState(seed ? !!seed.showToClient : true)
  const [saving, setSaving] = useState(false)

  const multi = vars.length > 1
  const noteRequired = reason === 'other'
  const ready = picked.size > 0 && !!reason && (!noteRequired || note.trim())
    && (!multi || mode === 'all' || chosen.size > 0)

  function toggleSet(setter, key) {
    setter(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

  async function save() {
    if (!ready || saving) return
    setSaving(true)
    const variants = !multi || mode === 'all'
      ? null
      : [...chosen].sort((a, b) => a - b).map(i => ({ varIdx: i, name: vars[i]?.name || vars[i]?.sku || `Varian ${i + 1}` }))
    const entries = buildSkipEntries({
      productId: product.id, productName: product.name, variants, reason, note, showToClient,
    }, actor)
    await onSave({ product, campaignIds: [...picked], entries })
    setSaving(false)
  }

  async function remove() {
    if (saving) return
    setSaving(true)
    await onSave({ product, campaignIds: [], entries: [], removeIds: [initialCampaignId] })
    setSaving(false)
  }

  const seg = on => `px-3 py-1.5 rounded-[10px] text-[13px] font-semibold transition-colors ${on ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink'}`
  const nVar = !multi || mode === 'all' ? 'semua varian' : `${chosen.size} varian`

  return (
    <Modal title="Catat alasan tidak ikut campaign"
      subtitle={`${product.name} · ${vars.length} varian`} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-5 flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold text-ink-strong mb-2">
            Campaign <span className="font-normal text-ink-muted">· pilih lebih dari satu kalau alasannya sama</span>
          </legend>
          {options.length === 0 && <p className="text-[13px] text-ink-muted">Tidak ada campaign terbuka yang terlewat untuk produk ini.</p>}
          {options.map(({ c, rows }) => {
            const on = picked.has(c.id)
            const auto = rows.find(r => r.reason !== 'none' && r.reason !== 'manual')
            const hint = rows.some(r => r.reason === 'manual') ? 'Sudah dicatat manual'
              : auto ? `Terdeteksi: ${GAP_REASON[auto.reason].label.toLowerCase()}` : 'Belum ada alasan'
            return (
              <label key={c.id} className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${on ? 'border-blue-500/60 bg-blue-600/10' : 'border-line/10 hover:border-line/25'}`}>
                <input type="checkbox" checked={on} onChange={() => toggleSet(setPicked, c.id)} className="accent-blue-600 w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-ink">{campName(c)}{c.parentCampaign ? ` · ${c.parentCampaign}` : ''}</span>
                  <span className="block text-[11px] text-ink-muted mt-0.5">{periodsSummary(c) || 'Tanpa tanggal'}</span>
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-fill/8 text-ink-muted whitespace-nowrap">{hint}</span>
              </label>
            )
          })}
        </fieldset>

        {multi && (
          <div className="flex flex-col gap-2">
            <p id="skip-var" className="text-[13px] font-semibold text-ink-strong">Varian</p>
            <div role="group" aria-labelledby="skip-var" className="flex gap-0.5 p-0.5 bg-fill/5 border border-line/10 rounded-xl self-start">
              <button onClick={() => setMode('all')} aria-pressed={mode === 'all'} className={seg(mode === 'all')}>Semua varian ({vars.length})</button>
              <button onClick={() => setMode('some')} aria-pressed={mode === 'some'} className={seg(mode === 'some')}>Pilih varian</button>
            </div>
            {mode === 'some' && (
              <div className="flex flex-wrap gap-2 mt-1">
                {vars.map((v, i) => (
                  <label key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line/12 text-[13px] text-ink cursor-pointer">
                    <input type="checkbox" checked={chosen.has(i)} onChange={() => toggleSet(setChosen, i)} className="accent-blue-600" />
                    {v.name || `Varian ${i + 1}`}{v.sku ? <span className="text-ink-faint">· {v.sku}</span> : null}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p id="skip-reason" className="text-[13px] font-semibold text-ink-strong">Alasan <span className="font-normal text-ink-muted">· wajib</span></p>
          <div role="group" aria-labelledby="skip-reason" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SKIP_REASON_ORDER.map(k => (
              <button key={k} onClick={() => setReason(k)} aria-pressed={reason === k}
                className={`text-left p-2.5 rounded-xl border transition-colors ${reason === k ? 'border-blue-500/70 bg-blue-600/12' : 'border-line/10 hover:border-line/25'}`}>
                <span className="block text-[13px] font-semibold text-ink">{SKIP_REASON[k].label}</span>
                <span className="block text-[11px] text-ink-muted mt-0.5">{SKIP_REASON[k].hint}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-strong">Catatan <span className="font-normal text-ink-muted">· {noteRequired ? 'wajib untuk "Lainnya"' : 'opsional'}</span></span>
          <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
            placeholder="mis. Restock baru masuk 20 Des, ikutkan lagi di campaign Januari."
            className="resize-y bg-fill/5 border border-line/12 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
        </label>

        <label className="flex items-start gap-2.5 text-[13px] text-ink cursor-pointer">
          <input type="checkbox" checked={showToClient} onChange={e => setShowToClient(e.target.checked)} className="accent-blue-600 w-4 h-4 mt-0.5" />
          <span>Tampilkan alasan ini ke client di portal
            <span className="block text-[11px] text-ink-muted mt-0.5">Client melihat kenapa produk ini tidak diajukan di campaign tersebut.</span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-t border-line/8">
        <p className="flex-1 min-w-[180px] text-[11px] text-ink-muted">
          {picked.size ? `Disimpan untuk ${picked.size} campaign · ${nVar}. Bisa diubah atau dihapus kapan saja.` : 'Pilih minimal satu campaign.'}
        </p>
        {existing.length > 0 && (
          <button onClick={remove} disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40">
            <Trash2 className="w-3.5 h-3.5" />Hapus alasan
          </button>
        )}
        <button onClick={onClose} className="px-3 py-2 rounded-xl text-[13px] font-semibold border border-line/15 text-ink-muted hover:text-ink">Batal</button>
        <button onClick={save} disabled={!ready || saving}
          className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
          {saving ? 'Menyimpan…' : 'Simpan alasan'}
        </button>
      </div>
    </Modal>
  )
}
