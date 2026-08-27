// Kelola produk campaign (E3.5) — dua kolom: produk DI campaign (cabut) vs
// produk eligible yang bisa DITAMBAH (hanya UNOCCUPIED; OCCUPIED ditampilkan
// nonaktif dgn keterangan). Mengajukan ke antrean 🔔 sebagai satu approval
// berisi delta ± produk. Portal ke <body> (aturan backdrop-trap).
import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Send, Plus, Minus, AlertTriangle } from 'lucide-react'
import { fetchStoreProducts, requestProductsChange } from '../../data/gmvmaxCampaignControl'

export default function CampaignProductsDialog({ campaign, productNames = {}, onClose, onQueued }) {
  const currentIds = useMemo(
    () => (Array.isArray(campaign?.item_group_ids) ? campaign.item_group_ids.map(String) : []),
    [campaign])
  const [ids, setIds] = useState(currentIds)          // daftar hasil suntingan
  const [catalog, setCatalog] = useState(null)        // produk toko (store_product_get)
  const [loadErr, setLoadErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    fetchStoreProducts().then(p => { if (alive) setCatalog(p) }).catch(e => { if (alive) setLoadErr(e.message) })
    return () => { alive = false }
  }, [])

  if (!campaign) return null
  const nameOf = (id) => {
    const c = (catalog || []).find(p => String(p.item_group_id) === String(id))
    return c?.title || productNames[id] || id
  }
  const removed = currentIds.filter(id => !ids.includes(id))
  const added = ids.filter(id => !currentIds.includes(id))
  const dirty = removed.length > 0 || added.length > 0

  // Kandidat tambah: eligible GMV Max, belum di daftar. UNOCCUPIED bisa dipilih;
  // OCCUPIED tampil nonaktif (dipakai campaign lain — aturan 1 produk 1 campaign).
  // Hanya produk AKTIF di toko yang layak jadi kandidat (status AVAILABLE) —
  // produk nonaktif/habis tak boleh ditawarkan ke campaign.
  const candidates = (catalog || [])
    .filter(p => p.status === 'AVAILABLE')
    .filter(p => !ids.includes(String(p.item_group_id)))
    .filter(p => !q || (p.title || '').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.gmv_max_ads_status === 'UNOCCUPIED' ? -1 : 1) - (b.gmv_max_ads_status === 'UNOCCUPIED' ? -1 : 1)
      || (Number(b.historical_sales) || 0) - (Number(a.historical_sales) || 0))
    .slice(0, 60)

  async function submit() {
    setBusy(true); setError(null)
    try {
      await requestProductsChange({
        campaignId: campaign.campaign_id, campaignName: campaign.campaign_name,
        currentIds, newIds: ids,
        addedNames: added.map(nameOf), removedNames: removed.map(nameOf),
      })
      onQueued?.(); onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="glass-modal w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-line/15 shadow-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-strong">Kelola produk campaign</h3>
            <p className="text-xs text-ink-muted truncate">{campaign.campaign_name} · {ids.length} produk terpilih</p>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid md:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* Kolom kiri: di campaign */}
          <div className="flex flex-col min-h-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint mb-2">Di campaign · {ids.length}</p>
            <div className="flex-1 overflow-auto space-y-1.5 pr-1">
              {ids.map(id => (
                <div key={id} className="flex items-center gap-2 bg-surface2 border border-line/10 rounded-lg px-2.5 py-2">
                  <span className="text-xs text-ink truncate flex-1">{nameOf(id)}</span>
                  {removed.includes(id) ? null : (
                    <button onClick={() => setIds(ids.filter(x => x !== id))} title="Cabut dari campaign"
                      className="text-red-400 hover:bg-red-500/10 rounded p-1"><Minus className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
              {ids.length === 0 && <p className="text-xs text-red-300">Minimal 1 produk — kosong tidak diizinkan.</p>}
            </div>
          </div>

          {/* Kolom kanan: bisa ditambah */}
          <div className="flex flex-col min-h-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint mb-2">Katalog eligible GMV Max · produk aktif</p>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari produk…"
              className="bg-surface2 border border-line/15 rounded-lg px-2.5 py-1.5 text-xs text-ink mb-2 focus:outline-none focus:border-blue-500/40" />
            <div className="flex-1 overflow-auto space-y-1.5 pr-1">
              {catalog === null && !loadErr && <p className="text-xs text-ink-faint flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat katalog toko…</p>}
              {loadErr && <p className="text-xs text-red-300">{loadErr}</p>}
              {candidates.map(p => {
                const free = p.gmv_max_ads_status === 'UNOCCUPIED'
                return (
                  <div key={p.item_group_id} className={`flex items-center gap-2 border rounded-lg px-2.5 py-2 ${free ? 'bg-surface2 border-line/10' : 'bg-surface2/50 border-line/5 opacity-60'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-ink truncate">{p.title || p.item_group_id}</p>
                      <p className="text-[10px] text-ink-faint">{free ? `terjual ${Number(p.historical_sales || 0).toLocaleString('id-ID')}` : 'dipakai campaign lain (OCCUPIED)'}</p>
                    </div>
                    {free && (
                      <button onClick={() => setIds([...ids, String(p.item_group_id)])} title="Tambah ke campaign"
                        className="text-emerald-400 hover:bg-emerald-500/10 rounded p-1"><Plus className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                )
              })}
              {catalog && candidates.length === 0 && <p className="text-xs text-ink-faint">Tidak ada kandidat{q ? ' cocok' : ''}.</p>}
            </div>
          </div>
        </div>

        {/* Ringkasan delta + peringatan cabut */}
        {dirty && (
          <div className="mt-3 text-[11px] space-y-0.5">
            {added.length > 0 && <p className="text-green-300 truncate">＋ {added.map(nameOf).join(', ')}</p>}
            {removed.length > 0 && (
              <p className="text-red-300 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span className="truncate">− {removed.map(nameOf).join(', ')} — iklan produk ini di campaign akan BERHENTI.</span></p>
            )}
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button disabled={busy || !dirty || ids.length === 0} onClick={submit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Ajukan ke antrean 🔔
          </button>
          <span className="text-[11px] text-ink-faint">Eksekusi setelah kamu Setujui di lonceng.</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
