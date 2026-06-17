// Rincian Kalkulasi — dipakai di CalculatorPage (live) maupun modal detail produk.
// Menerima objek hasil computeCalc (c) + flag platform.
function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

function Row({ label, value, className = '' }) {
  return (
    <div className={`flex justify-between items-baseline text-sm ${className}`}>
      <span className="text-ink-muted">{label}</span>
      <span>{value}</span>
    </div>
  )
}

export default function CalcBreakdown({ c, isTikTok, profitCls = 'text-green-400' }) {
  if (!c) return null
  return (
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
          {c.ok > 0 && <Row label={isTikTok ? 'Biaya Logistik' : 'Subsidi Ongkir'} value={<span className="text-red-400">-{fmt(c.ok)}</span>} />}
        </div>
      </div>

      <Row label="Pendapatan Bersih"
           value={<span className="font-semibold text-ink">{fmt(c.bersih)}</span>}
           className="border-t border-line/8 pt-2" />
      {c.m  > 0 && <Row label="HPP / Modal" value={<span className="text-red-400">-{fmt(c.m)}</span>} />}
      {c.ad > 0 && <Row label="Biaya Iklan" value={<span className="text-red-400">-{fmt(c.ad)}</span>} />}

      <Row label="Profit Bersih"
           value={<span className={`font-bold ${profitCls}`}>{fmt(c.profit)}</span>}
           className="border-t border-line/8 pt-2 font-semibold" />
    </div>
  )
}
