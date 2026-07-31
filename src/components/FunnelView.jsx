import { useMemo, useState } from 'react'
import { Filter } from 'lucide-react'
import { fmtNum } from '../utils/quadrantUtils'
import { aggregateFunnel, productFunnel, stageMedians, weakestStage } from '../utils/quadrantDetail'

const STAGE_CLS = {
  impresi:    'bg-blue-600/15 text-blue-300',
  pengunjung: 'bg-blue-600/15 text-blue-300',
  klik:       'bg-blue-600/25 text-blue-200',
  keranjang:  'bg-amber-500/20 text-amber-200',
  pesanan:    'bg-green-500/20 text-green-200',
}

function Bars({ stages, showRate = true }) {
  const max = stages[0]?.value || 1
  return (
    <div className="space-y-1.5">
      {stages.map(s => {
        const w = Math.max(6, (s.value / max) * 100)
        return (
          <div key={s.key} className="flex items-center gap-3">
            <span className="text-[11px] text-ink-muted w-20 flex-shrink-0">{s.label}</span>
            <div className="flex-1 min-w-0">
              <div className={`h-7 rounded-lg flex items-center px-2.5 text-[12px] font-medium tabular-nums ${STAGE_CLS[s.key] || STAGE_CLS.impresi}`}
                style={{ width: `${w}%` }}>
                <span className="truncate">
                  {fmtNum(s.value)}
                  {showRate && s.rate != null && <span className="opacity-70"> · {s.rateLabel} {s.rate.toFixed(2)}%</span>}
                </span>
              </div>
            </div>
            <span className="text-[11px] text-red-400 tabular-nums w-16 text-right flex-shrink-0">
              {s.dropPct != null ? `−${s.dropPct.toFixed(1)}%` : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function FunnelView({ products, trafficLabel = 'Pengunjung' }) {
  const [openId, setOpenId] = useState(null)
  const agg = useMemo(() => aggregateFunnel(products), [products])
  const rows = useMemo(
    () => {
      const med = stageMedians(products)
      return (products || [])
        .map(p => ({ p, f: productFunnel(p), weak: weakestStage(p, med) }))
        .filter(r => r.f)
        .sort((a, b) => (a.weak?.ratio ?? 99) - (b.weak?.ratio ?? 99))
    },
    [products],
  )
  const skipped = (products?.length || 0) - rows.length

  if (!rows.length) {
    return (
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-10 text-center">
        <Filter className="w-7 h-7 text-ink-faint mx-auto mb-2" />
        <p className="text-sm text-ink-muted">Data periode ini belum cukup untuk membentuk corong.</p>
        <p className="text-xs text-ink-faint mt-1">Butuh minimal {trafficLabel.toLowerCase()} + tingkat konversi per produk.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Corong gabungan — dipisah per bentuk data supaya angkanya tak dicampur */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {agg.tiktok && (
          <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-4">
            <p className="text-sm font-semibold text-ink-strong mb-0.5">Corong dengan tahap klik</p>
            <p className="text-[11px] text-ink-faint mb-3">{agg.tiktok.count} produk · impresi dipulihkan dari klik ÷ CTR</p>
            <Bars stages={agg.tiktok.stages} showRate={false} />
            {agg.tiktok.leak && (
              <p className="text-[11px] text-ink-muted mt-3 pt-2.5 border-t border-line/8">
                Kebocoran terbesar: <b className="text-ink-strong">{agg.tiktok.leak.from} → {agg.tiktok.leak.to}</b> — {fmtNum(agg.tiktok.leak.lost)} hilang ({agg.tiktok.leak.pct.toFixed(1)}%).
              </p>
            )}
          </div>
        )}
        {agg.tanpaKlik && (
          <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-4">
            <p className="text-sm font-semibold text-ink-strong mb-0.5">Corong tanpa tahap klik</p>
            <p className="text-[11px] text-ink-faint mb-3">{agg.tanpaKlik.count} produk · sumber data tak memuat impresi/klik (mis. Shopee)</p>
            <Bars stages={agg.tanpaKlik.stages} showRate={false} />
            {agg.tanpaKlik.leak && (
              <p className="text-[11px] text-ink-muted mt-3 pt-2.5 border-t border-line/8">
                Kebocoran terbesar: <b className="text-ink-strong">{agg.tanpaKlik.leak.from} → {agg.tanpaKlik.leak.to}</b> — {fmtNum(agg.tanpaKlik.leak.lost)} hilang ({agg.tanpaKlik.leak.pct.toFixed(1)}%).
              </p>
            )}
          </div>
        )}
      </div>

      {/* Per produk */}
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-line/8 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-strong">Corong per produk <span className="font-normal text-ink-faint">· yang paling tertinggal di atas</span></p>
          <p className="text-[11px] text-ink-faint">{rows.length} produk{skipped > 0 ? ` · ${skipped} dilewati (data kurang)` : ''}</p>
        </div>
        <div className="divide-y divide-line/8">
          {rows.map(({ p, f, weak }) => {
            const open = openId === p.kode_produk
            return (
              <div key={p.kode_produk} className="px-4 py-3">
                <button onClick={() => setOpenId(open ? null : p.kode_produk)} className="w-full flex items-center gap-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink truncate">{p.nama_produk}</p>
                    <p className="text-[11px] text-ink-faint truncate">
                      {weak && weak.behind > 5
                        ? <>tahap terlemah: <span className="text-amber-300">{weak.label}</span> · {weak.metric} {weak.rate.toFixed(2)}% vs median {weak.mid.toFixed(2)}% ({weak.behind.toFixed(0)}% di bawah)</>
                        : weak
                          ? <>semua tahap setara atau di atas median periode ini</>
                          : 'data tahap belum lengkap'}
                    </p>
                  </div>
                  <span className="text-[11px] text-ink-faint tabular-nums flex-shrink-0 hidden sm:inline">
                    {p.ctr != null ? `CTR ${p.ctr.toFixed(2)}%${f.derived ? '*' : ''} · ` : ''}CR {p.conversion_rate?.toFixed(2)}%
                  </span>
                </button>
                {open && <div className="mt-3"><Bars stages={f.stages} /></div>}
              </div>
            )
          })}
        </div>
        <p className="px-4 py-2.5 text-[11px] text-ink-muted border-t border-line/8">
          %ATC dan CR dihitung terhadap klik (TikTok) atau pengunjung (Shopee) — keduanya cabang dari tahap yang sama, bukan bertingkat. Angka impresi dipulihkan dari klik ÷ CTR.
        </p>
      </div>
    </div>
  )
}
