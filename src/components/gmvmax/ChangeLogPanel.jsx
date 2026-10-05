// Riwayat "Perubahan setting" + DAMPAK tiap perubahan (5 Okt 2026, Opsi A + C
// dari artifact 31S6y74yfTVhMFSYSbWiRo). Tiap baris mendapat tiga angka
// sebelum → sesudah dan satu label keadaan; klik membuka lembar rinci.
// Hitungannya murni di utils/gmvmaxChangeImpact.js; bahan hariannya dari
// data/gmvmaxCampaignDaily.js (dimuat SETELAH daftar tampil, tak menahan halaman).
import { useEffect, useMemo, useState } from 'react'
import { History, ChevronRight } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { loadCampaignDaily } from '../../data/gmvmaxCampaignDaily'
import {
  planRows, mixedWith, computeImpact, impactVerdict, addDays, wibTime, WINDOW_DAYS,
} from '../../utils/gmvmaxChangeImpact'
import { fmtRp } from './ui'
import ChangeImpactDrawer from './ChangeImpactDrawer'
import { fmtHari, ringkas, pctLabel, roasLabel } from './changeImpactFormat'

const MAX_ROWS = 30
const CHIP = {
  good: 'bg-emerald-500/15 text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-400',
  mute: 'bg-fill/10 text-ink-muted',
}

// Badge delta untuk perubahan numerik: arah + selisih + persen.
// Naik budget = netral-biru (keputusan scale); turun = amber. Untuk Target ROAS
// dibalik: turun bid = melonggarkan (biru), naik = mengetatkan (amber).
function DeltaChange({ c }) {
  const a = Number(c.from), b = Number(c.to)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b || a === 0) return null
  const diff = b - a
  const pct = (diff / Math.abs(a)) * 100
  const up = diff > 0
  const tone = c.field === 'roas_bid'
    ? (up ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400')
    : (up ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400')
  const diffTxt = c.money ? fmtRp(Math.abs(Math.round(diff))) : String(Math.abs(Math.round(diff * 10) / 10))
  return (
    <span className={`ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums ${tone}`}>
      {up ? '▲' : '▼'} {diffTxt} ({pct > 0 ? '+' : ''}{pct.toFixed(pct % 1 === 0 ? 0 : 1)}%)
    </span>
  )
}

function Cell({ label, a, b, delta, deltaTone = 'text-ink-muted' }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-ink-faint uppercase tracking-wide truncate">{label}</p>
      <p className="text-xs font-semibold tabular-nums text-ink-strong whitespace-nowrap">
        {a} <span className="text-ink-faint font-normal">→</span> {b}
      </p>
      {delta && <p className={`text-[11px] font-semibold tabular-nums ${deltaTone}`}>{delta}</p>}
    </div>
  )
}

const tone = (p, goodUp = true) => (p == null || Math.abs(p) < 0.005 ? 'text-ink-muted'
  : (p > 0) === goodUp ? 'text-emerald-400' : 'text-red-400')

// Strip dampak di sisi kanan baris. `it` = { event, main, mixed, verdict }.
function ImpactStrip({ it, onOpen }) {
  const { event, main, mixed, verdict } = it
  const { before, after, delta, state } = main
  const budgetChanged = event.changes.some(c => c.field === 'budget')
  const toko = event.scope === 'store'

  if (state === 'WAITING') {
    return (
      <p className="text-xs text-ink-muted bg-fill/5 rounded-lg px-2.5 py-2">
        <span className="font-semibold text-ink">Menunggu data.</span>{' '}
        Hari penuh pertama {fmtHari(main.firstFullDay)}, angkanya masuk {fmtHari(main.firstArrives)} 07.30.
        {budgetChanged && before.budgetUse != null && ` Sebelum diubah, budget terserap ${pctLabel(before.budgetUse, false)}.`}
      </p>
    )
  }
  if (!delta) {
    return <p className="text-xs text-ink-faint bg-fill/5 rounded-lg px-2.5 py-2">Tidak ada snapshot di 7 hari sebelumnya, jadi belum ada pembanding.</p>
  }
  const campur = mixed[0]
  return (
    <button type="button" onClick={onOpen}
      className="w-full text-left rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-fill/5 transition-colors group">
      <div className="grid grid-cols-3 gap-2.5">
        <Cell label={toko ? 'Belanja toko / hari' : 'Belanja / hari'} a={ringkas(before.cost)} b={ringkas(after.cost)} delta={pctLabel(delta.cost)} />
        <Cell label={toko ? 'Omzet toko / hari' : 'Omzet / hari'} a={ringkas(before.revenue)} b={ringkas(after.revenue)}
          delta={pctLabel(delta.revenue)} deltaTone={tone(delta.revenue)} />
        <Cell label={toko ? 'ROAS toko' : 'ROAS'} a={roasLabel(before.roas)} b={roasLabel(after.roas)}
          delta={delta.roas != null ? `${delta.roas >= 0 ? '+' : '−'}${roasLabel(Math.abs(delta.roas))}` : null} deltaTone={tone(delta.roas)} />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mt-2 text-[11px] text-ink-muted">
        {/* Cakupan toko: geraknya milik seluruh toko, bukan campaign ini — netral & diberi awalan. */}
        <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${CHIP[toko ? 'mute' : verdict.tone]}`}>
          {toko ? `Toko: ${verdict.text.charAt(0).toLowerCase()}${verdict.text.slice(1)}` : verdict.text}
        </span>
        <span className="px-1.5 py-0.5 rounded border border-line/15 text-[10px] font-semibold">
          {state === 'FINAL' ? `Final · ${after.days} hari` : `${after.days} dari ${WINDOW_DAYS} hari`}
        </span>
        {campur && <span>Jendela {campur.side === 'before' ? 'sebelum' : 'sesudah'} memuat perubahan {fmtHari(campur.day)}</span>}
        {!campur && budgetChanged && before.budgetUse != null && <span>Budget lama terserap {pctLabel(before.budgetUse, false)}</span>}
        <span className="ml-auto inline-flex items-center gap-0.5 font-semibold text-blue-400 group-hover:text-blue-300">
          Lihat rincian <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </button>
  )
}

export default function ChangeLogPanel({ changes = [], history = [], settings = [], productNames = {} }) {
  const { imports } = useGmvMax()
  const [daily, setDaily] = useState(null)
  const [dailyErr, setDailyErr] = useState(false)
  const [openKey, setOpenKey] = useState(null)

  const fmtVal = (v, money) => (v == null || v === '' ? '—' : money ? fmtRp(Number(v)) : String(v))
  const { events, rows, from } = useMemo(() => planRows(changes, MAX_ROWS), [changes])
  const to = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (!from) return undefined
    let alive = true
    loadCampaignDaily({ from, to, imports })
      .then(d => { if (alive) { setDaily(d); setDailyErr(false) } })
      .catch(() => { if (alive) setDailyErr(true) })
    return () => { alive = false }
  }, [from, to, imports])

  // Budget & target per campaign per tanggal dari potret. Hari D memakai potret
  // D−1 (keadaan saat hari D dimulai); kalau tak ada, potret D itu sendiri.
  const lookup = useMemo(() => {
    const m = new Map()
    for (const r of history) {
      if (!m.has(r.campaign_id)) m.set(r.campaign_id, new Map())
      m.get(r.campaign_id).set(r.snapshot_date, r)
    }
    const at = (cid, date) => m.get(cid)?.get(addDays(date, -1)) || m.get(cid)?.get(date) || null
    return {
      budget: (cid, date) => at(cid, date)?.budget ?? null,
      bid: (cid, date) => at(cid, date)?.roas_bid ?? null,
    }
  }, [history])

  const impacts = useMemo(() => {
    const out = new Map()
    if (!daily) return out
    const base = { snapshotDates: daily.snapshotDates, lastDataDate: daily.lastDataDate }
    for (const e of events.values()) {
      if (e.scope === 'none' || (from && e.day < addDays(from, WINDOW_DAYS))) continue
      const store = computeImpact({ day: e.day, series: daily.store, ...base })
      const own = e.scope === 'campaign'
        ? computeImpact({ day: e.day, series: daily.byCampaign.get(e.campaign_id), ...base, budgetOf: (d) => lookup.budget(e.campaign_id, d) })
        : null
      const mixed = own ? mixedWith(e, events) : []
      const main = own || store
      out.set(e.key, { event: e, main, store, mixed, verdict: impactVerdict(main, mixed) })
    }
    return out
  }, [daily, events, lookup, from])

  const opened = openKey ? impacts.get(openKey) : null

  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-ink-strong mb-1 flex items-center gap-2">
        <History className="w-4 h-4 text-blue-400" /> Perubahan setting
      </h3>
      <p className="text-[11px] text-ink-faint mb-3">
        Terdeteksi dari perbandingan potret harian pukul 07.30 WIB; jam = perubahan terakhir campaign menurut TikTok.
        Dampak = rata-rata {WINDOW_DAYS} hari sebelum vs hari-hari penuh sesudahnya (hari perubahan dilewati) — urutan waktu, belum tentu sebab.
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-faint py-4 text-center">
          Belum ada perubahan terdeteksi. Riwayat mulai terkumpul sejak capture pertama — perubahan akan tampil di sini begitu budget/bid/status diubah.
        </p>
      ) : (
        <div>
          {rows.map(({ c, e, first }, i) => {
            const it = impacts.get(e.key)
            return (
              <div key={i} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-6 gap-y-2 py-2.5 border-b border-line/5 last:border-0 items-start">
                <div className="flex items-start gap-2.5 text-sm min-w-0">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 mt-0.5">auto</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">
                      {c.label} <span className="text-ink-faint">{fmtVal(c.from, c.money)}</span>
                      <span className="text-ink-faint"> → </span>
                      <span className="font-semibold text-ink-strong">{fmtVal(c.to, c.money)}</span>
                      <DeltaChange c={c} />
                      <span className="text-ink-faint"> · {c.campaign_name}</span>
                    </p>
                    {/* Produk: diffSettings sudah menghitung `added`/`removed` sejak
                        hari pertama, tapi kartunya cuma menampilkan jumlah ("2 produk
                        → 3 produk") — sehingga "produk mana" harus ditebak sendiri. */}
                    {(c.added?.length || c.removed?.length) ? (
                      <p className="text-[11px] mt-0.5 leading-relaxed">
                        {c.added?.map(pid => (
                          <span key={`a${pid}`} className="text-emerald-400 mr-2" title={String(pid)}>
                            + {productNames[pid] || `…${String(pid).slice(-8)}`}
                          </span>
                        ))}
                        {c.removed?.map(pid => (
                          <span key={`r${pid}`} className="text-red-400 mr-2" title={String(pid)}>
                            − {productNames[pid] || `…${String(pid).slice(-8)}`}
                          </span>
                        ))}
                      </p>
                    ) : null}
                    <p className="text-[10px] text-ink-faint tabular-nums" title={`Terlihat di potret ${c.date}`}>
                      {fmtHari(e.day, true)}{e.modify_time ? ` · ${wibTime(e.modify_time)}` : ''}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 lg:pl-0 pl-[42px]">
                  {e.scope === 'none' ? null
                    : !first ? <p className="text-[11px] text-ink-faint">Diukur bersama perubahan di atasnya (hari yang sama).</p>
                      : it ? <ImpactStrip it={it} onOpen={() => setOpenKey(e.key)} />
                        : dailyErr ? <p className="text-[11px] text-ink-faint">Dampak belum bisa dimuat.</p>
                          : <p className="text-[11px] text-ink-faint">Menghitung dampak…</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {opened && (
        <ChangeImpactDrawer
          it={opened} daily={daily} lookup={lookup} productNames={productNames}
          promotionType={settings.find(s => s.campaign_id === opened.event.campaign_id)?.promotion_type || null}
          onClose={() => setOpenKey(null)} />
      )}
    </div>
  )
}
