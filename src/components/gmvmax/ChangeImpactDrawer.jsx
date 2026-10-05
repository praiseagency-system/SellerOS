// Lembar rinci dampak SATU perubahan setting (Opsi C; grafik bergaris budget
// dari Opsi B ada di dalamnya). Bentuknya mengikuti ExperimentDetailDrawer.
// Murni tampilan: semua angka sudah dihitung pemanggil (ChangeLogPanel).
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { addDays, wibTime, pctChange, impactSentence, WINDOW_DAYS } from '../../utils/gmvmaxChangeImpact'
import { fmtRp } from './ui'
import { fmtHari, fmtRentang, ringkas, pctLabel, roasLabel, angka1, niceMax } from './changeImpactFormat'

const naikBaik = (p) => (p == null || Math.abs(p) < 0.005 ? 'text-ink-muted' : p > 0 ? 'text-emerald-400' : 'text-red-400')
const turunBaik = (p) => (p == null || Math.abs(p) < 0.005 ? 'text-ink-muted' : p < 0 ? 'text-emerald-400' : 'text-red-400')

// Batang belanja + garis budget (atas) dan batang omzet + rata-rata sebelum &
// sesudah (bawah), satu sumbu waktu: 7 hari sebelum · hari perubahan · 7 hari
// sesudah. Hari tanpa snapshot dikosongkan, bukan digambar nol.
function ImpactChart({ day, series, snapshotDates, lastDataDate, budgetOf, before, after, others }) {
  const dates = Array.from({ length: WINDOW_DAYS * 2 + 1 }, (_, i) => addDays(day, i - WINDOW_DAYS))
  const STEP = 33, L = 42, BW = 16 // 15 hari muat di lembar 600px tanpa gulir samping
  const W = L + dates.length * STEP + 4
  const T1 = 26, B1 = 112, T2 = 142, B2 = 222, H = 250
  const has = (d) => snapshotDates.has(d) && (!lastDataDate || d <= lastDataDate)
  const row = (d) => (has(d) ? series?.get(d) || { cost: 0, revenue: 0 } : null)
  const budgets = dates.map(d => (budgetOf ? Number(budgetOf(d)) || null : null))
  const maxSpend = niceMax(Math.max(1, ...dates.map(d => row(d)?.cost || 0), ...budgets.map(b => b || 0)))
  const maxRev = niceMax(Math.max(1, ...dates.map(d => row(d)?.revenue || 0)))
  const y1 = (v) => B1 - (v / maxSpend) * (B1 - T1)
  const y2 = (v) => B2 - (v / maxRev) * (B2 - T2)
  const x = (i) => L + i * STEP
  const iDay = WINDOW_DAYS
  // Garis budget = anak tangga; putus di hari yang budgetnya tak diketahui.
  let path = ''
  budgets.forEach((b, i) => {
    if (b == null) return
    const cont = i > 0 && budgets[i - 1] != null
    path += `${cont ? 'L' : 'M'}${x(i) + 3} ${y1(b)}L${x(i) + STEP - 3} ${y1(b)}`
  })
  const lastAfter = dates.findLastIndex((d, i) => i > iDay && has(d))
  const otherIdx = (others || []).map(o => dates.indexOf(o.day)).filter(i => i >= 0)
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block">
        {/* zona: sebelum · hari perubahan · sesudah */}
        <rect x={x(0)} y={T1 - 10} width={STEP * WINDOW_DAYS - 3} height={B2 - T1 + 10} rx="4" fill="currentColor" className="text-line/5" />
        <rect x={x(iDay)} y={T1 - 10} width={STEP - 3} height={B2 - T1 + 10} rx="4" fill="rgb(251 191 36)" opacity="0.12" />
        {lastAfter > iDay && <rect x={x(iDay + 1)} y={T1 - 10} width={(lastAfter - iDay) * STEP - 3} height={B2 - T1 + 10} rx="4" fill="currentColor" className="text-accent" opacity="0.08" />}

        {[[0, y1, maxSpend], [1, y2, maxRev]].map(([k, y, max]) => (
          <g key={k}>
            <line x1={L} x2={W - 4} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-line/15" />
            <line x1={L} x2={W - 4} y1={y(max)} y2={y(max)} stroke="currentColor" className="text-line/10" strokeDasharray="2 3" />
            <text x={L - 6} y={y(0) + 3} textAnchor="end" fontSize="8.5" fill="currentColor" className="text-ink-faint">0</text>
            <text x={L - 6} y={y(max) + 3} textAnchor="end" fontSize="8.5" fill="currentColor" className="text-ink-faint">{ringkas(max)}</text>
          </g>
        ))}
        <text x={L} y={11} fontSize="9" fontWeight="600" fill="currentColor" className="text-ink-muted">BELANJA / HARI{path ? ' · garis = budget' : ''}</text>
        <text x={L} y={T2 - 8} fontSize="9" fontWeight="600" fill="currentColor" className="text-ink-muted">OMZET / HARI · garis = rata-rata</text>

        {dates.map((d, i) => {
          const r = row(d)
          const cx = x(i) + (STEP - 3) / 2
          return (
            <g key={d}>
              {r && (
                <>
                  <title>{`${fmtHari(d)}\nBelanja ${fmtRp(r.cost)} · Omzet ${fmtRp(r.revenue)}${budgets[i] ? ` · Budget ${fmtRp(budgets[i])}` : ''}`}</title>
                  <rect x={cx - BW / 2} width={BW} y={y1(r.cost)} height={B1 - y1(r.cost)} rx="1.5" fill="currentColor" className="text-blue-500" opacity={i === iDay ? 0.4 : 0.9} />
                  <rect x={cx - BW / 2} width={BW} y={y2(r.revenue)} height={B2 - y2(r.revenue)} rx="1.5" fill="currentColor" className="text-emerald-500" opacity={i === iDay ? 0.4 : 0.9} />
                </>
              )}
              {!r && d <= (lastDataDate || d) && (
                <text x={cx} y={B2 - 4} textAnchor="middle" fontSize="8.5" fill="currentColor" className="text-ink-faint"><title>{`${fmtHari(d)} — tanpa snapshot`}</title>×</text>
              )}
              <text x={cx} y={B2 + 13} textAnchor="middle" fontSize="8.5" fill="currentColor" className={i === iDay ? 'text-amber-400' : 'text-ink-faint'} fontWeight={i === iDay ? 700 : 400}>{+d.slice(8)}</text>
            </g>
          )
        })}
        <text x={x(iDay) + (STEP - 3) / 2} y={B2 + 24} textAnchor="middle" fontSize="8" fill="rgb(251 191 36)">diubah</text>
        {/* Perubahan LAIN di jendela ukur (→ tercampur): titik di bawah tanggalnya. */}
        {otherIdx.map(i => (
          <g key={i}>
            <title>{`Perubahan lain pada campaign ini — ${fmtHari(dates[i])}`}</title>
            <circle cx={x(i) + (STEP - 3) / 2} cy={B2 + 21} r="2.5" fill="rgb(251 191 36)" />
          </g>
        ))}

        {path && <path d={path} fill="none" stroke="rgb(251 191 36)" strokeWidth="1.75" strokeLinejoin="round" />}
        {before?.days > 0 && <line x1={x(0) + 2} x2={x(iDay) - 5} y1={y2(before.revenue)} y2={y2(before.revenue)} stroke="currentColor" className="text-ink-muted" strokeWidth="1.25" strokeDasharray="5 4" />}
        {after?.days > 0 && lastAfter > iDay && <line x1={x(iDay + 1) + 2} x2={x(lastAfter + 1) - 5} y1={y2(after.revenue)} y2={y2(after.revenue)} stroke="currentColor" className="text-accent" strokeWidth="1.75" />}
      </svg>
    </div>
  )
}

function Mini({ label, a, b, pct, toneCls = 'text-ink-muted' }) {
  return (
    <div className="rounded-lg border border-line/10 bg-fill/5 px-3 py-2 min-w-0">
      <p className="text-[11px] text-ink-muted truncate">{label}</p>
      <p className="text-xs font-semibold tabular-nums text-ink-strong whitespace-nowrap">
        {a} <span className="text-ink-faint font-normal">→</span> {b}
      </p>
      {pct && <p className={`text-[11px] font-semibold tabular-nums ${toneCls}`}>{pct}</p>}
    </div>
  )
}

export default function ChangeImpactDrawer({ it, daily, lookup, productNames = {}, promotionType = null, onClose }) {
  const { event, main, store, mixed } = it
  const { before, after, delta, state } = main
  const toko = event.scope === 'store'
  const live = /LIVE/i.test(promotionType || '')

  useEffect(() => {
    const onKey = (ev) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fmtVal = (v, money) => (v == null || v === '' ? '—' : money ? fmtRp(Number(v)) : String(v))
  const bidChange = event.changes.find(c => c.field === 'roas_bid')
  const bidNow = lookup.bid(event.campaign_id, addDays(event.day, 1))
  const targetNote = bidChange ? `target ${bidChange.from} → ${bidChange.to}` : bidNow != null ? `target ${bidNow}` : null
  const bStart = addDays(event.day, -WINDOW_DAYS), bEnd = addDays(event.day, -1)
  const aStart = addDays(event.day, 1)
  const aEnd = daily.lastDataDate && daily.lastDataDate < addDays(event.day, WINDOW_DAYS) ? daily.lastDataDate : addDays(event.day, WINDOW_DAYS)
  const kalimat = impactSentence(main, { scope: event.scope })
  const series = toko ? daily.store : daily.byCampaign.get(event.campaign_id)
  const sd = store?.delta

  const baris = delta ? [
    ['Belanja', fmtRp(before.cost), fmtRp(after.cost), pctLabel(delta.cost), 'text-ink-muted'],
    ['Omzet', fmtRp(before.revenue), fmtRp(after.revenue), pctLabel(delta.revenue), naikBaik(delta.revenue)],
    ['Order', angka1(before.orders), angka1(after.orders), pctLabel(delta.orders), naikBaik(delta.orders)],
    ['ROAS', roasLabel(before.roas), roasLabel(after.roas),
      delta.roas != null ? `${delta.roas >= 0 ? '+' : '−'}${roasLabel(Math.abs(delta.roas))}` : null, naikBaik(delta.roas), !toko && targetNote],
    ['Biaya per order', before.cpo != null ? fmtRp(before.cpo) : '—', after.cpo != null ? fmtRp(after.cpo) : '—', pctLabel(delta.cpo), turunBaik(delta.cpo)],
    ...(!toko && (before.budgetUse != null || after.budgetUse != null) ? [[
      'Serapan budget', pctLabel(before.budgetUse, false) || '—', pctLabel(after.budgetUse, false) || '—',
      delta.budgetUse != null ? `${delta.budgetUse >= 0 ? '+' : '−'}${Math.abs(delta.budgetUse * 100).toFixed(0)} poin` : null, 'text-ink-muted',
      before.budget != null && after.budget != null
        ? (Math.round(before.budget) === Math.round(after.budget) ? `dari ${fmtRp(after.budget)}` : `dari ${fmtRp(before.budget)} → ${fmtRp(after.budget)}`)
        : null,
    ]] : []),
  ] : []

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="glass-modal absolute right-0 top-0 h-full w-[600px] max-w-[94vw] border-l border-line/15 overflow-y-auto p-5 space-y-4">
        <button onClick={onClose} className="absolute top-4 right-4 text-ink-faint hover:text-ink" aria-label="Tutup">
          <X className="w-4 h-4" />
        </button>

        <div className="pr-8">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Dampak perubahan · {event.campaign_name}</p>
          <div className="mt-1.5 space-y-0.5">
            {event.changes.map((c, i) => (
              <p key={i} className="text-[15px] font-semibold text-ink-strong">
                {c.label} <span className="text-ink-faint font-medium">{fmtVal(c.from, c.money)}</span>
                <span className="text-ink-faint"> → </span>{fmtVal(c.to, c.money)}
                {(c.added?.length || c.removed?.length) ? (
                  <span className="block text-[11px] font-normal mt-0.5">
                    {c.added?.map(pid => <span key={`a${pid}`} className="text-emerald-400 mr-2">+ {productNames[pid] || `…${String(pid).slice(-8)}`}</span>)}
                    {c.removed?.map(pid => <span key={`r${pid}`} className="text-red-400 mr-2">− {productNames[pid] || `…${String(pid).slice(-8)}`}</span>)}
                  </span>
                ) : null}
              </p>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2 text-xs text-ink-muted">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-line/15">
              {state === 'WAITING' ? 'Menunggu data' : state === 'FINAL' ? `Final · ${after.days} hari` : `Sementara · ${after.days} dari ${WINDOW_DAYS} hari`}
            </span>
            <span>
              {event.modify_time
                ? `Diubah ${fmtHari(event.day, true)} pukul ${wibTime(event.modify_time)} WIB`
                : `Terlihat berubah pada potret ${fmtHari(event.day, true)}`}
            </span>
          </div>
        </div>

        {toko && (
          <p className="text-xs text-ink-muted bg-fill/5 rounded-lg px-3 py-2">
            Status campaign berubah, jadi yang diukur adalah <span className="font-semibold text-ink">seluruh toko</span>. Angka toko ikut dipengaruhi perubahan lain di periode yang sama.
          </p>
        )}
        {mixed.length > 0 && (
          <p className="text-xs text-ink bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <span className="font-semibold text-amber-500">Tercampur.</span> Ada perubahan lain pada campaign ini di dalam jendela ukur:{' '}
            {mixed.map(m => `${m.labels.join(' + ')} (${fmtHari(m.day)})`).join(', ')}. Angkanya tetap ditampilkan, kesimpulannya ditahan.
          </p>
        )}
        {kalimat && mixed.length === 0 && <p className="text-sm leading-relaxed text-ink bg-fill/5 rounded-lg px-3 py-2.5">{kalimat}</p>}
        {state === 'WAITING' && (
          <p className="text-sm text-ink-muted bg-fill/5 rounded-lg px-3 py-2.5">
            Belum ada hari penuh sesudah perubahan. Hari pertama {fmtHari(main.firstFullDay)}, angkanya masuk {fmtHari(main.firstArrives)} pukul 07.30.
          </p>
        )}

        {baris.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
                  <th className="text-left font-semibold pb-2">{toko ? 'Toko, rata-rata per hari' : 'Rata-rata per hari'}</th>
                  <th className="text-right font-semibold pb-2 pl-3 whitespace-nowrap">Sebelum<br /><span className="normal-case tracking-normal font-normal">{fmtRentang(bStart, bEnd)} · {before.days} hari</span></th>
                  <th className="text-right font-semibold pb-2 pl-3 whitespace-nowrap">Sesudah<br /><span className="normal-case tracking-normal font-normal">{fmtRentang(aStart, aEnd)} · {after.days} hari</span></th>
                  <th className="text-right font-semibold pb-2 pl-3">Selisih</th>
                </tr>
              </thead>
              <tbody>
                {baris.map(([nama, a, b, d, cls, catatan]) => (
                  <tr key={nama} className="border-t border-line/10">
                    <td className="py-2 text-ink-muted">{nama}{catatan && <span className="block text-[10px] text-ink-faint">{catatan}</span>}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-ink whitespace-nowrap">{a}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-ink-strong font-semibold whitespace-nowrap">{b}</td>
                    <td className={`py-2 pl-3 text-right tabular-nums font-semibold whitespace-nowrap ${cls}`}>{d || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ImpactChart day={event.day} series={series} snapshotDates={daily.snapshotDates} lastDataDate={daily.lastDataDate}
          budgetOf={toko ? null : (d) => lookup.budget(event.campaign_id, d)} before={before} after={after} others={mixed} />

        {delta && !toko && !live && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint mb-1.5">Ke mana belanja pergi (per hari)</p>
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Video" a={ringkas(before.videoCost)} b={ringkas(after.videoCost)} pct={pctLabel(pctChange(before.videoCost, after.videoCost))} />
              <Mini label="Kartu produk" a={ringkas(before.cardCost)} b={ringkas(after.cardCost)} pct={pctLabel(pctChange(before.cardCost, after.cardCost))} />
            </div>
          </div>
        )}

        {sd && !toko && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint mb-1.5">Toko di periode yang sama (per hari)</p>
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Omzet toko" a={ringkas(store.before.revenue)} b={ringkas(store.after.revenue)} pct={pctLabel(sd.revenue)} toneCls={naikBaik(sd.revenue)} />
              <Mini label="Belanja toko" a={ringkas(store.before.cost)} b={ringkas(store.after.cost)} pct={pctLabel(sd.cost)} />
            </div>
          </div>
        )}

        <ul className="text-[11px] text-ink-faint list-disc pl-4 space-y-1">
          <li>{fmtHari(event.day)} tidak dihitung: sebagian harinya masih memakai setting lama.</li>
          {(before.missing > 0 || after.missing > 0) && (
            <li>{(before.missing || 0) + (after.missing || 0)} hari tanpa snapshot dilewati, tidak dihitung nol.</li>
          )}
          {state === 'PARTIAL' && <li>Angka masih sementara. Jendela penuh {WINDOW_DAYS} hari selesai {fmtHari(addDays(event.day, WINDOW_DAYS + 1))} pukul 07.30.</li>}
          {!toko && mixed.length === 0 && <li>Tidak ada perubahan setting lain pada campaign ini di dalam jendela ukur.</li>}
          <li>Ini urutan waktu, belum tentu sebab. Pembanding toko membantu membacanya, tidak membuktikannya.</li>
        </ul>
      </aside>
    </div>,
    document.body,
  )
}
