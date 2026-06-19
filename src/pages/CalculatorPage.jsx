import { useState, useMemo, useEffect, useRef } from 'react'
import { TrendingUp, ChevronDown, Truck, Save, X, AlertTriangle, ImagePlus, Trash2 } from 'lucide-react'
import { PlatformIcon } from '../components/PlatformIcon'
import CategoryPicker from '../components/CategoryPicker'
import OngkirPicker from '../components/OngkirPicker'
import CalcBreakdown from '../components/CalcBreakdown'
import RoasIntelligence from '../components/RoasIntelligence'
import TikTokPicker from '../components/TikTokPicker'
import { tiktokPlatformRate } from '../utils/tiktokFeeData'
import { computeCalc, computePriceTiers, productStatus } from '../utils/calc'
import { saveProduct } from '../data/calcProducts'
import { uploadProductImage, deleteProductImage } from '../data/productImages'
import { blendedLogistics } from '../utils/storeData'
import { loadStore } from '../data/storeDataset'

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

function pct(n, digits = 1) {
  if (n == null || isNaN(n)) return '—'
  return `${n.toFixed(digits)}%`
}

function NumInput({ label, value, onChange, suffix, hint, badge }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-xs font-medium text-ink-muted mb-1.5">
        {label}{badge}
      </label>
      <div className="relative flex items-center">
        {!suffix && (
          <span className="absolute left-3 text-xs text-ink-faint font-medium select-none">Rp</span>
        )}
        <input
          type="number"
          min="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0"
          className={`w-full bg-fill/5 border border-line/10 rounded-xl py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50 ${suffix ? 'pl-4 pr-10' : 'pl-10 pr-4'}`}
        />
        {suffix && (
          <span className="absolute right-3 text-xs text-ink-faint select-none">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-xs text-ink-faint mt-1">{hint}</p>}
    </div>
  )
}

function Row({ label, value, className = '' }) {
  return (
    <div className={`flex justify-between items-baseline text-sm ${className}`}>
      <span className="text-ink-muted">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function ProgramToggle({ label, desc, value, isOn, onToggle, accent = 'orange' }) {
  const onColor  = accent === 'blue' ? 'bg-blue-500' : 'bg-orange-500'
  const onBorder = accent === 'blue' ? 'border-blue-500/25 bg-blue-500/5' : 'border-orange-500/25 bg-orange-500/5'
  return (
    <div className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
      isOn ? onBorder : 'border-line/8 hover:border-line/15'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium leading-snug ${isOn ? 'text-ink-strong' : 'text-ink-muted'}`}>{label}</p>
          {value && (
            <span className={`text-xs font-bold tabular-nums ${isOn ? (accent === 'blue' ? 'text-blue-400' : 'text-orange-400') : 'text-ink-faint'}`}>{value}</span>
          )}
        </div>
        <p className="text-[11px] text-ink-faint mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        onClick={onToggle}
        className={`relative inline-flex flex-shrink-0 h-5 w-9 items-center rounded-full transition-colors duration-200 ${isOn ? onColor : 'bg-fill/25'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${isOn ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
      </button>
    </div>
  )
}

export default function CalculatorPage({ initialProduct = null, onAfterSave }) {
  const init = initialProduct?.state || {}

  // Biaya Logistik (LSF) hanya berlaku di TikTok Shop, tidak ada di Shopee.
  // Blended dihitung sekali dari data toko; fallback Rp990 (Jawa Non-Jakarta
  // ≤1kg) bila belum ada import.
  // Blended LSF dimuat async dari dataset toko (Supabase); lsfDefault dipakai
  // saat ganti platform ke TikTok. Fallback Rp990 sebelum termuat / tanpa data.
  const [storeLSF, setStoreLSF] = useState(null)
  useEffect(() => {
    let active = true
    loadStore().then(s => { if (active) setStoreLSF(blendedLogistics(s)) }).catch(() => {})
    return () => { active = false }
  }, [])
  const lsfDefault = storeLSF?.hasData ? String(storeLSF.blended) : '990'

  const [platform, setPlatform] = useState(init.platform ?? 'shopee')
  const isTikTok = platform === 'tiktok'

  const [hpp,     setHpp]     = useState(init.hpp ?? '')
  const [jual,    setJual]    = useState(init.jual ?? '')
  const [jualCampaign, setJualCampaign] = useState(init.jualCampaign ?? '')
  const [jualFlash,    setJualFlash]    = useState(init.jualFlash ?? '')
  const [adCost,  setAdCost]  = useState(init.adCost ?? '')
  const [voucher, setVoucher] = useState(init.voucher ?? '')
  // Default LSF hanya saat platform TikTok; Shopee mulai kosong (manual).
  const [ongkir,  setOngkir]  = useState(init.ongkir ?? (init.platform === 'tiktok' ? lsfDefault : ''))

  // Shopee — category picker (admin fee)
  const [selectedCat, setSelectedCat] = useState(init.selectedCat ?? null) // { label, fee }
  const [showPicker,  setShowPicker]  = useState(false)
  const [cAdminManual, setCAdminManual] = useState(init.cAdminManual ?? '')

  // Shopee — GO XTRA fee
  const [selectedGox,   setSelectedGox]   = useState(init.selectedGox ?? null) // { label, fee, size }
  const [showGoxPicker, setShowGoxPicker] = useState(false)
  const [cGoxManual,    setCGoxManual]    = useState(init.cGoxManual ?? '')

  // Shopee — tipe toko & program opsional
  const [sellerType,    setSellerType]    = useState(init.sellerType ?? 'nonstar') // 'nonstar'|'star'|'mall'
  const [promoXtraOn,   setPromoXtraOn]   = useState(init.promoXtraOn ?? false)
  const [liveXtraOn,    setLiveXtraOn]    = useState(init.liveXtraOn ?? false)
  const [preOrderOn,    setPreOrderOn]    = useState(init.preOrderOn ?? false)

  // TikTok — Komisi Dinamis (per kategori) + program
  const [ttSeller,      setTtSeller]      = useState(init.ttSeller ?? 'marketplace') // 'marketplace'|'mall'
  const [selectedTtCat, setSelectedTtCat] = useState(init.selectedTtCat ?? null)
  const [showTtPicker,  setShowTtPicker]  = useState(false)
  const [ttKomisiManual, setTtKomisiManual] = useState(init.ttKomisiManual ?? '')
  const [ttGmvMax,      setTtGmvMax]      = useState(init.ttGmvMax ?? false)
  const [ttGxp,         setTtGxp]         = useState(init.ttGxp ?? false)
  const [ttPreOrder,    setTtPreOrder]    = useState(init.ttPreOrder ?? false)
  const [cComm,         setCComm]         = useState(init.cComm ?? '')             // komisi affiliasi manual

  // Simpan Produk
  const [showSaveModal, setShowSaveModal] = useState(false)

  const shopeeAdminRate = selectedCat ? selectedCat.fee : (+cAdminManual || 0)
  const shopeeGoxRate   = selectedGox  ? selectedGox.fee  : (+cGoxManual  || 0)

  const isMall = ttSeller === 'mall'
  const ttPlatformRate = selectedTtCat
    ? tiktokPlatformRate(selectedTtCat, isMall, ttGmvMax, ttGxp)
    : (+ttKomisiManual || 0)
  const ttDinamisRate = selectedTtCat ? selectedTtCat.dinamis : 0

  // Snapshot seluruh input yang menentukan perhitungan & bisa disimpan sebagai produk
  const calcState = useMemo(() => ({
    platform, hpp, jual, jualCampaign, jualFlash, adCost, voucher, ongkir,
    selectedCat, cAdminManual, selectedGox, cGoxManual,
    sellerType, promoXtraOn, liveXtraOn, preOrderOn,
    ttSeller, selectedTtCat, ttKomisiManual, ttGmvMax, ttGxp, ttPreOrder, cComm,
  }), [platform, hpp, jual, jualCampaign, jualFlash, adCost, voucher, ongkir,
       selectedCat, cAdminManual, selectedGox, cGoxManual,
       sellerType, promoXtraOn, liveXtraOn, preOrderOn,
       ttSeller, selectedTtCat, ttKomisiManual, ttGmvMax, ttGxp, ttPreOrder, cComm])

  const c = useMemo(() => computeCalc(calcState), [calcState])
  const tiers = useMemo(() => computePriceTiers(calcState), [calcState])

  const profitCls = c ? (c.profit >= 0 ? 'text-green-400' : 'text-red-400') : 'text-ink-faint'
  const profitBg  = c ? (c.profit >= 0 ? 'bg-green-500/8 border-green-500/20' : 'bg-red-500/8 border-red-500/20') : ''

  function switchPlatform(id) {
    setPlatform(id)
    setSelectedCat(null); setCAdminManual('')
    setSelectedGox(null); setCGoxManual('')
    setSellerType('nonstar')
    setPromoXtraOn(false); setLiveXtraOn(false); setPreOrderOn(false)
    setTtSeller('marketplace'); setSelectedTtCat(null); setTtKomisiManual('')
    setTtGmvMax(false); setTtGxp(false); setTtPreOrder(false); setCComm('')
    // Biaya Logistik (LSF) khusus TikTok: isi blended saat ke TikTok, kosong di Shopee.
    setOngkir(id === 'tiktok' ? lsfDefault : '')
  }

  const catLabel = isTikTok ? (selectedTtCat?.label || null) : (selectedCat?.label || null)

  async function handleSave({ name, sku, targetMargin, targetRoas, imageFile, removeImage }) {
    try {
      let image     = initialProduct?.image ?? null
      let imagePath = initialProduct?.imagePath ?? null
      if (removeImage && imagePath) {
        await deleteProductImage(imagePath)
        image = null; imagePath = null
      }
      if (imageFile) {
        if (imagePath) await deleteProductImage(imagePath) // ganti: hapus yang lama
        const up = await uploadProductImage(imageFile)
        image = up.url; imagePath = up.path
      }
      await saveProduct({
        id: initialProduct?.id,
        name, sku,
        platform,
        categoryLabel: catLabel,
        image, imagePath,
        targetMargin: targetMargin === '' ? null : +targetMargin,
        targetRoas:   targetRoas === '' ? null : +targetRoas,
        state: calcState,
      })
      setShowSaveModal(false)
      onAfterSave?.()
    } catch (e) {
      console.error(e)
      alert('Gagal menyimpan produk. Coba lagi.')
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* Platform tabs + Simpan Produk */}
      <div className="flex items-center gap-2 mb-6">
        {[
          { id: 'shopee', label: 'Shopee',     cls: 'bg-blue-600' },
          { id: 'tiktok', label: 'TikTok Shop', cls: 'bg-gray-600' },
        ].map(p => (
          <button key={p.id} onClick={() => switchPlatform(p.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
              platform === p.id
                ? `${p.cls} text-white border-transparent`
                : 'border-line/10 text-ink-muted hover:border-line/20'
            }`}>
            <PlatformIcon id={p.id} />{p.label}
          </button>
        ))}
        <button
          onClick={() => setShowSaveModal(true)}
          disabled={!c}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          <Save className="w-4 h-4" />
          {initialProduct ? 'Perbarui Produk' : 'Simpan Produk'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── LEFT: Inputs ── */}
        <div className="space-y-5">

          <section className="bg-surface border border-line/8 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-ink">Harga &amp; Modal</h3>
            <NumInput label="HPP / Modal" value={hpp} onChange={setHpp} hint="Termasuk biaya packaging &amp; pengiriman ke gudang" />
            <NumInput label="Harga Jual"  value={jual} onChange={setJual} />
            <div className="pt-1 border-t border-line/8 space-y-4">
              <p className="text-[11px] text-ink-faint -mb-1">Harga promo <span className="font-normal">(opsional)</span> — biaya & program ikut konfigurasi di bawah, hanya harga yang berbeda.</p>
              <NumInput label="Harga Campaign"   value={jualCampaign} onChange={setJualCampaign} hint="Harga saat ikut campaign (mis. 6.6, payday sale)" />
              <NumInput label="Harga Flash Sale"  value={jualFlash}    onChange={setJualFlash}    hint="Harga saat slot Flash Sale" />
            </div>
          </section>

          <section className="bg-surface border border-line/8 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-ink">Biaya Platform</h3>

            {isTikTok ? (
              <>
                {/* Tipe Penjual */}
                <div>
                  <p className="text-xs font-medium text-ink-muted mb-2">Tipe Penjual</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'marketplace', label: 'Marketplace' },
                      { id: 'mall',        label: 'Mall' },
                    ].map(t => (
                      <button key={t.id} onClick={() => setTtSeller(t.id)}
                        className={`py-2 text-xs font-medium rounded-xl border transition-all ${
                          ttSeller === t.id
                            ? 'bg-gray-500/20 text-ink-strong border-gray-400/30'
                            : 'border-line/10 text-ink-muted hover:border-line/20 hover:text-ink'
                        }`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Kategori Produk — picker (menentukan Biaya Platform + Komisi Dinamis) */}
                <div>
                  <p className="text-xs font-medium text-ink-muted mb-1.5">Kategori Produk</p>
                  <button
                    onClick={() => setShowTtPicker(true)}
                    className="w-full flex items-center justify-between bg-fill/5 border border-line/10 rounded-xl px-4 py-3 hover:border-blue-600/40 hover:bg-fill/8 transition-all group"
                  >
                    <div className="text-left">
                      <p className={`text-sm font-medium ${selectedTtCat ? 'text-ink-strong' : 'text-ink-faint'}`}>
                        {selectedTtCat ? selectedTtCat.label : 'Pilih kategori produk...'}
                      </p>
                      {selectedTtCat && (
                        <p className="text-[11px] text-ink-faint mt-0.5">Platform {ttPlatformRate.toFixed(2)}% + Dinamis {ttDinamisRate.toFixed(2)}%</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-lg font-bold tabular-nums ${selectedTtCat ? 'text-blue-400' : 'text-ink-faint'}`}>
                        {selectedTtCat ? `${(ttPlatformRate + ttDinamisRate).toFixed(2)}%` : '0.00%'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-ink-faint group-hover:text-ink-muted transition-colors" />
                    </div>
                  </button>
                  {selectedTtCat ? (
                    <button onClick={() => setSelectedTtCat(null)}
                      className="text-xs text-ink-faint hover:text-ink-muted mt-1 transition-colors">Hapus kategori</button>
                  ) : (
                    <div className="mt-2">
                      <NumInput label="Atau Biaya Platform manual (%)" value={ttKomisiManual} onChange={setTtKomisiManual} suffix="%" />
                    </div>
                  )}
                </div>

                {/* Komisi Affiliasi opsional */}
                <NumInput label="Komisi Affiliasi (%)" value={cComm} onChange={setCComm} suffix="%" hint="Isi jika produk dipromosikan via afiliasi/kreator" />

                {/* Program TikTok */}
                <div className="pt-1">
                  <p className="text-xs font-medium text-ink-muted mb-2">Program & Penghematan <span className="text-ink-faint font-normal">(opsional)</span></p>
                  <div className="space-y-2">
                    <ProgramToggle
                      label="GMV Max ≥ 3%"
                      desc="Penghematan komisi tingkat toko (rasio iklan GMV Max ≥ 3% dari GMV 30 hari)"
                      isOn={ttGmvMax}
                      onToggle={() => setTtGmvMax(v => !v)}
                      accent="blue"
                    />
                    <ProgramToggle
                      label="Growth Xtra (GXP)"
                      value={ttGxp && selectedTtCat ? `+${selectedTtCat.gxpFee}%` : null}
                      desc={ttGxp && selectedTtCat
                        ? `Komisi turun, + biaya layanan ${selectedTtCat.gxpFee}% (maks Rp20.000/produk)`
                        : 'Diskon komisi tingkat toko + biaya layanan GXP per kategori'}
                      isOn={ttGxp}
                      onToggle={() => setTtGxp(v => !v)}
                    />
                    <ProgramToggle
                      label="Pre-Order"
                      value="3%"
                      desc="Biaya layanan pre-order per produk"
                      isOn={ttPreOrder}
                      onToggle={() => setTtPreOrder(v => !v)}
                    />
                  </div>
                </div>

                {/* Summary TikTok */}
                <div className="bg-fill/5 rounded-xl p-3 space-y-1.5 text-xs">
                  <Row label={`Biaya Platform${ttGmvMax || ttGxp ? ' (hemat)' : ''}`} value={`${ttPlatformRate.toFixed(2)}%`} />
                  {ttDinamisRate > 0 && <Row label="Biaya Komisi Dinamis" value={`${ttDinamisRate.toFixed(2)}% (maks Rp650rb)`} />}
                  {(+cComm || 0) > 0 && <Row label="Komisi Affiliasi" value={`${(+cComm).toFixed(2)}%`} />}
                  <Row label="Biaya Pemrosesan Order" value="Rp1.250 / pesanan" className="text-ink-muted" />
                  {ttGxp && selectedTtCat && <Row label="Biaya Layanan GXP" value={`${selectedTtCat.gxpFee.toFixed(2)}% (maks Rp20rb)`} className="text-orange-400/90" />}
                  {ttPreOrder && <Row label="Pre-Order" value="3%" className="text-orange-400/90" />}
                  <Row label="Total Komisi & Biaya %"
                       value={<span className="text-blue-400 font-semibold">{(
                         ttPlatformRate + ttDinamisRate + (+cComm || 0) +
                         (ttGxp && selectedTtCat ? selectedTtCat.gxpFee : 0) +
                         (ttPreOrder ? 3 : 0)
                       ).toFixed(2)}% + Rp1.250</span>}
                       className="border-t border-line/10 pt-1.5 font-semibold" />
                </div>
              </>
            ) : (
              <>
                {/* Tipe Toko */}
                <div>
                  <p className="text-xs font-medium text-ink-muted mb-2">Tipe Toko</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'nonstar', label: 'Non-Star' },
                      { id: 'star',    label: 'Star / Star+' },
                      { id: 'mall',    label: 'Shopee Mall' },
                    ].map(t => (
                      <button key={t.id} onClick={() => setSellerType(t.id)}
                        className={`py-2 text-xs font-medium rounded-xl border transition-all ${
                          sellerType === t.id
                            ? 'bg-blue-600/20 text-blue-400 border-blue-600/30'
                            : 'border-line/10 text-ink-muted hover:border-line/20 hover:text-ink'
                        }`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {sellerType === 'mall' && (
                    <p className="text-xs text-blue-400/80 mt-1.5">
                      + Biaya Pembayaran 1,8% (maks. Rp50.000/produk) ditambahkan otomatis
                    </p>
                  )}
                </div>

                {/* Shopee — Biaya Admin via Category Picker */}
                <div>
                  <p className="text-xs font-medium text-ink-muted mb-1.5">Biaya Administrasi (dari Kategori Produk)</p>
                  <button
                    onClick={() => setShowPicker(true)}
                    className="w-full flex items-center justify-between bg-fill/5 border border-line/10 rounded-xl px-4 py-3 hover:border-blue-600/40 hover:bg-fill/8 transition-all group"
                  >
                    <div className="text-left">
                      <p className={`text-sm font-medium ${selectedCat ? 'text-ink-strong' : 'text-ink-faint'}`}>
                        {selectedCat ? selectedCat.label : 'Pilih kategori produk...'}
                      </p>
                      {selectedCat && (
                        <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-1">
                          {selectedCat.special
                            ? <><AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" /> Ada ketentuan tambahan</>
                            : 'Biaya Administrasi resmi Shopee'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-lg font-bold tabular-nums ${selectedCat ? (selectedCat.special ? 'text-amber-400' : 'text-blue-400') : 'text-ink-faint'}`}>
                        {selectedCat ? `${selectedCat.fee.toFixed(2)}%` : '0.00%'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-ink-faint group-hover:text-ink-muted transition-colors" />
                    </div>
                  </button>
                  {!selectedCat && (
                    <p className="text-xs text-ink-faint mt-1.5">Atau masukkan manual di bawah</p>
                  )}
                </div>

                {/* Manual override */}
                <div className="space-y-3">
                  <NumInput
                    label={selectedCat ? 'Biaya Admin (override manual)' : 'Biaya Admin (%)'}
                    value={selectedCat ? selectedCat.fee.toString() : cAdminManual}
                    onChange={v => { setSelectedCat(null); setCAdminManual(v) }}
                    suffix="%"
                    hint={selectedCat ? 'Edit untuk override nilai dari kategori' : ''}
                  />
                </div>

                {/* GO XTRA fee */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Truck className="w-3.5 h-3.5 text-orange-400" />
                    <p className="text-xs font-medium text-ink-muted">Biaya GO XTRA <span className="text-ink-faint font-normal">(opsional)</span></p>
                  </div>
                  <button
                    onClick={() => setShowGoxPicker(true)}
                    className="w-full flex items-center justify-between bg-fill/5 border border-line/10 rounded-xl px-4 py-3 hover:border-orange-500/40 hover:bg-fill/8 transition-all group"
                  >
                    <p className={`text-sm font-medium ${selectedGox ? 'text-ink-strong' : 'text-ink-faint'}`}>
                      {selectedGox ? selectedGox.label : 'Pilih program GO XTRA...'}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-lg font-bold tabular-nums ${selectedGox ? 'text-orange-400' : 'text-ink-faint'}`}>
                        {selectedGox ? `${selectedGox.fee.toFixed(2)}%` : '0.00%'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-ink-faint group-hover:text-ink-muted transition-colors" />
                    </div>
                  </button>
                  {selectedGox && (
                    <button onClick={() => { setSelectedGox(null); setCGoxManual('') }}
                      className="text-xs text-ink-faint hover:text-ink-muted mt-1 transition-colors">
                      Hapus GO XTRA
                    </button>
                  )}
                </div>

                {/* Program Opsional — gabung di kartu Biaya Platform */}
                <div className="pt-1">
                  <p className="text-xs font-medium text-ink-muted mb-2">Program Shopee <span className="text-ink-faint font-normal">(opsional)</span></p>
                  <div className="space-y-2">
                    <ProgramToggle
                      label="Promo XTRA"
                      value="4.5%"
                      desc="maks. Rp60.000/produk"
                      isOn={promoXtraOn}
                      onToggle={() => setPromoXtraOn(v => !v)}
                    />
                    <ProgramToggle
                      label="Shopee Live XTRA"
                      value={promoXtraOn ? '2%' : '3%'}
                      desc={promoXtraOn ? 'maks. Rp20.000/produk (diskon karena Promo XTRA aktif)' : 'maks. Rp20.000/produk'}
                      isOn={liveXtraOn}
                      onToggle={() => setLiveXtraOn(v => !v)}
                    />
                    <ProgramToggle
                      label="Pre-Order"
                      value="3%"
                      desc="per kuantitas produk pre-order aktif"
                      isOn={preOrderOn}
                      onToggle={() => setPreOrderOn(v => !v)}
                    />
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-fill/5 rounded-xl p-3 space-y-1.5 text-xs">
                  <Row label="Biaya Admin"          value={`${shopeeAdminRate.toFixed(2)}%`} />
                  <Row label="Biaya Proses Pesanan" value="Rp1.250 / transaksi" className="text-ink-muted" />
                  {shopeeGoxRate > 0 && <Row label="Biaya GO XTRA" value={`${shopeeGoxRate.toFixed(2)}%`} className="text-orange-400/90" />}
                  {sellerType === 'mall' && <Row label="Biaya Pembayaran (Mall)" value="1.8% (maks Rp50rb)" className="text-blue-400/80" />}
                  {promoXtraOn && <Row label="Promo XTRA" value="4.5% (maks Rp60rb)" className="text-orange-400/90" />}
                  {liveXtraOn && <Row label="Shopee Live XTRA" value={`${promoXtraOn ? 2 : 3}% (maks Rp20rb)`} className="text-orange-400/90" />}
                  {preOrderOn && <Row label="Pre-Order" value="3%" className="text-orange-400/90" />}
                  <Row label="Total Potongan Platform"
                       value={<span className="text-blue-400 font-semibold">{(
                         shopeeAdminRate + shopeeGoxRate +
                         (sellerType === 'mall' ? 1.8 : 0) +
                         (promoXtraOn ? 4.5 : 0) +
                         (liveXtraOn ? (promoXtraOn ? 2 : 3) : 0) +
                         (preOrderOn ? 3 : 0)
                       ).toFixed(2)}% + Rp1.250</span>}
                       className="border-t border-line/10 pt-1.5 font-semibold" />
                </div>
              </>
            )}
          </section>

          <section className="bg-surface border border-line/8 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-ink">
              Biaya Tambahan <span className="text-ink-faint text-xs font-normal">(opsional)</span>
            </h3>
            <NumInput label="Biaya Iklan"     value={adCost}  onChange={setAdCost}  hint="Biaya iklan yang dialokasikan per unit terjual" />
            <NumInput label="Voucher Seller"  value={voucher} onChange={setVoucher} hint="Nominal voucher yang kamu tanggung sendiri" />
            <NumInput
              label={isTikTok ? 'Biaya Logistik' : 'Subsidi Ongkir'}
              value={ongkir} onChange={setOngkir}
              hint={isTikTok ? 'Biaya Layanan Logistik (LSF) yang ditanggung seller' : 'Ongkos kirim yang ditanggung seller'}
              badge={isTikTok && storeLSF?.hasData && (
                <span
                  title="Estimasi berbasis tarif Standard ≤1kg dari Jawa. Order berbobot >1kg atau layanan lain bisa berbeda."
                  className="inline-flex items-center text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-1.5 py-0.5 cursor-help">
                  auto dari data toko
                </span>
              )} />
          </section>
        </div>

        {/* ── RIGHT: Results ── */}
        <div className="space-y-5">
          {c ? (
            <>
              {/* Profit highlight */}
              <div className={`rounded-2xl p-5 border ${profitBg}`}>
                <p className="text-xs font-semibold tracking-wider text-ink-muted mb-1">PROFIT BERSIH</p>
                <p className={`text-4xl font-bold ${profitCls}`}>{fmt(c.profit)}</p>
                <div className="flex gap-5 mt-3">
                  <div>
                    <p className="text-xs text-ink-faint">Margin dari Harga Jual</p>
                    <p className={`text-sm font-bold ${profitCls}`}>{pct(c.margin)}</p>
                  </div>
                  {c.rom != null && (
                    <div>
                      <p className="text-xs text-ink-faint">Return on Modal</p>
                      <p className={`text-sm font-bold ${profitCls}`}>{pct(c.rom)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Perbandingan tier harga (Normal/Campaign/Flash Sale) */}
              {tiers.length > 1 && (
                <div className="bg-surface border border-line/8 rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-ink mb-1">Perbandingan Harga</h3>
                  <p className="text-[11px] text-ink-faint mb-3">Profit &amp; margin per unit (sebelum iklan) — biaya sama, hanya harga berbeda</p>
                  <div className="space-y-2">
                    {tiers.map(ti => {
                      const st = productStatus(ti.calc.marginNoAd)
                      const txt = st.color === 'green' ? 'text-green-400' : st.color === 'yellow' ? 'text-yellow-400' : 'text-red-400'
                      const dot = st.color === 'green' ? 'bg-green-500' : st.color === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                      return (
                        <div key={ti.key} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-fill/5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                              <p className="text-sm font-medium text-ink-strong">{ti.label}</p>
                              {ti.belowBep && <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 rounded px-1.5 py-0.5">di bawah BEP</span>}
                            </div>
                            <p className="text-[11px] text-ink-faint mt-0.5 ml-3">{fmt(ti.price)}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-sm font-bold tabular-nums ${ti.calc.profitNoAd >= 0 ? 'text-ink-strong' : 'text-red-400'}`}>{fmt(ti.calc.profitNoAd)}</p>
                            <p className={`text-[11px] font-medium tabular-nums ${txt}`}>{ti.calc.marginNoAd.toFixed(1)}%</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ROAS Intelligence */}
              <RoasIntelligence
                hargaJual={c.h}
                profit={c.profitNoAd}
                margin={c.marginNoAd}
                roasBep={c.roasBep}
              />

              {/* Breakdown */}
              <CalcBreakdown c={c} isTikTok={isTikTok} profitCls={profitCls} />

              {/* BEP & ROAS cards */}
              <div className="grid grid-cols-2 gap-3">
                {c.bep != null && (
                  <div className="bg-surface border border-line/8 rounded-2xl p-4">
                    <p className="text-xs text-ink-faint mb-0.5">Harga BEP (titik impas)</p>
                    <p className="text-lg font-bold text-ink-strong">{fmt(Math.ceil(c.bep))}</p>
                    <p className="text-xs text-ink-faint mt-1.5">Harga jual minimal agar tidak rugi</p>
                  </div>
                )}
                {c.roas != null && (
                  <div className="bg-surface border border-line/8 rounded-2xl p-4">
                    <p className="text-xs text-ink-faint mb-0.5">ROAS Iklan</p>
                    <p className={`text-lg font-bold ${c.roas >= 3 ? 'text-green-400' : c.roas >= 1.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {c.roas.toFixed(2)}&times;
                    </p>
                    <p className="text-xs text-ink-faint mt-1.5">
                      {c.roas >= 3 ? 'Efisiensi iklan bagus' : c.roas >= 1.5 ? 'Cukup, bisa dioptimasi' : 'Perlu dioptimasi'}
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-surface border border-line/8 rounded-2xl flex flex-col items-center justify-center text-center p-12 min-h-[300px]">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-3">
                <TrendingUp className="w-6 h-6 text-blue-500" />
              </div>
              <p className="text-sm font-medium text-ink">Masukkan Harga Jual</p>
              <p className="text-xs text-ink-faint mt-1 max-w-[200px]">
                Hasil kalkulasi muncul di sini secara real-time
              </p>
            </div>
          )}
        </div>
      </div>

      {showPicker && (
        <CategoryPicker
          onSelect={item => { setSelectedCat(item); setCAdminManual('') }}
          onClose={() => setShowPicker(false)}
        />
      )}
      {showGoxPicker && (
        <OngkirPicker
          onSelect={item => { setSelectedGox(item); setCGoxManual('') }}
          onClose={() => setShowGoxPicker(false)}
        />
      )}
      {showTtPicker && (
        <TikTokPicker
          isMall={isMall} gmvMax={ttGmvMax} gxp={ttGxp}
          onSelect={item => { setSelectedTtCat(item); setTtKomisiManual('') }}
          onClose={() => setShowTtPicker(false)}
        />
      )}
      {showSaveModal && (
        <SaveProductModal
          initialProduct={initialProduct}
          calc={c}
          defaultMargin={c ? c.marginNoAd : null}
          onSave={handleSave}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  )
}

function SaveProductModal({ initialProduct, calc, defaultMargin, onSave, onClose }) {
  const [name, setName] = useState(initialProduct?.name ?? '')
  const [sku,  setSku]  = useState(initialProduct?.sku ?? '')
  const [targetMargin, setTargetMargin] = useState(initialProduct?.targetMargin ?? '')
  const [targetRoas,   setTargetRoas]   = useState(initialProduct?.targetRoas ?? '')

  // Foto: preview lokal (objectURL) saat pilih file baru; upload sebenarnya
  // terjadi di handleSave. `removed` menandai hapus foto lama yang sudah ada.
  const [imageFile, setImageFile] = useState(null)
  const [removed, setRemoved] = useState(false)
  const [busy, setBusy] = useState(false)
  const imgRef = useRef(null)
  const localPreview = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile])
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview) }, [localPreview])
  const shownImage = localPreview || (removed ? null : initialProduct?.image) || null

  function pickFile(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('File harus berupa gambar.'); return }
    setImageFile(file); setRemoved(false)
  }
  function clearImage() {
    setImageFile(null)
    setRemoved(!!initialProduct?.image) // tandai hapus hanya bila ada foto tersimpan
    if (imgRef.current) imgRef.current.value = ''
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onSave({ name: name.trim(), sku: sku.trim(), targetMargin, targetRoas, imageFile, removeImage: removed })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <form onSubmit={submit} className="bg-surface w-full max-w-md rounded-2xl border border-line/10 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line/8">
          <h2 className="font-semibold text-ink-strong">{initialProduct ? 'Perbarui Produk' : 'Simpan Produk'}</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {/* Foto produk */}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Foto Produk</label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl border border-line/10 bg-fill/5 overflow-hidden flex items-center justify-center flex-shrink-0">
                {shownImage
                  ? <img src={shownImage} alt="" className="w-full h-full object-cover" />
                  : <ImagePlus className="w-5 h-5 text-ink-faint" />}
              </div>
              <div className="flex flex-col gap-1.5">
                <button type="button" onClick={() => imgRef.current?.click()}
                  className="text-xs px-3 py-1.5 rounded-lg border border-line/10 text-ink-muted hover:text-ink hover:border-line/20 transition-colors w-fit">
                  {shownImage ? 'Ganti Foto' : 'Pilih Foto'}
                </button>
                {shownImage && (
                  <button type="button" onClick={clearImage}
                    className="flex items-center gap-1 text-xs text-ink-faint hover:text-red-400 transition-colors w-fit">
                    <Trash2 className="w-3 h-3" /> Hapus
                  </button>
                )}
              </div>
              <input ref={imgRef} type="file" accept="image/*" className="hidden"
                onChange={e => pickFile(e.target.files[0])} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Nama Produk <span className="text-red-400">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="mis. Kaos Polos Premium"
              className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">SKU</label>
            <input value={sku} onChange={e => setSku(e.target.value)} placeholder="mis. KP-001"
              className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Target Margin (%)</label>
              <input type="number" value={targetMargin} onChange={e => setTargetMargin(e.target.value)} placeholder="mis. 30"
                className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Target ROAS (×)</label>
              <input type="number" value={targetRoas} onChange={e => setTargetRoas(e.target.value)} placeholder={calc?.roasBep ? `BEP ${calc.roasBep}` : 'mis. 4'}
                className="w-full bg-fill/5 border border-line/10 rounded-xl px-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:ring-2 focus:ring-blue-600/50" />
            </div>
          </div>
          {defaultMargin != null && (
            <p className="text-[11px] text-ink-faint">Margin bersih saat ini: <span className="text-ink-muted font-medium">{defaultMargin.toFixed(1)}%</span>{calc?.roasBep ? ` · ROAS BEP ${calc.roasBep}×` : ''}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-line/8">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-ink-muted border border-line/10 rounded-xl hover:border-line/20 hover:text-ink disabled:opacity-40 transition-colors">Batal</button>
          <button type="submit" disabled={!name.trim() || busy} className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-40 transition-colors">{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </div>
  )
}
