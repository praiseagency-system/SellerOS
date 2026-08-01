import { useState } from 'react'
import { Link2, Check, X, Unlink, History } from 'lucide-react'
import Modal from './Modal'
import { confirmPair, rejectPair, unmerge, listMappingLog } from '../data/productMappings'

// Peninjauan mapping produk lintas marketplace.
// Keputusan manual di sini SELALU menang atas pencocokan otomatis pada import
// berikutnya (lihat urutan prioritas di utils/canonicalProduct.js).
const PLAT = { shopee: 'Shopee', tiktok: 'TikTok Shop' }

function Listing({ p }) {
  if (!p) return <span className="text-[11px] text-ink-faint">—</span>
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-ink truncate" title={p.nama_produk}>{p.nama_produk}</p>
      <p className="text-[10px] text-ink-faint">{PLAT[p.platform] || p.platform} · {p.kode_produk}</p>
    </div>
  )
}

export default function MappingManager({ suggestions = [], merged = [], onClose, onChanged }) {
  const [busy, setBusy] = useState(null)
  const [tab, setTab] = useState('usulan')
  const [log, setLog] = useState(null)

  async function act(fn, key) {
    setBusy(key)
    try { await fn(); await onChanged?.() }
    catch (e) { alert(`Gagal menyimpan mapping.\n\n${e?.message || ''}`) }
    finally { setBusy(null) }
  }

  async function openLog() {
    setTab('riwayat')
    setLog(await listMappingLog(40))
  }

  const TABS = [
    { id: 'usulan', label: `Usulan (${suggestions.length})` },
    { id: 'digabung', label: `Sudah digabung (${merged.length})` },
    { id: 'riwayat', label: 'Riwayat' },
  ]

  return (
    <Modal title="Product Mapping" subtitle="Pasangkan produk yang sama antar-marketplace" onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex gap-1.5 mb-3">
        {TABS.map(t => (
          <button key={t.id} onClick={() => t.id === 'riwayat' ? openLog() : setTab(t.id)}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors ${
              tab === t.id ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink hover:bg-fill/8'
            }`}>{t.label}</button>
        ))}
      </div>

      {tab === 'usulan' && (
        suggestions.length === 0
          ? <p className="text-xs text-ink-faint py-8 text-center">Tak ada usulan pasangan baru.</p>
          : (
            <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
              {suggestions.map(s => {
                const key = `${s.a.kode_produk}-${s.b.kode_produk}`
                const shopee = s.a.platform === 'shopee' ? s.a : s.b
                const tiktok = s.a.platform === 'tiktok' ? s.a : s.b
                return (
                  <div key={key} className="rounded-xl border border-line/10 bg-fill/5 p-3">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-center">
                      <Listing p={shopee} />
                      <Listing p={tiktok} />
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          s.blocked ? 'bg-red-500/12 text-red-300' : 'bg-blue-600/15 text-blue-300'}`}>
                          {Math.round(s.confidence * 100)}%
                        </span>
                        <button disabled={busy === key} title="Gabungkan"
                          onClick={() => act(() => confirmPair({
                            canonicalProductId: `canon:${shopee.kode_produk}:${tiktok.kode_produk}`,
                            canonicalProductName: shopee.nama_produk,
                            shopee, tiktok,
                          }), key)}
                          className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 disabled:opacity-40">
                          <Check className="w-4 h-4" />
                        </button>
                        <button disabled={busy === key} title="Bukan produk yang sama"
                          onClick={() => act(() => rejectPair({ canonicalProductId: `canon:${shopee.kode_produk}:${tiktok.kode_produk}`, shopee, tiktok }), key)}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className={`text-[11px] mt-1.5 ${s.blocked ? 'text-red-300' : 'text-ink-faint'}`}>
                      {s.blocked ? `Diblokir: ${s.reasons.join(' · ')} — gabungkan hanya kalau kamu yakin.` : s.reasons.join(' · ')}
                    </p>
                  </div>
                )
              })}
            </div>
          )
      )}

      {tab === 'digabung' && (
        merged.length === 0
          ? <p className="text-xs text-ink-faint py-8 text-center">Belum ada produk yang digabung.</p>
          : (
            <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
              {merged.map(p => (
                <div key={p.kode_produk} className="rounded-xl border border-line/10 bg-fill/5 p-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-ink truncate">{p.nama_produk}</p>
                    <p className="text-[10px] text-ink-faint">
                      {(p.platforms || []).map(x => `${PLAT[x.platform] || x.platform} ${x.kode_produk}`).join(' + ')}
                      {p.mappingSource ? ` · ${p.mappingSource}` : ''}
                    </p>
                  </div>
                  <button disabled={busy === p.kode_produk} title="Pisahkan lagi"
                    onClick={() => act(() => unmerge(p.canonicalProductId), p.kode_produk)}
                    className="p-1.5 rounded-lg text-ink-faint hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40">
                    <Unlink className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )
      )}

      {tab === 'riwayat' && (
        <div className="space-y-1.5 max-h-[52vh] overflow-y-auto pr-1">
          {log === null && <p className="text-xs text-ink-faint py-6 text-center">Memuat…</p>}
          {log?.length === 0 && <p className="text-xs text-ink-faint py-6 text-center">Belum ada perubahan mapping.</p>}
          {(log || []).map(e => (
            <p key={e.id} className="text-[11px] text-ink-muted flex items-center gap-2">
              <History className="w-3 h-3 text-ink-faint flex-shrink-0" />
              <span className="font-medium">{e.action}</span>
              <span className="truncate">{e.canonical_product_id}</span>
              <span className="ml-auto text-ink-faint flex-shrink-0">{new Date(e.created_at).toLocaleString('id-ID')}</span>
            </p>
          ))}
        </div>
      )}

      <p className="text-[11px] text-ink-faint mt-3 pt-3 border-t border-line/8 flex items-start gap-1.5">
        <Link2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        Keputusan di sini disimpan sebagai mapping manual dan tak akan ditimpa pencocokan otomatis saat import berikutnya.
        Butuh migrasi <code>0043_product_mappings.sql</code>.
      </p>
    </Modal>
  )
}
