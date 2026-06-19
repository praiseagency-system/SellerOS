import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Ticket, Plus, Pencil, Trash2, X, ChevronDown, ChevronRight, Search, Package, ArrowRight,
} from 'lucide-react'
import { listVouchers, saveVoucher, deleteVoucher } from '../data/vouchers'
import { voucherCost, voucherSummary } from '../utils/voucher'
import { computeCalc } from '../utils/calc'

const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}
function marginCls(m) {
  if (m == null || isNaN(m)) return 'text-ink-faint'
  return m >= 30 ? 'text-green-400' : m >= 20 ? 'text-yellow-400' : 'text-red-400'
}

export default function VoucherPanel({ products }) {
  const [vouchers, setVouchers] = useState([])
  const [editing, setEditing]   = useState(null)  // voucher object / {} (baru) / null (tutup)
  const [expanded, setExpanded] = useState(null)  // id voucher yang dibuka

  const [loadErr, setLoadErr] = useState(false)
  const reload = useCallback(async () => {
    try { setVouchers(await listVouchers()); setLoadErr(false) }
    catch (e) { console.error(e); setLoadErr(true) }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload() }, [reload])

  const productMap = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p])), [products]
  )

  async function handleSave(form) {
    try { await saveVoucher(form); setEditing(null); await reload() }
    catch (e) { console.error(e); alert('Gagal menyimpan voucher.') }
  }
  async function handleDelete(id) {
    if (!confirm('Hapus voucher ini?')) return
    try { await deleteVoucher(id); await reload() }
    catch (e) { console.error(e); alert('Gagal menghapus voucher.') }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="text-sm text-ink-muted">
          {vouchers.length} voucher · biaya voucher otomatis jadi komponen biaya pada produk yang berlaku
        </p>
        <button onClick={() => setEditing({})}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Voucher Baru
        </button>
      </div>

      {loadErr && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300">
          Tabel <code>vouchers</code> belum tersedia. Jalankan migrasi <code>0006_vouchers.sql</code> di Supabase → SQL Editor terlebih dahulu.
        </div>
      )}

      {vouchers.length === 0 ? (
        <div className="bg-surface border border-line/8 rounded-2xl flex flex-col items-center justify-center text-center p-12 min-h-[240px]">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-3">
            <Ticket className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-ink">Belum ada voucher</p>
          <p className="text-xs text-ink-faint mt-1 max-w-[280px]">
            Buat voucher (persentase / nominal), tentukan minimum pembelian, lalu pilih produk yang berlaku.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {vouchers.map(v => (
            <VoucherCard key={v.id} v={v} productMap={productMap}
              expanded={expanded === v.id}
              onToggle={() => setExpanded(x => x === v.id ? null : v.id)}
              onEdit={() => setEditing(v)}
              onDelete={() => handleDelete(v.id)} />
          ))}
        </div>
      )}

      {editing && (
        <VoucherModal initial={editing} products={products}
          onSave={handleSave} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function VoucherCard({ v, productMap, expanded, onToggle, onEdit, onDelete }) {
  const linked = v.productIds.map(id => productMap[id]).filter(Boolean)
  const missing = v.productIds.length - linked.length
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div className="bg-surface border border-line/8 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <Chevron className="w-4 h-4 text-ink-faint flex-shrink-0" />
          <div className="w-9 h-9 rounded-xl bg-blue-600/10 flex items-center justify-center flex-shrink-0">
            <Ticket className="w-4 h-4 text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-strong truncate">{v.name}</p>
            <p className="text-[11px] text-ink-faint truncate">
              {voucherSummary(v)} · {v.productIds.length} produk
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${v.discountType === 'nominal' ? 'bg-purple-500/10 text-purple-300' : 'bg-blue-500/10 text-blue-300'}`}>
            {v.discountType === 'nominal' ? 'Nominal' : 'Persen'}
          </span>
          <button title="Edit" onClick={onEdit}
            className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-fill/8 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          <button title="Hapus" onClick={onDelete}
            className="p-1.5 rounded-lg text-ink-faint hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line/8 px-4 py-3 space-y-2">
          {linked.length === 0 ? (
            <p className="text-xs text-ink-faint py-2">Belum ada produk terkait. Klik edit untuk memilih produk.</p>
          ) : linked.map(p => {
            const harga = p.calc?.h ?? (+p.state?.jual || 0)
            const { eligible, cost } = voucherCost(v, harga)
            const before = p.calc?.marginNoAd
            const after = eligible && p.calc
              ? computeCalc({ ...p.state, voucher: (+p.state?.voucher || 0) + cost })?.marginNoAd
              : before
            return (
              <div key={p.id} className="flex items-center gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-ink-strong truncate text-[13px]">{p.name}</p>
                  <p className="text-[11px] text-ink-faint truncate">
                    {PLATFORM_LABEL[p.platform] || p.platform} · {fmt(harga)}
                  </p>
                </div>
                {eligible ? (
                  <>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-ink-faint leading-none mb-0.5">Biaya Voucher</p>
                      <p className="text-[13px] font-semibold text-orange-400 tabular-nums">−{fmt(cost)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 w-[120px] justify-end">
                      <span className={`text-[12px] font-semibold tabular-nums ${marginCls(before)}`}>{before != null ? `${before.toFixed(1)}%` : '—'}</span>
                      <ArrowRight className="w-3 h-3 text-ink-faint" />
                      <span className={`text-[12px] font-semibold tabular-nums ${marginCls(after)}`}>{after != null ? `${after.toFixed(1)}%` : '—'}</span>
                    </div>
                  </>
                ) : (
                  <span className="text-[11px] text-ink-faint flex-shrink-0">Tidak memenuhi min. belanja</span>
                )}
              </div>
            )
          })}
          {missing > 0 && (
            <p className="text-[11px] text-ink-faint pt-1">{missing} produk terkait sudah dihapus.</p>
          )}
        </div>
      )}
    </div>
  )
}

function VoucherModal({ initial, products, onSave, onClose }) {
  const [name, setName]           = useState(initial.name ?? '')
  const [type, setType]           = useState(initial.discountType ?? 'percent')
  const [value, setValue]         = useState(initial.discountValue ?? '')
  const [maxDiscount, setMaxDisc] = useState(initial.maxDiscount ?? '')
  const [minPurchase, setMinPur]  = useState(initial.minPurchase ?? '')
  const [productIds, setIds]      = useState(initial.productIds ?? [])
  const [q, setQ]                 = useState('')
  const [busy, setBusy]           = useState(false)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? products.filter(p => p.name.toLowerCase().includes(s)) : products
  }, [products, q])

  function toggle(id) {
    setIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    await onSave({
      id: initial.id,
      name: name.trim(),
      discountType: type,
      discountValue: value,
      maxDiscount: type === 'percent' ? maxDiscount : '',
      minPurchase,
      productIds,
    })
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="bg-surface w-full max-w-md rounded-2xl border border-line/10 shadow-2xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line/8 flex-shrink-0">
          <h2 className="font-semibold text-ink-strong">{initial.id ? 'Edit Voucher' : 'Voucher Baru'}</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Nama Voucher <span className="text-red-400">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="mis. Diskon Gajian 10%"
              className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Tipe Diskon</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[['percent', 'Persentase (%)'], ['nominal', 'Nominal (Rp)']].map(([id, label]) => (
                <button type="button" key={id} onClick={() => setType(id)}
                  className={`py-2 text-xs font-medium rounded-xl border transition-all ${
                    type === id ? 'bg-blue-600/20 text-blue-400 border-blue-600/30' : 'border-line/10 text-ink-muted hover:border-line/20 hover:text-ink'
                  }`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={type === 'percent' ? 'Besar Diskon (%)' : 'Nominal Diskon (Rp)'}
              value={value} onChange={setValue} prefix={type === 'nominal' ? 'Rp' : null} suffix={type === 'percent' ? '%' : null} />
            {type === 'percent' && (
              <Field label="Maks. Potongan (Rp)" value={maxDiscount} onChange={setMaxDisc} prefix="Rp" hint="kosongkan = tanpa batas" />
            )}
          </div>

          <Field label="Minimum Pembelian (Rp)" value={minPurchase} onChange={setMinPur} prefix="Rp"
            hint="Produk dengan harga jual di bawah ini dianggap tidak memenuhi syarat" />

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              Produk yang Berlaku <span className="text-ink-faint font-normal">({productIds.length} dipilih)</span>
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari produk..."
                className="w-full bg-fill/5 border border-line/10 rounded-xl pl-9 pr-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40" />
            </div>
            <div className="border border-line/10 rounded-xl divide-y divide-line/8 max-h-48 overflow-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-ink-faint text-center py-6 flex flex-col items-center gap-1">
                  <Package className="w-4 h-4" />{products.length === 0 ? 'Belum ada produk tersimpan' : 'Tidak ada produk cocok'}
                </p>
              ) : filtered.map(p => (
                <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-fill/5">
                  <input type="checkbox" checked={productIds.includes(p.id)} onChange={() => toggle(p.id)}
                    className="accent-blue-600 w-4 h-4 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink-strong truncate">{p.name}</p>
                    <p className="text-[11px] text-ink-faint truncate">
                      {PLATFORM_LABEL[p.platform] || p.platform}{p.calc ? ` · ${fmt(p.calc.h)}` : ''}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line/8 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-line/10 rounded-xl hover:border-line/20 hover:text-ink transition-colors">Batal</button>
          <button type="submit" disabled={!name.trim() || busy}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {busy ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, prefix, suffix, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-muted mb-1.5">{label}</label>
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-xs text-ink-faint font-medium select-none">{prefix}</span>}
        <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} placeholder="0"
          className={`w-full bg-fill/5 border border-line/10 rounded-xl py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50 ${prefix ? 'pl-9' : 'pl-3'} ${suffix ? 'pr-8' : 'pr-3'}`} />
        {suffix && <span className="absolute right-3 text-xs text-ink-faint select-none">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-ink-faint mt-1">{hint}</p>}
    </div>
  )
}
