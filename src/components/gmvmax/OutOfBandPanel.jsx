// AKSI DI LUAR APLIKASI — apa yang dikerjakan langsung di Seller Centre / Ads
// Manager, bukan lewat tombol persetujuan (🔔).
//
// Sebelum panel ini, aksi begitu tidak punya layar sama sekali: potretnya masuk
// DB tiap pagi tapi tak pernah dibaca siapa pun, sehingga boost yang dijalankan
// sendiri terlihat seperti video biasa yang tiba-tiba dapat belanja.
//
// Read-only. Dua sumbernya potret harian worker (07:30 WIB):
//   · gmvmax_boost_sessions   → Creative Boost & Max Delivery
//   · gmvmax_campaign_settings → budget/target ROAS/status/produk (dibandingkan
//                                antar-hari lewat diffSettings)
import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FlaskConical, Radio } from 'lucide-react'
import { TableScroll, usePaged, Pager } from '../ui/DataTable'
import { EmptyState, SectionTitle, fmtRp, tiktokVideoUrl } from './ui'
import { loadBoostSessions } from '../../data/gmvmaxBoostSessions'
import { loadCampaignSettingsHistory } from '../../data/gmvmaxCampaignSettings'
import { listExperiments, CONCLUSION_LABEL } from '../../data/gmvmaxExperiments'
import { diffSettings } from '../../gmvmax/campaignSettings.mjs'

const NEAR_MS = 6 * 3600 * 1000
const JENIS = { CREATIVE_NO_BID: 'Creative Boost', NO_BID: 'Max Delivery' }

const fmtWib = (iso) => (iso
  ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB'
  : '—')
const fmtTgl = (ymd) => (ymd
  ? new Date(ymd + 'T12:00:00Z').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
  : '—')

const CONC_TONE = {
  SUSTAINABLE_WINNER: 'text-emerald-400', WINNER_CANDIDATE: 'text-emerald-400',
  TEMPORARY_SPIKE: 'text-amber-400', WEAK: 'text-red-400',
}

// Sesi yang subjeknya diketahui → bisa jadi eksperimen. Creative Boost bekerja
// pada satu video (butuh item_id); Max Delivery bekerja pada campaign.
const terukur = (s) => (s.bid_type === 'CREATIVE_NO_BID' ? !!s.item_id : !!s.campaign_id)

// Eksperimen milik sebuah sesi. source_session_id baru ada setelah migrasi 0057;
// sebelum itu dicocokkan lewat subjek + kedekatan waktu mulai — kunci yang sama
// dipakai pembuka eksperimen di worker, jadi keduanya tak mungkin berbeda pendapat.
function matchExperiment(exps, s) {
  const startMs = Date.parse(s.schedule_start_time)
  return (exps || []).find(e => {
    if (e.source_session_id) return e.source_session_id === s.session_id
    const subjekSama = s.item_id
      ? e.creative_video_id === s.item_id
      : (!e.creative_video_id && e.campaign_id === s.campaign_id)
    if (!subjekSama) return false
    const t = Date.parse(e.start_at)
    return Number.isFinite(t) && Number.isFinite(startMs) && Math.abs(t - startMs) <= NEAR_MS
  }) || null
}

export default function OutOfBandPanel() {
  const [state, setState] = useState({ loading: true, sessions: [], changes: [], exps: [], lastSnapshot: null })

  useEffect(() => {
    let alive = true
    Promise.all([
      loadBoostSessions({ days: 60 }),
      // 90 hari, bukan 30: potret setelan sudah terkumpul sejak 22 Jun 2026, dan
      // riwayat lama itu satu-satunya jejak perubahan yang dikerjakan di luar
      // aplikasi jauh sebelum potret sesi boost ada (baru mulai 28 Agu 2026).
      loadCampaignSettingsHistory({ days: 90 }).catch(() => []),
      listExperiments().then(r => r.rows).catch(() => []),
    ]).then(([sessions, settings, exps]) => {
      if (!alive) return
      // Perubahan setelan = selisih antara dua potret berurutan. Tanggalnya =
      // tanggal potret KEDUA, jadi "terlihat berubah pada hari itu" — bukan klaim
      // jam berapa persisnya diubah, yang memang tak kita ketahui.
      const byDate = new Map()
      for (const r of settings) {
        if (!byDate.has(r.snapshot_date)) byDate.set(r.snapshot_date, [])
        byDate.get(r.snapshot_date).push(r)
      }
      const dates = [...byDate.keys()].sort()
      const changes = []
      for (let i = 1; i < dates.length; i++) {
        for (const ch of diffSettings(byDate.get(dates[i - 1]), byDate.get(dates[i]))) {
          changes.push({ ...ch, date: dates[i] })
        }
      }
      changes.sort((a, b) => b.date.localeCompare(a.date))
      setState({
        loading: false, sessions, changes, exps,
        lastSnapshot: sessions.reduce((m, s) => (!m || s.last_seen > m ? s.last_seen : m), null),
      })
    }).catch(e => { if (alive) setState({ loading: false, error: e.message, sessions: [], changes: [], exps: [] }) })
    return () => { alive = false }
  }, [])

  // Hook paginasi WAJIB di atas early-return (aturan React) — datanya boleh kosong.
  const pgS = usePaged(state.sessions)
  const pgC = usePaged(state.changes)

  const aktif = useMemo(
    () => state.sessions.filter(s => state.lastSnapshot && s.last_seen === state.lastSnapshot).length,
    [state.sessions, state.lastSnapshot])

  if (state.loading) return <p className="text-sm text-ink-muted py-10 text-center">Memuat aksi di luar aplikasi…</p>
  if (state.error) return <EmptyState title="Gagal memuat" desc={state.error} />

  const kosong = !state.sessions.length && !state.changes.length

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line/40 bg-fill/5 p-3">
        <p className="text-xs text-ink-muted leading-relaxed">
          Aksi yang dikerjakan langsung di <b className="text-ink-strong">Seller Centre / Ads Manager</b> tidak
          melewati tombol persetujuan, jadi tak tercatat sebagai keputusan aplikasi. Yang terlihat di sini adalah
          jejaknya pada potret harian <b className="text-ink-strong">07:30 WIB</b>.
          {' '}Konsekuensinya jujur: sesi yang mulai <i>dan</i> berakhir di antara dua potret bisa lolos tanpa
          jejak, dan tanggal perubahan setelan adalah tanggal <i>terlihatnya</i>, bukan jam persisnya diubah.
        </p>
      </div>

      {kosong && (
        <EmptyState
          title="Belum ada aksi luar yang terpotret"
          desc="Boost atau perubahan setelan yang kamu jalankan di Seller Centre akan muncul di sini setelah potret harian berikutnya (07:30 WIB)." />
      )}

      {state.sessions.length > 0 && (
        <section className="space-y-2">
          <SectionTitle right={<span className="text-[11px] text-ink-faint">{aktif} masih berjalan · {state.sessions.length} sesi 60 hari terakhir</span>}>
            Sesi boost
          </SectionTitle>
          <TableScroll stickyFirst>
            <table className="w-full text-[11.5px]">
              <thead><tr className="text-left text-ink-faint">
                <th className="py-1.5 pr-3 font-semibold">Video</th>
                <th className="py-1.5 pr-3 font-semibold">Campaign</th>
                <th className="py-1.5 pr-3 font-semibold">Jenis</th>
                <th className="py-1.5 pr-3 font-semibold text-right">Budget/hari</th>
                <th className="py-1.5 pr-3 font-semibold">Mulai</th>
                <th className="py-1.5 pr-3 font-semibold">Terlihat</th>
                <th className="py-1.5 font-semibold">Eksperimen</th>
              </tr></thead>
              <tbody>
                {pgS.paged.map(s => {
                  const e = matchExperiment(state.exps, s)
                  const hidup = state.lastSnapshot && s.last_seen === state.lastSnapshot
                  return (
                    <tr key={s.session_id} className="border-t border-line/20">
                      <td className="py-1.5 pr-3">
                        {s.item_id ? (
                          <a href={tiktokVideoUrl(s.item_id)} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-accent hover:underline font-mono text-[11px]">
                            {s.item_id}<ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          // Sesi lama dipotret sebelum endpoint detail dipanggil (≤30 Agu
                          // 2026): videonya tak bisa dipulihkan kalau sesinya sudah selesai.
                          <span className="text-ink-faint" title="ID video tak terekam pada potret sesi ini">
                            {s.bid_type === 'NO_BID' ? '— (level campaign)' : '— tak terekam'}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-ink-muted truncate max-w-[180px]">{s.campaign_name || s.campaign_id}</td>
                      <td className="py-1.5 pr-3">
                        <span className="inline-flex items-center gap-1 text-ink-muted">
                          {s.bid_type === 'CREATIVE_NO_BID' && <Radio className="w-3 h-3 text-accent" />}
                          {JENIS[s.bid_type] || s.bid_type || '—'}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{s.budget != null ? fmtRp(s.budget) : '—'}</td>
                      <td className="py-1.5 pr-3 text-ink-muted whitespace-nowrap">{fmtWib(s.schedule_start_time)}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        <span className={hidup ? 'text-emerald-400' : 'text-ink-faint'}>
                          {hidup ? 'masih berjalan' : `s/d ${fmtTgl(s.last_seen)}`}
                        </span>
                      </td>
                      <td className="py-1.5">
                        {e ? (
                          <span className={`inline-flex items-center gap-1 ${CONC_TONE[e.conclusion] || 'text-ink-muted'}`}>
                            <FlaskConical className="w-3 h-3" />
                            {CONCLUSION_LABEL?.[e.conclusion] || e.conclusion || 'berjalan'}
                          </span>
                        ) : (
                          // Max Delivery diukur di level CAMPAIGN, jadi ia tetap terukur
                          // tanpa item_id. Yang benar-benar buntu hanya Creative Boost
                          // tanpa ID video: subjeknya tak diketahui.
                          terukur(s)
                            ? <span className="text-ink-faint" title="Akan dibuka pada sinkron pagi berikutnya (07:30 WIB)">menunggu sinkron</span>
                            : <span className="text-ink-faint" title="Creative Boost tanpa ID video — subjeknya tak diketahui, jadi sengaja tidak dibuka daripada mengukur video yang salah">tak bisa diukur</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
          <Pager {...pgS} unit="sesi" />
        </section>
      )}

      {state.changes.length > 0 && (
        <section className="space-y-2">
          <SectionTitle right={<span className="text-[11px] text-ink-faint">90 hari terakhir</span>}>
            Perubahan setelan campaign
          </SectionTitle>
          <TableScroll>
            <table className="w-full text-[11.5px]">
              <thead><tr className="text-left text-ink-faint">
                <th className="py-1.5 pr-3 font-semibold">Terlihat</th>
                <th className="py-1.5 pr-3 font-semibold">Campaign</th>
                <th className="py-1.5 pr-3 font-semibold">Yang berubah</th>
                <th className="py-1.5 pr-3 font-semibold">Dari</th>
                <th className="py-1.5 font-semibold">Jadi</th>
              </tr></thead>
              <tbody>
                {pgC.paged.map((c, i) => (
                  <tr key={`${c.date}-${c.campaign_id}-${c.field}-${i}`} className="border-t border-line/20">
                    <td className="py-1.5 pr-3 text-ink-muted whitespace-nowrap">{fmtTgl(c.date)}</td>
                    <td className="py-1.5 pr-3 text-ink-muted truncate max-w-[180px]">{c.campaign_name || c.campaign_id}</td>
                    <td className="py-1.5 pr-3 text-ink-strong">{c.label}</td>
                    <td className="py-1.5 pr-3 text-ink-faint">{c.from == null ? '—' : String(c.from)}</td>
                    <td className="py-1.5 text-ink">{c.to == null ? '—' : String(c.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <Pager {...pgC} unit="perubahan" />
        </section>
      )}
    </div>
  )
}
