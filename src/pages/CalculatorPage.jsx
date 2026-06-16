import { useState, useMemo } from 'react'
import { TrendingUp, ChevronDown, Truck, Save, X } from 'lucide-react'
import CategoryPicker from '../components/CategoryPicker'
import OngkirPicker from '../components/OngkirPicker'
import RoasIntelligence from '../components/RoasIntelligence'
import TikTokPicker from '../components/TikTokPicker'
import { tiktokPlatformRate } from '../utils/tiktokFeeData'
import { computeCalc } from '../utils/calc'
import { saveProduct } from '../utils/products'

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

function pct(n, digits = 1) {
  if (n == null || isNaN(n)) return '—'
  return `${n.toFixed(digits)}%`
}

function NumInput({ label, value, onChange, suffix, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-muted mb-1.5">{label}</label>
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

  const [platform, setPlatform] = useState(init.platform ?? 'shopee')
  const isTikTok = platform === 'tiktok'

  const [hpp,     setHpp]     = useState(init.hpp ?? '')
  const [jual,    setJual]    = useState(init.jual ?? '')
  const [adCost,  setAdCost]  = useState(init.adCost ?? '')
  const [voucher, setVoucher] = useState(init.voucher ?? '')
  const [ongkir,  setOngkir]  = useState(init.ongkir ?? '')

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
    platform, hpp, jual, adCost, voucher, ongkir,
    selectedCat, cAdminManual, selectedGox, cGoxManual,
    sellerType, promoXtraOn, liveXtraOn, preOrderOn,
    ttSeller, selectedTtCat, ttKomisiManual, ttGmvMax, ttGxp, ttPreOrder, cComm,
  }), [platform, hpp, jual, adCost, voucher, ongkir,
       selectedCat, cAdminManual, selectedGox, cGoxManual,
       sellerType, promoXtraOn, liveXtraOn, preOrderOn,
       ttSeller, selectedTtCat, ttKomisiManual, ttGmvMax, ttGxp, ttPreOrder, cComm])

  const c = useMemo(() => computeCalc(calcState), [calcState])

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
  }

  const catLabel = isTikTok ? (selectedTtCat?.label || null) : (selectedCat?.label || null)

  function handleSave({ name, sku, targetMargin, targetRoas }) {
    saveProduct({
      id: initialProduct?.id,
      name, sku,
      platform,
      categoryLabel: catLabel,
      targetMargin: targetMargin === '' ? null : +targetMargin,
      targetRoas:   targetRoas === '' ? null : +targetRoas,
      state: calcState,
    })
    setShowSaveModal(false)
    onAfterSave?.()
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* Platform tabs + Simpan Produk */}
      <div className="flex items-center gap-2 mb-6">
        {[
          { id: 'shopee', emoji: '🛍️', label: 'Shopee',     cls: 'bg-blue-600' },
          { id: 'tiktok', emoji: '🎵',       label: 'TikTok Shop', cls: 'bg-gray-600' },
        ].map(p => (
          <button key={p.id} onClick={() => switchPlatform(p.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
              platform === p.id
                ? `${p.cls} text-white border-transparent`
                : 'border-line/10 text-ink-muted hover:border-line/20'
            }`}>
            <span>{p.emoji}</span>{p.label}
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
                        <p className="text-xs text-ink-muted mt-0.5">
                          {selectedCat.special ? '⚠ Ada ketentuan tambahan' : 'Biaya Administrasi resmi Shopee'}
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
            <NumInput label="Subsidi Ongkir"  value={ongkir}  onChange={setOngkir}  hint="Ongkos kirim yang ditanggung seller" />
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

              {/* ROAS Intelligence */}
              <RoasIntelligence
                hargaJual={c.h}
                profit={c.profitNoAd}
                margin={c.marginNoAd}
                roasBep={c.roasBep}
              />

              {/* Breakdown */}
              <div className="bg-surface border border-line/8 rounded-2xl p-5 space-y-2">
                <h3 className="text-sm font-semibold text-ink mb-3">Rincian Kalkulasi</h3>

                <Row label="Harga Jual" value={<span className="font-medium text-ink">{fmt(c.h)}</span>} />

                <div className="pt-2 border-t border-line/5 space-y-1">
                  <p className="text-xs text-ink-faint mb-1">Potongan Platform</p>
                  <div className="pl-2 space-y-1">
                    <Row label={isTikTok ? `Biaya Platform (${c.adminRate}%)` : `Biaya Admin (${c.adminRate}%)`}
                         value={<span className="text-red-400">-{fmt(c.adminCut)}</span>} />
                    {c.dinamisCut > 0 && (
                      <Row label={`Biaya Komisi Dinamis (${c.dinamisRate}%)`}
                           value={<span className="text-red-400">-{fmt(c.dinamisCut)}</span>} />
                    )}
                    {c.biayaProsesCut > 0 && (
                      <Row label={isTikTok ? 'Biaya Pemrosesan Order' : 'Biaya Proses Pesanan'}
                           value={<span className="text-red-400">-{fmt(c.biayaProsesCut)}</span>} />
                    )}
                    {c.gxpCut > 0 && (
                      <Row label={`Biaya Layanan GXP (${c.gxpRate}%)`}
                           value={<span className="text-orange-400">-{fmt(c.gxpCut)}</span>} />
                    )}
                    {c.goxCut > 0 && (
                      <Row label={`Biaya GO XTRA (${c.goxRate}%)`}
                           value={<span className="text-orange-400">-{fmt(c.goxCut)}</span>} />
                    )}
                    {c.pembayaranCut > 0 && (
                      <Row label="Biaya Pembayaran Mall (1.8%)"
                           value={<span className="text-red-400">-{fmt(c.pembayaranCut)}</span>} />
                    )}
                    {c.promoXtraCut > 0 && (
                      <Row label={`Promo XTRA (${c.promoRate}%)`}
                           value={<span className="text-orange-400">-{fmt(c.promoXtraCut)}</span>} />
                    )}
                    {c.liveXtraCut > 0 && (
                      <Row label={`Shopee Live XTRA (${c.liveRate}%)`}
                           value={<span className="text-purple-400">-{fmt(c.liveXtraCut)}</span>} />
                    )}
                    {c.preOrderCut > 0 && (
                      <Row label="Pre-Order (3%)"
                           value={<span className="text-orange-400">-{fmt(c.preOrderCut)}</span>} />
                    )}
                    {c.commCut > 0 && (
                      <Row label={`Komisi Affiliasi (${c.commRate}%)`}
                           value={<span className="text-red-400">-{fmt(c.commCut)}</span>} />
                    )}
                    {c.v  > 0 && <Row label="Voucher Seller" value={<span className="text-red-400">-{fmt(c.v)}</span>} />}
                    {c.ok > 0 && <Row label="Subsidi Ongkir" value={<span className="text-red-400">-{fmt(c.ok)}</span>} />}
                  </div>
                </div>

                <Row label="Pendapatan Bersih"
                     value={<span className="font-semibold text-ink">{fmt(c.bersih)}</span>}
                     className="border-t border-line/8 pt-2" />
                {c.m  > 0 && <Row label="HPP / Modal"  value={<span className="text-red-400">-{fmt(c.m)}</span>} />}
                {c.ad > 0 && <Row label="Biaya Iklan"  value={<span className="text-red-400">-{fmt(c.ad)}</span>} />}

                <Row label="Profit Bersih"
                     value={<span className={`font-bold ${profitCls}`}>{fmt(c.profit)}</span>}
                     className="border-t border-line/8 pt-2 font-semibold" />
              </div>

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

  function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), sku: sku.trim(), targetMargin, targetRoas })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <form onSubmit={submit} className="bg-surface w-full max-w-md rounded-2xl border border-line/10 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line/8">
          <h2 className="font-semibold text-ink-strong">{initialProduct ? 'Perbarui Produk' : 'Simpan Produk'}</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
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
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-line/10 rounded-xl hover:border-line/20 hover:text-ink transition-colors">Batal</button>
          <button type="submit" disabled={!name.trim()} className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-40 transition-colors">Simpan</button>
        </div>
      </form>
    </div>
  )
}
