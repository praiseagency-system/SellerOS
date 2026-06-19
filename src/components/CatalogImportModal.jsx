import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { ingestCatalogFile } from '../utils/catalogIngest'
import { listProducts, saveProduct } from '../data/calcProducts'

const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }
const fmtRp = n => 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
const keyOf = (platform, code, name) => `${platform}|${(code || name).toLowerCase().trim()}`
function priceRange(variations) {
  const ps = variations.map(v => +v.hargaCoret || 0).filter(Boolean)
  if (!ps.length) return '—'
  const lo = Math.min(...ps), hi = Math.max(...ps)
  return lo === hi ? fmtRp(lo) : `${fmtRp(lo)} – ${fmtRp(hi)}`
}

export default function CatalogImportModal({ onClose, onImported }) {
  const [parsed, setParsed] = useState(null)   // { source, products, skipped }
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)
  const [done, setDone]     = useState(null)   // { added, dup }
  const fileRef = useRef(null)

  async function handleFile(file) {
    if (!file) return
    setError(null); setDone(null); setParsed(null); setBusy(true)
    try {
      const res = await ingestCatalogFile(file)
      if (res.products.length === 0) {
        setError(`File ${PLATFORM_LABEL[res.source] || ''} terbaca, tapi kosong (tidak ada baris produk — ini file template). Di Seller Center, PILIH produk dulu lalu download "Edit Massal / Kelola Harga" agar filenya berisi data.`)
      } else {
        setParsed(res)
      }
    } catch (e) {
      setError(e.message || 'Gagal membaca file.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function runImport() {
    if (!parsed || busy) return
    setBusy(true); setError(null)
    try {
      const existing = await listProducts()
      const have = new Set(existing.map(p => keyOf(p.platform, p.catalog?.productCode, p.name)))
      let added = 0, dup = 0, totalVar = 0
      for (const pr of parsed.products) {
        const k = keyOf(pr.platform, pr.productCode, pr.name)
        if (have.has(k)) { dup++; continue }
        have.add(k)
        await saveProduct({
          name: pr.name,
          platform: pr.platform,
          catalog: { productCode: pr.productCode, parentSku: pr.parentSku },
          fees: { platform: pr.platform },
          variations: pr.variations,
        })
        added++; totalVar += pr.variations.length
      }
      setDone({ added, dup, totalVar })
      if (added > 0) onImported?.()
    } catch (e) {
      setError(e.message || 'Gagal mengimpor.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Import Katalog Produk"
      subtitle="Dari file Kelola Harga & Stok (mass update / batch edit) Shopee atau TikTok"
      onClose={onClose} maxWidth="max-w-lg">
      <div className="p-5 space-y-4">
        {/* Dropzone */}
        {!parsed && !done && (
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-line/15 rounded-2xl p-6 text-center cursor-pointer hover:border-blue-600/40 transition-colors"
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => handleFile(e.target.files[0])} />
            <div className="w-11 h-11 rounded-2xl bg-blue-600/10 flex items-center justify-center mx-auto mb-2">
              <Upload className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-sm font-medium text-ink-strong">{busy ? 'Membaca file…' : 'Pilih / drop file katalog'}</p>
            <p className="text-xs text-ink-faint mt-1">Shopee "Kelola Harga & Stok" atau TikTok "Sales Information" · XLSX</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
          </div>
        )}

        {/* Hasil import */}
        {done && (
          <div className="text-center py-4">
            <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-ink-strong">{done.added} produk ditambahkan</p>
            <p className="text-xs text-ink-faint mt-0.5">{done.totalVar} varian total{done.dup > 0 ? ` · ${done.dup} produk dilewati (sudah ada)` : ''}</p>
            <p className="text-[11px] text-ink-faint mt-3 max-w-[330px] mx-auto">
              Harga yang masuk = <span className="text-ink-muted font-medium">harga sebelum diskon (coret)</span>. Lengkapi <span className="text-ink-muted font-medium">HPP & Harga Jual (net)</span> tiap varian di Kalkulator agar margin akurat.
            </p>
            <button onClick={onClose} className="mt-4 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">Selesai</button>
          </div>
        )}

        {/* Preview sebelum import */}
        {parsed && !done && (
          <>
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-fill/5 text-sm">
              <span className="text-ink-muted">Terdeteksi: <span className="font-semibold text-ink-strong">{PLATFORM_LABEL[parsed.source]}</span></span>
              <span className="text-ink-strong font-semibold tabular-nums">{parsed.products.length} produk · {parsed.rows.length} varian</span>
            </div>
            <div className="border border-line/10 rounded-xl divide-y divide-line/8 max-h-64 overflow-auto">
              {parsed.products.slice(0, 200).map((p, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink-strong truncate">{p.name}</p>
                    <p className="text-[11px] text-ink-faint truncate">
                      {p.variations.length > 1 ? `${p.variations.length} varian · ` : ''}{priceRange(p.variations)}
                    </p>
                  </div>
                </div>
              ))}
              {parsed.products.length > 200 && (
                <p className="text-[11px] text-ink-faint text-center py-2">+{parsed.products.length - 200} produk lainnya…</p>
              )}
            </div>
            <p className="text-[11px] text-ink-faint">
              Otomatis: nama, SKU/kode, <span className="text-ink-muted">harga sebelum diskon (coret)</span>. HPP & Harga Jual net diisi manual. Produk dengan Kode Produk/nama yang sudah ada dilewati.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setParsed(null)} disabled={busy}
                className="px-4 py-2 text-sm text-ink-muted border border-line/10 rounded-xl hover:border-line/20 hover:text-ink disabled:opacity-40 transition-colors">Ganti File</button>
              <button onClick={runImport} disabled={busy}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
                {busy ? 'Mengimpor…' : `Import ${parsed.products.length} Produk`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
