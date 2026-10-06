// POLA BOOST (Tahap 3) — boost yang sudah dijalankan, dikelompokkan menurut
// keadaan videonya seminggu SEBELUM di-boost, dengan hasil 7 hari pertamanya.
// Jawaban untuk "video seperti apa yang layak di-boost lagi?".
//
// Hanya tampilan: logikanya di utils/gmvmaxBoostPatterns.js, datanya (angka +
// status harian tiap video) sudah dimuat daftar eksperimen — tidak ada bacaan
// tambahan di sini. Klik kelompok → daftar boost-nya; klik boost → drawer.
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import StatusChip from './StatusChip'
import { CONCLUSION_LABEL } from '../../data/gmvmaxExperiments'
import { MIN_JUDGED, MIN_POST_DAYS } from '../../utils/gmvmaxBoostPatterns'
import { fmtDayID } from '../../utils/gmvmaxExperimentDaily'
import { fmtFloorID, fmtRoiID, fmtRoiVsFloorID, fmtRpRbID } from '../../utils/gmvmaxExperimentFormat'

const OUT_TONE = { above: 'text-emerald-400', below: 'text-red-400', wait: 'text-ink-muted' }

export default function BoostPatternPanel({ patterns, cfg, productNames, ocById, onOpen }) {
  const [open, setOpen] = useState(null) // kunci kelompok yang dibuka
  const [hidden, setHidden] = useState(false)
  if (!patterns || patterns.total === 0) return null
  const { groups, total, judged, above, hasFloor, enough } = patterns
  const floor = cfg.roiFloor
  const cur = groups.find(g => g.key === open) || null

  return (
    <section className="rounded-xl border border-line/15 bg-surface p-3.5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold text-ink-strong">Pola dari boost sebelumnya</h4>
          <p className="text-[11px] text-ink-faint mt-0.5">
            {total} boost video, dikelompokkan menurut keadaan videonya 7 hari sebelum di-boost.
            {hasFloor && enough && ` ${above} dari ${judged} yang sudah bisa dinilai berada di atas ambang ${fmtFloorID(floor)} pada 7 hari pertamanya.`}
          </p>
        </div>
        <button onClick={() => setHidden(v => !v)} className="text-[11px] text-ink-muted hover:text-ink">{hidden ? 'tampilkan' : 'sembunyikan'}</button>
      </div>

      {!hidden && !hasFloor && (
        <p className="mt-3 text-xs text-amber-400">Isi "Ambang ROI vonis" di atas supaya boost bisa dipilah menjadi di atas / di bawah ambang.</p>
      )}
      {!hidden && hasFloor && !enough && (
        <p className="mt-3 text-xs text-ink-muted">
          Baru {judged} boost yang bisa dinilai — pola baru ditampilkan setelah ada minimal {MIN_JUDGED}, supaya tidak menyimpulkan dari satu-dua kejadian.
        </p>
      )}

      {!hidden && hasFloor && enough && (
        <>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {groups.map(g => {
              const on = g.key === open
              const pct = g.judged > 0 ? Math.round((g.above / g.judged) * 100) : 0
              return (
                <button key={g.key} type="button" onClick={() => setOpen(on ? null : g.key)} aria-expanded={on}
                  className={`text-left rounded-lg border p-3 transition-colors ${on ? 'border-accent/60 bg-accent/[0.08]' : 'border-line/15 bg-fill/[0.03] hover:border-line/30'}`}>
                  <p className="text-[11px] text-ink-muted flex items-center gap-1">
                    {on ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{g.label}
                  </p>
                  {g.judged > 0 ? (
                    <>
                      <p className="mt-1 text-lg leading-6 font-semibold text-ink-strong tabular-nums">{g.above} dari {g.judged}</p>
                      <div className="h-1.5 rounded-full bg-line/15 overflow-hidden my-1.5" role="img" aria-label={`${pct}% di atas ambang`}>
                        <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[11px] text-ink-muted">
                        di atas ambang{g.medianRoi != null && ` · ROI tengah ${fmtRoiID(g.medianRoi)}`}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-ink-muted">{g.n} boost · belum ada yang bisa dinilai</p>
                  )}
                  {g.note && <p className="mt-1.5 text-[11px] text-ink-faint">{g.note}</p>}
                </button>
              )
            })}
          </div>

          {cur && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-ink-faint">
                    <th className="font-semibold py-1.5 px-1 text-left">Boost · status sebelum</th>
                    <th className="font-semibold py-1.5 px-1 text-right">Belanja 7 hr sebelum</th>
                    <th className="font-semibold py-1.5 px-1 text-right">ROI sebelum → 7 hr</th>
                    <th className="font-semibold py-1.5 px-1 text-right">Belanja 7 hr</th>
                    <th className="font-semibold py-1.5 px-1 text-left pl-3">Vonis</th>
                  </tr>
                </thead>
                <tbody>
                  {cur.rows.map(p => {
                    const pid = p.exp.product_id ? String(p.exp.product_id).trim() : null
                    const oc = ocById?.get(p.id)
                    return (
                      <tr key={p.id} onClick={() => onOpen?.(p.exp)} role="button" tabIndex={0}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') onOpen?.(p.exp) }}
                        className="border-t border-line/10 text-ink cursor-pointer hover:bg-fill/[0.04]">
                        <td className="py-1.5 px-1 text-left">
                          <span className="tabular-nums">{fmtDayID(p.day1)}</span>{' '}
                          {p.preStatus ? <StatusChip status={p.preStatus} /> : <span className="text-ink-faint">tak terekam</span>}
                          {pid && <div className="text-[10.5px] text-ink-faint truncate max-w-[16rem]">{productNames?.[pid] || `produk ${pid}`}</div>}
                        </td>
                        <td className="py-1.5 px-1 text-right tabular-nums align-top">{p.pre.days > 0 ? fmtRpRbID(p.pre.spend) : '—'}</td>
                        <td className="py-1.5 px-1 text-right tabular-nums align-top">
                          <span className="text-ink-muted">{p.preRoiShown != null ? fmtRoiID(p.preRoiShown) : '—'}</span>
                          <span className="text-ink-faint"> → </span>
                          <b className={`font-semibold ${OUT_TONE[p.outcome]}`}>{p.post.roi != null ? fmtRoiVsFloorID(p.post.roi, floor) : '—'}</b>
                          {p.outcome === 'wait' && <div className="text-[10.5px] text-ink-faint">{p.post.days < MIN_POST_DAYS ? `baru ${p.post.days} hari data` : 'belanja di bawah lantai'}</div>}
                          {p.outcome !== 'wait' && !p.complete && <div className="text-[10.5px] text-ink-faint">baru {p.post.days} dari 7 hari</div>}
                        </td>
                        <td className="py-1.5 px-1 text-right tabular-nums align-top">{fmtRpRbID(p.post.spend)}</td>
                        <td className="py-1.5 px-1 pl-3 text-left align-top text-ink-muted">{oc ? `${CONCLUSION_LABEL[oc.conclusion] || oc.conclusion}${oc.provisional && oc.format === 'v2' ? ' · sementara' : ''}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-[11px] text-ink-faint">
            Angka = seluruh penayangan video itu di GMV Max (semua campaign), bukan khusus sesi boost-nya. "ROI sebelum" hanya ditulis bila belanja 7 hari sebelumnya mencapai lantai belanja {fmtRpRbID(cfg.spendFloor)}. Hasil dihitung setelah ada minimal {MIN_POST_DAYS} hari data. Ini pola dari {judged} boost — petunjuk, belum kepastian.
          </p>
        </>
      )}
    </section>
  )
}
