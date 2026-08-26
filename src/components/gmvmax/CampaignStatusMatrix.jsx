// Lapisan Detail campaign — MATRIKS STATUS MATERI per produk (pilihan user).
// Satu baris per produk: jumlah materi per status (bahasa GMV Max Pro + kode
// API) dgn ▲/▼ vs snapshot sebelumnya → mendeteksi arus masuk/keluar status.
// Klik angka sel → daftar video status itu. Data murni dari creatives snapshot
// harian yang sudah dimuat context (nol panggilan API baru).
import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowLeft } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { fmtRp, fmtRpC, fmtRoasX, DeltaBadge, tiktokVideoUrl } from './ui'

// Urutan kolom mengikuti siklus GMV Max Pro (mockup terpilih).
const COLS = [
  { key: 'DELIVERING', label: 'Tayang', code: 'DELIVERING', tone: 'text-emerald-400' },
  { key: 'LEARNING', label: 'Learning', code: 'LEARNING', tone: 'text-blue-300' },
  { key: 'IN_QUEUE', label: 'Antre', code: 'IN_QUEUE', tone: 'text-ink' },
  { key: 'NOT_DELIVERING', label: 'Tak tayang', code: 'NOT_DELIVERING', tone: 'text-ink-muted' },
  { key: 'AUTHORIZATION_NEEDED', label: 'Butuh izin', code: 'AUTH_NEEDED', tone: 'text-amber-400' },
  { key: 'EXCLUDED', label: 'Excluded', code: 'EXCLUDED', tone: 'text-ink-faint' },
]

function Delta({ d }) {
  if (!d) return <span className="text-ink-faint text-[10px]"> →</span>
  const up = d > 0
  return <span className={`text-[10px] font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}> {up ? '▲' : '▼'}{Math.abs(d)}</span>
}

export default function CampaignStatusMatrix({ campaign, onClose, inline = false }) {
  // campaign: { campaign_id, campaign_name }
  const { rows, productNames, prev } = useGmvMax()
  const [cell, setCell] = useState(null) // { productId, status } → daftar video

  const data = useMemo(() => {
    const cid = String(campaign?.campaign_id || '')
    const mine = rows.filter(r => r.creativeType === 'Video' && String(r.campaignId) === cid && r.snapshotDate)
    const dates = [...new Set(mine.map(r => r.snapshotDate))].sort()
    const d0 = dates[dates.length - 1] || null
    const d1 = dates[dates.length - 2] || null
    const cur = mine.filter(r => r.snapshotDate === d0)
    const prevRows = d1 ? mine.filter(r => r.snapshotDate === d1) : []

    const count = (list) => {
      const m = new Map() // productId → { status → n, total }
      for (const r of list) {
        const pid = r.productId || '(tanpa produk)'
        if (!m.has(pid)) m.set(pid, { total: 0 })
        const e = m.get(pid)
        e.total += 1
        e[r.status] = (e[r.status] || 0) + 1
      }
      return m
    }
    const curM = count(cur), prevM = count(prevRows)

    // PERFORMA per produk dlm campaign — akumulasi seluruh window, SEMUA tipe
    // creative (video + product card) agar spend/omset utuh.
    const mineAll = rows.filter(r => String(r.campaignId) === cid)
    const perfByPid = new Map()
    for (const r of mineAll) {
      const pid = r.productId || '(tanpa produk)'
      if (!perfByPid.has(pid)) perfByPid.set(pid, { cost: 0, revenue: 0, orders: 0 })
      const e = perfByPid.get(pid)
      e.cost += r.cost || 0; e.revenue += r.grossRevenue || 0; e.orders += r.skuOrders || 0
    }
    const totalSpend = [...perfByPid.values()].reduce((a, e) => a + e.cost, 0)
    // Pembanding periode: prev.products (sah dipakai per-campaign karena aturan
    // TikTok 1 produk = maks 1 campaign Product GMV Max).
    const prevByPid = new Map((prev?.products || []).map(pp => [pp.productId, pp]))

    const revByPid = new Map([...perfByPid.entries()].map(([k, v]) => [k, v.revenue]))
    // Urutan baris SAMA utk kedua tabel: revenue desc (union perf + matriks).
    const pids = [...new Set([...perfByPid.keys(), ...curM.keys()])]
      .sort((a, b) => (revByPid.get(b) || 0) - (revByPid.get(a) || 0))
    const items = pids.map(pid => {
      const c = curM.get(pid) || { total: 0 }
      const p = prevM.get(pid) || { total: 0 }
      return {
        pid,
        name: pid === '(tanpa produk)' ? '🛒 Product card — iklan kartu produk (gabungan)' : (productNames[pid] || `…${String(pid).slice(-8)}`),
        isCard: pid === '(tanpa produk)',
        total: c.total, dTotal: c.total - (p.total || 0),
        cols: COLS.map(col => ({ key: col.key, n: c[col.key] || 0, d: (c[col.key] || 0) - (p[col.key] || 0) })),
        revenue: revByPid.get(pid) || 0,
      }
    })

    // Insight sederhana dari arus: Tayang turun + Antre naik = supply macet;
    // Tayang naik = sehat. (Heuristik ringan — bukan pengganti skill.)
    const insights = []
    for (const it of items) {
      const g = (k) => it.cols.find(c => c.key === k) || { n: 0, d: 0 }
      if (g('DELIVERING').d < 0 && g('IN_QUEUE').d > 0) {
        insights.push(`⚠ ${it.name}: Tayang ${g('DELIVERING').n} (▼${Math.abs(g('DELIVERING').d)}) & Antre menumpuk (▲${g('IN_QUEUE').d}) — supply pemenang menipis${g('AUTHORIZATION_NEEDED').n ? `, cek Butuh izin (${g('AUTHORIZATION_NEEDED').n})` : ''}.`)
      } else if (g('DELIVERING').d > 0) {
        insights.push(`💡 ${it.name}: ${g('DELIVERING').d} video baru naik ke Tayang — sehat.`)
      }
    }

    const totalMateri = cur.length
    const cellVideos = cell
      ? cur.filter(r => (r.productId || '(tanpa produk)') === cell.productId && r.status === cell.status)
      : []
    const perf = pids.map(pid => {
      const e = perfByPid.get(pid) || { cost: 0, revenue: 0, orders: 0 }
      const pp = prevByPid.get(pid) || null
      return {
        pid,
        name: pid === '(tanpa produk)' ? '🛒 Product card — iklan kartu produk (gabungan)' : (productNames[pid] || `…${String(pid).slice(-8)}`),
        isCard: pid === '(tanpa produk)',
        cost: e.cost, revenue: e.revenue, orders: e.orders,
        roas: e.cost > 0 ? e.revenue / e.cost : null,
        cpo: e.orders > 0 ? e.cost / e.orders : null,
        share: totalSpend > 0 ? e.cost / totalSpend : 0,
        prev: pp ? { cost: pp.cost, revenue: pp.revenue, orders: pp.orders, roas: pp.roas, cpo: pp.cpo } : null,
      }
    })
    return { d0, d1, items, insights, totalMateri, cellVideos, perf, totalSpend }
  }, [rows, campaign, productNames, cell, prev])

  if (!campaign) return null

  const content = (
      <div onClick={(e) => e.stopPropagation()}
        className={inline
          ? 'bg-surface w-full rounded-2xl border border-line/10 shadow-sm p-5'
          : 'glass-modal w-full max-w-5xl rounded-2xl border border-line/15 shadow-2xl p-5 my-6'}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <button onClick={onClose} className="flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink mb-1">
              <ArrowLeft className="w-3 h-3" /> kembali
            </button>
            <h3 className="text-sm font-semibold text-ink-strong truncate">{campaign.campaign_name}</h3>
            <p className="text-[11px] text-ink-muted">
              Matriks status materi · {data.totalMateri} video · snapshot {data.d0 || '—'}
              {data.d1 ? <> · delta vs <span className="font-mono">{data.d1}</span></> : ' · belum ada pembanding'}
            </p>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1"><X className="w-4 h-4" /></button>
        </div>

        {/* ── PERFORMA PRODUK (Opsi 1: tabel bertumpuk, urutan baris = matriks) ── */}
        <p className="text-[10px] uppercase tracking-widest text-ink-faint font-semibold mb-1">
          Performa produk · periode terpilih{campaign.budget ? <> · budget campaign {fmtRp(Number(campaign.budget) || 0)}/hari</> : null}
        </p>
        <div className="overflow-x-auto mb-5">
          <table className="w-full text-[12px] min-w-[820px]">
            <thead>
              <tr className="text-left">
                <th className="py-2 pr-3 text-[10px] uppercase tracking-widest text-ink-faint font-semibold">Produk</th>
                <th className="py-2 px-2 text-right text-[10px] uppercase tracking-widest text-ink-faint font-semibold">Spend</th>
                <th className="py-2 px-2 text-right text-[10px] uppercase tracking-widest text-ink-faint font-semibold">Porsi spend</th>
                <th className="py-2 px-2 text-right text-[10px] uppercase tracking-widest text-ink-faint font-semibold">Omset</th>
                <th className="py-2 px-2 text-right text-[10px] uppercase tracking-widest text-ink-faint font-semibold">ROAS</th>
                <th className="py-2 px-2 text-right text-[10px] uppercase tracking-widest text-ink-faint font-semibold">Orders</th>
                <th className="py-2 pl-2 text-right text-[10px] uppercase tracking-widest text-ink-faint font-semibold">Cost/Order</th>
              </tr>
            </thead>
            <tbody>
              {data.perf.map(it => (
                <tr key={it.pid} className="border-t border-line/8">
                  <td className="py-2.5 pr-3 text-ink-strong font-medium max-w-[240px] truncate" title={String(it.pid)}>{it.name}</td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                    {fmtRpC(it.cost)}
                    {it.prev && <div className="text-[9px]"><DeltaBadge cur={it.cost} prev={it.prev.cost} fmt={fmtRpC} goodDown /></div>}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1.5 justify-end">
                      <div className="w-16 h-1.5 rounded-full bg-fill/10 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.round(it.share * 100)}%` }} />
                      </div>
                      <span className="font-mono tabular-nums text-[10px] text-ink-muted w-8 text-right">{Math.round(it.share * 100)}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-ink">
                    {fmtRpC(it.revenue)}
                    {it.prev && <div className="text-[9px]"><DeltaBadge cur={it.revenue} prev={it.prev.revenue} fmt={fmtRpC} /></div>}
                  </td>
                  <td className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold ${it.roas == null ? 'text-ink-faint' : it.roas >= 4 ? 'text-emerald-400' : it.roas >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                    {fmtRoasX(it.roas)}
                    {it.prev?.roas != null && it.roas != null && <div className="text-[9px] font-normal"><DeltaBadge cur={it.roas} prev={it.prev.roas} fmt={(v) => v.toFixed(2)} /></div>}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                    {(it.orders || 0).toLocaleString('id-ID')}
                    {it.prev && <div className="text-[9px]"><DeltaBadge cur={it.orders} prev={it.prev.orders} /></div>}
                  </td>
                  <td className="py-2.5 pl-2 text-right font-mono tabular-nums">
                    {it.cpo != null ? fmtRp(Math.round(it.cpo)) : '—'}
                    {it.prev?.cpo != null && it.cpo != null && <div className="text-[9px]"><DeltaBadge cur={it.cpo} prev={it.prev.cpo} fmt={(v) => fmtRp(Math.round(v))} goodDown /></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] uppercase tracking-widest text-ink-faint font-semibold mb-1">Matriks status materi</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[820px]">
            <thead>
              <tr className="text-left">
                <th className="py-2 pr-3 text-[10px] uppercase tracking-widest text-ink-faint font-semibold">Produk</th>
                <th className="py-2 px-2 text-right text-[10px] uppercase tracking-widest text-ink-faint font-semibold">Materi</th>
                {COLS.map(c => (
                  <th key={c.key} className="py-2 px-2 text-right text-[10px] uppercase tracking-widest text-ink-faint font-semibold">
                    {c.label}<br /><span className="text-[8px] normal-case tracking-normal">{c.code}</span>
                  </th>
                ))}
                <th className="py-2 pl-2 text-right text-[10px] uppercase tracking-widest text-ink-faint font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(it => (
                <tr key={it.pid} className="border-t border-line/8">
                  <td className="py-2.5 pr-3 text-ink-strong font-medium max-w-[240px] truncate" title={it.isCard ? 'Format iklan kartu produk — TikTok melaporkannya agregat per campaign, tanpa ikatan SPU' : String(it.pid)}>{it.name}</td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums">{it.isCard ? <span className="text-ink-faint">bukan video</span> : <>{it.total}<Delta d={it.dTotal} /></>}</td>
                  {it.cols.map((c, i) => (
                    <td key={c.key} className="py-2.5 px-2 text-right">
                      <button onClick={() => c.n > 0 && setCell({ productId: it.pid, status: c.key, label: COLS[i].label, name: it.name })}
                        className={`font-mono tabular-nums ${COLS[i].tone} ${c.n > 0 ? 'hover:underline' : 'opacity-40'}`}>
                        {c.n}
                      </button>
                      <Delta d={c.d} />
                    </td>
                  ))}
                  <td className="py-2.5 pl-2 text-right font-mono tabular-nums text-ink">{fmtRpC(it.revenue)}</td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr><td colSpan={COLS.length + 3} className="py-8 text-center text-xs text-ink-faint">
                  Belum ada materi video ter-snapshot untuk campaign ini di periode terpilih.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data.insights.length > 0 && (
          <div className="mt-3 rounded-xl bg-amber-500/8 border border-amber-500/20 px-3 py-2 space-y-0.5">
            {data.insights.slice(0, 4).map((t, i) => <p key={i} className="text-[11px] text-amber-200/90">{t}</p>)}
          </div>
        )}
        <p className="mt-2 text-[10px] text-ink-faint">Klik angka pada sel untuk melihat daftar videonya. Delta = perbandingan dua snapshot harian terakhir dalam periode.</p>

        {/* Daftar video utk sel terpilih */}
        {cell && (
          <div className="mt-3 rounded-xl border border-blue-500/25 bg-surface2 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-ink-strong">{cell.label} · {cell.name} · {data.cellVideos.length} video</p>
              <button onClick={() => setCell(null)} className="text-ink-faint hover:text-ink"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="max-h-56 overflow-auto space-y-1">
              {data.cellVideos.map(v => (
                <a key={v.videoId} href={tiktokVideoUrl(v.videoId, v.tiktokAccount) || '#'} target="_blank" rel="noreferrer"
                  className="block text-[11px] text-ink-muted hover:text-ink truncate">
                  @{v.tiktokAccount || '?'} · {String(v.videoTitle || v.videoId).slice(0, 90)}
                  {v.grossRevenue > 0 && <span className="text-emerald-400 font-mono"> · {fmtRpC(v.grossRevenue)}</span>}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
  )

  if (inline) return content
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-auto" onClick={onClose}>
      {content}
    </div>,
    document.body
  )
}
