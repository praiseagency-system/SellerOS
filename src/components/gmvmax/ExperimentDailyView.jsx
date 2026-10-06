// Bagian "data harian" drawer eksperimen: kartu hasil per rentang, bilah
// rentang, grafik bersumbu kalender, tabel harian, pembanding sebelum boost,
// dan retensi. SATU rentang aktif menggerakkan semuanya — grafik dan tabel
// disorot (tidak disaring); total, pembanding, dan retensi dihitung ulang dari
// satu fungsi agregat (aggregateDays). Vonis di kartu atas TIDAK ikut berubah
// saat rentang diganti: ia selalu dari jendela hari ke-1–3 dan ke-1–7 yang
// dihitung server.
import { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, X } from 'lucide-react'
import StatusChip, { statusFill } from './StatusChip'
import { statusLabel } from '../../utils/gmvmaxExperimentStatus'
import {
  aggregateDays, daysIn, presetRanges, matchPreset, rangeName, sideOf, hLabel, fmtDayID, fmtSpanID,
} from '../../utils/gmvmaxExperimentDaily'
import {
  fmtNumID, fmtDec1ID, fmtRpID, fmtRpShortID, fmtRpRbID, fmtRoiID, fmtRoiVsFloorID, fmtPctID, fmtFloorID,
} from '../../utils/gmvmaxExperimentFormat'

const HIDE_KEY = 'sq_exp_daily_table_hidden'
const VR_LABELS = ['2 dtk', '6 dtk', '25%', '50%', '75%', '100%']
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const SubHead = ({ children, right }) => (
  <div className="flex items-baseline gap-2 mb-2">
    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">{children}</p>
    {right && <span className="ml-auto text-[11px] text-ink-faint">{right}</span>}
  </div>
)

// Hijau/merah hanya punya SATU arti: ROI di atas / di bawah ambang. Netral bila
// ambang belum diisi, bila rentangnya belum lengkap, dan untuk masa sebelum boost.
function roiTone(roi, roiFloor, neutral = false) {
  if (neutral || roi == null || roiFloor == null) return 'text-ink'
  return roi >= roiFloor ? 'text-emerald-400' : 'text-red-400'
}

// Keterangan hari yang BUKAN "berbelanja di atas/di bawah ambang". Bersama
// above + below, daftar ini selalu menjelaskan seluruh hari dalam rentang.
function emptyNotes(a, verbose = false) {
  return [
    a.small > 0 && `${a.small} hari berbelanja di bawah ${fmtRpRbID(a.spendDayMin)}`,
    a.noSpend > 0 && `${a.noSpend} hari tanpa belanja`,
    a.merged > 0 && `${a.merged} hari berisi angka gabungan (unggahan berkas)`,
    a.idle > 0 && `${a.idle} hari tak ada di laporan`,
    a.missing > 0 && `${a.missing} hari data tidak masuk${verbose ? ' (tidak dihitung)' : ''}`,
    a.unknown > 0 && `${a.unknown} hari tanpa data${verbose ? ' (tidak dihitung)' : ''}`,
  ].filter(Boolean)
}

export default function ExperimentDailyView({
  calendar, roiFloor = null, spendFloor = null, preComparable = null, checkpoints = [], boost = null,
  isVideo = false, startLabel = '', noun = 'boost', statusByDate = null,
}) {
  const presets = useMemo(
    () => presetRanges(calendar, { boostLastSeen: boost?.lastSeen, boostEnded: !!boost?.ended, noun }),
    [calendar, boost?.lastSeen, boost?.ended, noun],
  )
  const byKey = useMemo(() => Object.fromEntries(presets.map(p => [p.key, p])), [presets])
  const statusKeys = useMemo(
    () => (statusByDate ? [...new Set([...statusByDate.values()].map(x => x.status))] : []), [statusByDate])
  // Bawaan SELALU hari ke-1–7, supaya angka pembuka punya arti yang sama di semua
  // eksperimen. Pengecualian: belum ada satu hari pun sesudah mulai.
  const [picked, setSel] = useState(() => {
    const hasRun = calendar.some(d => d.phase === 'post' && d.counted)
    const p = (!hasRun && byKey.pre) || byKey.h7
    return p ? { key: p.key, from: p.from, to: p.to } : { key: null, from: null, to: null }
  })
  const [pick, setPick] = useState(null)       // hari pertama rentang sendiri yang sedang dipilih
  const [crossed, setCrossed] = useState(false) // klik kedua jatuh di sisi lain tanggal mulai
  const [openPre, setOpenPre] = useState(() => picked.key === 'pre')
  const [openLate, setOpenLate] = useState(false)
  const [detail, setDetail] = useState({})
  const [read, setRead] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false } })

  // Rentang bawaan dibaca ulang dari daftar terkini: batasnya bisa bergeser
  // (data baru masuk) atau rentangnya hilang (sesi boost baru termuat) setelah
  // dipilih. Rentang sendiri memakai tanggal yang tersimpan apa adanya.
  const live = picked.key ? (byKey[picked.key] || byKey.h7) : null
  const sel = live ? { key: live.key, from: live.from, to: live.to } : picked
  if (!presets.length || !sel.from) return null

  // ◎ hanya untuk titik ukur yang BENAR-BENAR terukur: eksperimen yang ditutup
  // sebelum H+7 tidak boleh menggambar cincin H+7 dari angka harian — vonis
  // tidak pernah membacanya.
  const ckByDate = new Map(checkpoints.filter(c => c.date && c.roi != null).map(c => [c.date, c]))
  const selDays = daysIn(calendar, sel.from, sel.to)
  const selAgg = aggregateDays(selDays, roiFloor, spendFloor)
  const selSide = selDays.length ? sideOf(selDays[0]) : 'post'
  const selName = sel.key ? byKey[sel.key].label : rangeName(calendar, sel.from, sel.to)
  const LOWER = { h3: 'hari 1–3', h7: 'hari 1–7', pre: `sebelum ${noun}`, after: 'setelah boost dicabut', all: 'sejak mulai' }
  const selLower = sel.key ? (LOWER[sel.key] || byKey[sel.key].label) : selName.replace(/^Hari/, 'hari')
  const selSpan = fmtSpanID(sel.from, sel.to)

  const pre = byKey.pre || null
  const preAgg = pre ? aggregateDays(daysIn(calendar, pre.from, pre.to), roiFloor, spendFloor) : null

  const cards = [byKey.h3, byKey.h7, byKey.pre, byKey.after].filter(Boolean)
  if (cards.length < 4 && byKey.all) cards.push(byKey.all)

  function choose(key) {
    const p = byKey[key]
    if (!p) return
    setSel({ key, from: p.from, to: p.to }); setPick(null); setCrossed(false)
    if (key === 'pre') setOpenPre(true)
    if (key === 'after' || key === 'all') setOpenLate(true)
  }
  function clickDay(day) {
    if (day.state !== 'data') return
    const first = pick ? calendar.find(d => d.date === pick) : null
    if (!first || sideOf(first) !== sideOf(day)) {
      setCrossed(!!first); setPick(day.date); setSel({ key: null, from: day.date, to: day.date })
      return
    }
    const from = first.date < day.date ? first.date : day.date
    const to = first.date < day.date ? day.date : first.date
    setSel({ key: matchPreset(presets, from, to), from, to }); setPick(null); setCrossed(false)
  }
  function toggleHidden() {
    setHidden(h => { try { localStorage.setItem(HIDE_KEY, h ? '0' : '1') } catch { /* storage diblok — pilihan tak diingat */ } return !h })
  }

  const many = calendar.length > 27
  // Rentang terpilih di luar hari ke-14 → tampilkan semua, supaya pitanya terlihat.
  const selBeyond = selDays.some(d => d.day > 14)
  const chartDays = many && !showAll && !selBeyond ? calendar.filter(d => d.day <= 14) : calendar
  const readDay = read ? calendar.find(d => d.date === read) : null
  // Pembanding selalu "sebelum boost vs sesuatu sesudah mulai".
  const cmpRange = selSide === 'pre' ? byKey.h7 : sel
  const cmpAgg = selSide === 'pre' ? aggregateDays(daysIn(calendar, byKey.h7.from, byKey.h7.to), roiFloor, spendFloor) : selAgg
  const cmpLower = selSide === 'pre' ? 'hari 1–7' : selLower
  // Jendela sebelum-mulai tidak diisi → kolomnya "—", bukan seluruh bagian hilang.
  const baseAgg = preAgg || aggregateDays([])

  return (
    <>
      {/* Hasil per rentang */}
      <div className="mt-5">
        <SubHead>Hasil per rentang</SubHead>
        <p className="text-[11px] text-ink-faint -mt-1 mb-2">
          ROI gabungan = total omzet ÷ total belanja. Pilih rentang untuk grafik, tabel, dan pembanding di bawah; vonis di atas tidak ikut berubah.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {cards.map(p => (
            <RangeCard key={p.key} p={p} active={sel.key === p.key} onClick={() => choose(p.key)}
              agg={p.key === 'pre' ? preAgg : aggregateDays(daysIn(calendar, p.from, p.to), roiFloor, spendFloor)}
              roiFloor={roiFloor} spendFloor={spendFloor} preComparable={preComparable} />
          ))}
        </div>
      </div>

      {/* Bilah rentang — menempel supaya rentang aktif selalu terlihat saat digulir */}
      <div className="sticky top-0 z-10 -mx-5 px-5 py-1 mt-2 bg-surface border-b border-line/10 flex items-center gap-x-1 gap-y-0.5 flex-wrap text-[11px]">
        <span className="text-ink-muted">
          Rentang: <b className="font-semibold text-ink">{sel.key ? '' : 'pilihanmu '}{selName}</b>{selName !== selSpan && ` · ${selSpan}`}
        </span>
        {!sel.key && (
          <button onClick={() => choose('h7')} aria-label="Hapus rentang sendiri" className="p-1 text-ink-faint hover:text-ink">
            <X className="w-3 h-3" />
          </button>
        )}
        <span className="ml-auto flex flex-wrap">
          {presets.map(p => (
            <button key={p.key} onClick={() => choose(p.key)}
              className={`px-1.5 py-1 ${sel.key === p.key ? 'text-accent underline underline-offset-2' : 'text-ink-muted hover:text-ink'}`}>
              {p.short}
            </button>
          ))}
        </span>
      </div>

      {/* Grafik harian */}
      <div className="mt-4">
        <SubHead>Grafik harian</SubHead>
        <p className="text-[11px] text-ink-faint -mt-1 mb-1 flex flex-wrap gap-x-3 gap-y-0.5">
          <span><i className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1" />omzet</span>
          <span><i className="inline-block w-2 h-2 rounded-sm bg-fill/40 mr-1" />belanja (skala sama dengan omzet)</span>
          <span><span className="text-amber-400">●</span> ROI hari itu</span>
          {ckByDate.size > 0 && <span><span className="text-amber-400">◎</span> titik ukur lama</span>}
          {pre && <span>arsiran = sebelum {noun}</span>}<span>pita = rentang terpilih</span><span>kotak putus = data tidak masuk</span>
          {boost && <span><i className="inline-block w-3 h-0.5 bg-accent mr-1 align-middle" />boost terlihat (perkiraan)</span>}
          {statusKeys.length > 0 && (
            <span>strip di bawah batang = status video: {statusKeys.map((k, i) => (
              <span key={k}>{i > 0 && ' · '}<i className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: statusFill(k) }} />{statusLabel(k)}</span>
            ))}</span>
          )}
        </p>
        <CalendarChart days={chartDays} sel={sel} ckByDate={ckByDate} boost={boost} noun={noun} onRead={setRead} statusByDate={statusByDate} />
        <p className="text-[11px] text-ink-faint mt-1">
          {readDay ? <DayReadout day={readDay} status={statusByDate?.get(readDay.date)?.status} /> : 'Ketuk batang untuk angka hari itu.'}
          {many && !selBeyond && (
            <button onClick={() => setShowAll(v => !v)} className="ml-2 text-accent hover:underline">
              {showAll ? 'ringkas sampai hari ke-14' : `tampilkan semua ${calendar.length} hari`}
            </button>
          )}
        </p>
      </div>

      {/* Data harian */}
      <div className="mt-5">
        <SubHead right={
          <>
            {!hidden && (crossed ? 'hari sebelum dan sesudah mulai tidak bisa digabung — pilihan dimulai dari hari ini'
              : pick ? 'sekarang klik hari akhir' : 'klik satu hari lalu hari lain = rentang sendiri')}
            <button onClick={toggleHidden} className="ml-2 text-ink-muted hover:text-ink">{hidden ? 'tampilkan tabel' : 'sembunyikan tabel'}</button>
          </>
        }>Data harian</SubHead>
        <p className="text-[11px] text-ink-faint -mt-1 mb-1">
          {ckByDate.size > 0 && <><span className="text-amber-400">◎</span> titik ukur lama · </>}
          {roiFloor != null && <>hijau = ROI ≥ ambang {fmtFloorID(roiFloor)}, merah = di bawahnya (hari berbelanja ≥ {fmtRpRbID(selAgg.spendDayMin)}) · </>}garis = besar belanja
        </p>
        <div className="overflow-x-auto">
        <DailyTable calendar={calendar} sel={sel} selAgg={selAgg} selSide={selSide} selLower={selLower}
          presets={byKey} preAgg={preAgg} preComparable={preComparable}
          roiFloor={roiFloor} spendFloor={spendFloor} ckByDate={ckByDate} boost={boost} isVideo={isVideo}
          statusByDate={statusByDate} startLabel={startLabel} noun={noun} hidden={hidden} openPre={openPre} openLate={openLate}
          onTogglePre={() => setOpenPre(v => !v)} onToggleLate={() => setOpenLate(v => !v)}
          detail={detail} onDetail={(date) => setDetail(m => ({ ...m, [date]: !m[date] }))} onDay={clickDay} />
        </div>
        <p className="text-[11px] text-ink-faint mt-1.5">
          Hari yang datanya tidak masuk tidak dihitung. Hari tak ada di laporan (datanya masuk, sasaran tidak muncul) dihitung Rp0.
          ROI{isVideo ? ', CTR, dan CVR' : ''} total dihitung dari jumlah, bukan rata-rata harian.
        </p>
      </div>

      {/* Pembanding + retensi — hanya sasaran video */}
      {isVideo && (
        <div className="mt-5">
          <SubHead>Iklan GMV Max video ini — {pre ? `sebelum ${noun} vs ${cmpLower}` : cmpLower}</SubHead>
          <p className="text-[11px] text-ink-faint -mt-1 mb-1">
            {cap(`sebelum ${noun}`)}: {pre ? `${fmtSpanID(pre.from, pre.to)}, ${preAgg.counted} hari` : 'jendela tidak diisi'}. {cap(cmpLower)}: {fmtSpanID(cmpRange.from, cmpRange.to)}, {cmpAgg.counted > 0 ? `${cmpAgg.counted} hari` : 'belum ada data'}
            {cmpAgg.missing > 0 && ` — ${cmpAgg.missing} hari data tidak masuk, tidak dihitung`}.
            {' '}Rata-rata per hari = jumlah ÷ hari yang datanya masuk. Ini angka iklan GMV Max, bukan tayangan organik.
            {(baseAgg.merged > 0 || cmpAgg.merged > 0) && ' Ada hari berisi angka gabungan beberapa hari (unggahan berkas), jadi rata-rata per hari di rentang itu terlalu besar.'}
            {selSide === 'pre' && ` Rentang terpilih = sebelum ${noun}, jadi pembandingnya hari 1–7.`}
          </p>
          <CompareTable base={baseAgg} post={cmpAgg} baseLabel={cap(`sebelum ${noun}`)} postLabel={cap(cmpLower)} comparable={pre ? preComparable : null} />
          {(baseAgg.vr || cmpAgg.vr) && (
            <div className="mt-4">
              <SubHead>Retensi tontonan iklan — {baseAgg.vr ? `sebelum ${noun} (abu) vs ` : ''}{cmpLower} (hijau)</SubHead>
              <RetentionBars base={baseAgg.vr} post={cmpAgg.vr} />
              <p className="text-[11px] text-ink-faint mt-1">
                Dari impresi iklan: sebelum {noun} {baseAgg.vrImpressions > 0 ? fmtNumID(baseAgg.vrImpressions) : 'tak ada data retensi'} · {cmpLower} {cmpAgg.vrImpressions > 0 ? fmtNumID(cmpAgg.vrImpressions) : 'tak ada data retensi'}.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function RangeCard({ p, agg, active, onClick, roiFloor, spendFloor, preComparable }) {
  const isPre = p.key === 'pre'
  const empty = agg.counted === 0
  // Rentang yang belum lengkap: ROI tanpa warna ambang + cap "sementara".
  const provisional = !isPre && !empty && agg.pending > 0
  const small = isPre && preComparable === false
  // Belanja di bawah lantai: ROI tidak diwarnai — sama dengan chip dasar vonis
  // dan kotak di daftar ("80,9x" dari Rp1 ribu bukan pemenang).
  const tiny = !empty && agg.cost > 0 && spendFloor != null && agg.cost < spendFloor
  const notes = empty ? [] : emptyNotes(agg)
  if (provisional) notes.push(`sementara — baru ${agg.counted} dari ${agg.calendarDays} hari`)
  if (p.approx) notes.push('tanggal dicabut = perkiraan')
  if (small) notes.push(`Belanja terlalu kecil untuk dibandingkan${spendFloor != null ? ` (lantai belanja ${fmtRpRbID(spendFloor)})` : ''}`)
  if (!isPre && !empty && agg.cost > 0 && spendFloor != null && agg.cost < spendFloor) {
    notes.push(`belanja di bawah lantai belanja ${fmtRpRbID(spendFloor)}`)
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`text-left rounded-xl border p-3 flex flex-col transition-colors ${active
        ? 'border-accent/60 bg-accent/[0.08]' : 'border-line/15 bg-surface hover:border-line/30'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-ink-strong">{p.label}</span>
        {!small && !empty && <span className="text-[10.5px] text-ink-faint whitespace-nowrap">ROI gabungan</span>}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-ink-muted">{fmtSpanID(p.from, p.to)} · {p.plain}</span>
        {!empty && (small
          ? <span className="text-xs text-ink-muted whitespace-nowrap">ROI {fmtRoiID(agg.roi)}</span>
          : <span className={`text-lg leading-6 font-semibold tabular-nums ${roiTone(agg.roi, roiFloor, isPre || provisional || tiny)}`}>{fmtRoiVsFloorID(agg.roi, roiFloor)}</span>)}
      </div>
      {empty ? (
        <p className="text-[11px] text-ink-faint mt-1">
          {agg.pending === agg.calendarDays ? 'Menunggu data — belum ada hari yang masuk.' : 'Belum ada data pada rentang ini.'}
        </p>
      ) : (
        <>
          <p className="text-xs text-ink mt-0.5">Belanja {fmtRpShortID(agg.cost)} · Omzet {fmtRpShortID(agg.revenue)}</p>
          <p className="text-[11px] text-ink-muted">
            {fmtNumID(agg.orders)} order
            {!isPre && (roiFloor != null
              ? ` · ${agg.above} dari ${agg.spendDays} hari berbelanja ≥ ${fmtFloorID(roiFloor)}`
              : ` · hari beromzet: ${agg.withRevenue} dari ${agg.counted}`)}
          </p>
          {agg.cost === 0 && <p className="text-[11px] text-ink-faint">belum ada belanja</p>}
        </>
      )}
      {notes.length > 0 && <p className="text-[10.5px] text-ink-faint mt-0.5">{notes.join(' · ')}</p>}
    </button>
  )
}

function DayReadout({ day, status }) {
  const h = hLabel(day)
  const head = `${fmtDayID(day.date)}${h ? ` · ${h}` : ''} — `
  if (day.state === 'data') {
    return <span className="text-ink-muted">{head}omzet {fmtRpID(day.revenue)} · belanja {fmtRpID(day.cost)} · ROI {fmtRoiID(day.roi)}{status ? ` · status ${statusLabel(status)}` : ''}</span>
  }
  const why = day.state === 'idle' ? 'tak ada di laporan (dihitung Rp0)' : day.state === 'pending' ? 'menunggu data'
    : day.state === 'missing' ? 'data tidak masuk (tidak dihitung)' : 'tak ada data (tidak dihitung)'
  return <span className="text-ink-muted">{head}{why}</span>
}

// Batang omzet/belanja + titik ROI per HARI KALENDER. Hari tanpa data tetap
// punya kolom (dulu dirapatkan, jadi hari kosong tak kelihatan).
function CalendarChart({ days, sel, ckByDate, boost, noun, onRead, statusByDate }) {
  const n = days.length
  const STEP = Math.max(20, Math.min(34, Math.floor(552 / n)))
  const BW = Math.min(8, Math.floor(STEP / 2) - 3)
  const T = 30, B = 150
  const W = n * STEP
  const maxV = Math.max(1, ...days.map(d => Math.max(d.revenue, d.cost)))
  const maxR = Math.max(1, ...days.map(d => d.roi || 0)) * 1.15
  const y = v => B - (B - T) * v / maxV
  const yr = v => B - (B - T) * v / maxR
  const x = i => i * STEP
  const firstIdx = (pred) => days.findIndex(pred)
  const lastIdx = (pred) => { for (let i = n - 1; i >= 0; i--) if (pred(days[i])) return i; return -1 }

  const s0 = firstIdx(d => d.date >= sel.from), s1 = lastIdx(d => d.date <= sel.to)
  const p0 = firstIdx(d => d.phase === 'pre'), p1 = lastIdx(d => d.phase === 'pre')
  const iStart = firstIdx(d => sideOf(d) === 'post')
  const b0 = boost ? firstIdx(d => d.date >= boost.firstSeen) : -1
  const b1 = boost ? lastIdx(d => d.date <= boost.lastSeen) : -1
  const hasBoost = b0 >= 0 && b1 >= b0
  const H = B + (hasBoost ? 42 : 32)
  const bx0 = hasBoost ? x(b0) + 2 : 0, bx1 = hasBoost ? x(b1) + STEP - 2 : 0
  const halo = { paintOrder: 'stroke', stroke: 'rgb(var(--c-surface))', strokeWidth: 3 }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Grafik harian omzet, belanja, dan ROI">
        <defs>
          <pattern id="exp-pre-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="3" y1="0" x2="3" y2="6" stroke="currentColor" className="text-line/20" />
          </pattern>
        </defs>
        {s0 >= 0 && s1 >= s0 && (
          <rect x={x(s0)} y={T - 10} width={(s1 - s0 + 1) * STEP} height={B - T + 10} fill="currentColor" className="text-accent" opacity="0.14" />
        )}
        {p0 >= 0 && (
          <>
            <rect x={x(p0)} y={T - 10} width={(p1 - p0 + 1) * STEP} height={B - T + 10} fill="url(#exp-pre-hatch)" />
            <text x={x(p0) + 4} y={13} fontSize="10" fill="currentColor" className="text-ink-faint">sebelum {noun}</text>
          </>
        )}
        {iStart >= 0 && (
          <>
            <line x1={x(iStart)} x2={x(iStart)} y1={4} y2={B} stroke="currentColor" className="text-accent" strokeDasharray="3 3" />
            <text x={x(iStart) + 5} y={13} fontSize="10" fill="currentColor" className="text-accent">{noun} mulai</text>
          </>
        )}
        <line x1={0} x2={W} y1={B} y2={B} stroke="currentColor" className="text-line/15" />
        {days.map((d, i) => {
          const cx = x(i) + STEP / 2
          const dim = d.date >= sel.from && d.date <= sel.to ? 1 : 0.4
          const dayNum = +d.date.slice(8, 10)
          // Label sumbu = penanda ujung jendela vonis (hari ke-1, 3, 7).
          const edge = d.phase === 'post' && (d.day === 1 || d.day === 3 || d.day === 7)
          const sub = edge ? `hari ${d.day}` : (i === 0 || dayNum === 1) ? fmtDayID(d.date).split(' ')[1] : ''
          const hc = d.cost > 0 ? Math.max(2, B - y(d.cost)) : 0
          return (
            <g key={d.date}>
              {d.state === 'data' && (
                <>
                  <rect x={cx - BW - 1} width={BW} y={y(d.revenue)} height={B - y(d.revenue)} rx="1" fill="currentColor" className="text-emerald-500" opacity={dim} />
                  {hc > 0 && <rect x={cx + 1} width={BW} y={B - hc} height={hc} rx="1" fill="currentColor" className="text-ink-faint" opacity={dim} />}
                </>
              )}
              {d.state === 'idle' && <line x1={cx - BW} x2={cx + BW} y1={B - 2} y2={B - 2} stroke="currentColor" className="text-ink-faint" strokeWidth="2" />}
              {(d.state === 'missing' || d.state === 'unknown') && (
                <rect x={cx - BW} y={T} width={BW * 2} height={B - T} fill="none" stroke="currentColor" className="text-line/25" strokeDasharray="2 3" />
              )}
              {d.state === 'pending' && <circle cx={cx} cy={B - 5} r="1.5" fill="currentColor" className="text-ink-faint" />}
              {/* Pita status tayang video hari itu, tepat di bawah garis dasar. */}
              {statusByDate?.get(d.date) && (
                <rect x={x(i) + 1} y={B + 1} width={STEP - 2} height={3} fill={statusFill(statusByDate.get(d.date).status)} />
              )}
              <text x={cx} y={B + 13} textAnchor="middle" fontSize="10" fill="currentColor" className="text-ink-faint">{dayNum}</text>
              {sub && <text x={cx} y={B + 26} textAnchor="middle" fontSize="10" fill="currentColor" className="text-ink-faint">{sub}</text>}
            </g>
          )
        })}
        {hasBoost && (
          <>
            <line x1={bx0} x2={bx1} y1={B + 36} y2={B + 36} stroke="currentColor" className="text-accent" strokeWidth="2" />
          </>
        )}
        {/* Titik ROI digambar setelah semua batang supaya tak tertimpa. */}
        {days.map((d, i) => {
          if (d.state !== 'data' || d.roi == null) return null
          const cx = x(i) + STEP / 2, cy = yr(d.roi)
          const dim = d.date >= sel.from && d.date <= sel.to ? 1 : 0.4
          const ck = ckByDate.get(d.date)
          if (!ck) {
            return <circle key={d.date} cx={cx} cy={cy} r="2.5" fill="rgb(251 191 36)" style={{ stroke: 'rgb(var(--c-surface))' }} opacity={dim} />
          }
          const tx = Math.min(Math.max(cx, 34), W - 34)
          return (
            <g key={d.date}>
              <circle cx={cx} cy={cy} r="4" style={{ fill: 'rgb(var(--c-surface))' }} stroke="rgb(251 191 36)" strokeWidth="1.5" />
              <text x={tx} y={Math.max(24, Math.min(cy, y(d.revenue)) - 8)} textAnchor="middle" fontSize="10" fontWeight="600" fill="rgb(251 191 36)" style={halo}>
                {ck.label} · {fmtRoiID(Number(ck.roi))}
              </text>
            </g>
          )
        })}
        {days.map((d, i) => (
          <rect key={d.date} x={x(i)} y={0} width={STEP} height={H} fill="transparent" className="cursor-pointer" onClick={() => onRead(d.date)}>
            <title>{`${fmtDayID(d.date)}${statusByDate?.get(d.date) ? ` — ${statusLabel(statusByDate.get(d.date).status)}` : ''}`}</title>
          </rect>
        ))}
      </svg>
    </div>
  )
}

const EMPTY_TEXT = {
  missing: 'data tidak masuk — tidak dihitung',
  pending: 'menunggu data',
  unknown: 'tak ada data — data belum masuk atau sasaran tidak tayang',
}

function DailyTable({
  calendar, sel, selAgg, selSide, selLower, presets, preAgg, preComparable, roiFloor, spendFloor, statusByDate,
  ckByDate, boost, isVideo, startLabel, noun, hidden, openPre, openLate, onTogglePre, onToggleLate, detail, onDetail, onDay,
}) {
  // Kolom status hanya untuk sasaran video yang status hariannya terekam.
  const st = isVideo && !!statusByDate && statusByDate.size > 0
  const cols = (isVideo ? 8 : 5) + (st ? 1 : 0)
  const maxCost = Math.max(1, ...calendar.map(d => d.cost))
  const inSel = (d) => d.date >= sel.from && d.date <= sel.to
  const preDays = calendar.filter(d => d.phase === 'pre')
  // Hari sebelum mulai yang DI LUAR jendela tersimpan: tampil, tapi bukan bagian
  // total "sebelum …" — dipisah supaya baris yang terlihat cocok dengan totalnya.
  const gapDays = calendar.filter(d => d.phase === 'gap')
  const runDays = calendar.filter(d => d.phase === 'post' && d.day <= 7)
  const lateDays = calendar.filter(d => d.day > 7)
  const lateAggArgs = [roiFloor, spendFloor]
  const after = presets.after || null
  const lateAgg = lateDays.length ? aggregateDays(lateDays, ...lateAggArgs) : null
  const lateIsAfter = !!after && lateDays.length > 0 && after.from === lateDays[0].date
  const th = 'font-semibold py-1.5 px-1 text-right'
  const td = 'py-1.5 px-1 text-right tabular-nums align-top'
  const note = 'py-1.5 px-1 text-left text-[11px] text-ink-muted'

  const sep = (key, text) => (
    <tr key={key} className="border-t border-line/10"><td colSpan={cols} className="py-1.5 px-1 text-left text-[11px] text-accent">{text}</td></tr>
  )
  const afterSep = after && sep('after-sep', `boost tak terlihat lagi mulai ${fmtDayID(after.from)} (perkiraan)`)

  function dayRow(d) {
    const h = hLabel(d)
    const ck = ckByDate.get(d.date)
    const label = <>{h ? `${h} · ` : ''}{fmtDayID(d.date)}{ck && <span className="text-amber-400"> ◎</span>}</>
    const hi = inSel(d) ? 'bg-accent/10' : ''
    if (!d.counted) {
      return (
        <tr key={d.date} className={`border-t border-line/10 text-ink-muted ${hi}`}>
          <td className="py-1.5 px-1 text-left">{label}</td>
          <td colSpan={cols - 1} className="py-1.5 px-1 text-left">{EMPTY_TEXT[d.state]}</td>
        </tr>
      )
    }
    const idle = d.state === 'idle'
    const merged = d.spanDays > 1
    const sub = idle ? 'tak ada di laporan' : merged ? `angka gabungan ${d.spanDays} hari (unggahan berkas)`
      : d.day === 1 ? `hari mulai — ${startLabel}` : d.cost === 0 ? 'tanpa belanja' : ''
    const open = !!detail[d.date]
    const dst = st ? statusByDate.get(d.date) || null : null
    const seen = boost && d.date >= boost.firstSeen && d.date <= boost.lastSeen
    return [
      <tr key={d.date} onClick={idle ? undefined : () => onDay(d)}
        role={idle ? undefined : 'button'} tabIndex={idle ? undefined : 0}
        onKeyDown={idle ? undefined : (ev) => {
          if (ev.target !== ev.currentTarget) return // Enter di tombol rincian bukan klik baris
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onDay(d) }
        }}
        className={`border-t border-line/10 ${idle ? 'text-ink-muted' : 'text-ink cursor-pointer hover:bg-fill/[0.04]'} ${hi}`}>
        <td className="py-1.5 px-1 text-left align-top">
          {label}{sub && <div className="text-[10.5px] text-ink-faint">{sub}</div>}
        </td>
        {st && (
          <td className="py-1.5 px-1 text-left align-top">
            {dst ? <StatusChip status={dst.status} title={dst.others.length ? `Di campaign lain: ${dst.others.map(statusLabel).join(', ')}` : undefined} /> : <span className="text-ink-faint">—</span>}
          </td>
        )}
        <td className={td}>
          {fmtRpID(d.cost)}
          <div className="h-0.5 bg-line/10 mt-0.5"><div className="h-0.5 bg-fill/40" style={{ width: `${Math.round((d.cost / maxCost) * 100)}%` }} /></div>
        </td>
        <td className={td}>{fmtRpID(d.revenue)}</td>
        <td className={`${td} ${roiTone(d.roi, roiFloor, merged || sideOf(d) === 'pre' || d.cost < selAgg.spendDayMin)}`}>{fmtRoiID(d.roi)}</td>
        <td className={td}>{fmtNumID(d.orders)}</td>
        {isVideo && (
          <>
            <td className={td}>{d.impressions > 0 ? fmtPctID(d.clicks / d.impressions) : '—'}</td>
            <td className={td}>{d.clicks > 0 ? fmtPctID(d.orders / d.clicks) : '—'}</td>
            <td className="py-1 px-0 text-center align-top">
              {!idle && (
                <button onClick={(ev) => { ev.stopPropagation(); onDetail(d.date) }} aria-expanded={open}
                  aria-label={`Rincian ${fmtDayID(d.date)}`} className="p-1 text-ink-faint hover:text-ink">
                  {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}
            </td>
          </>
        )}
      </tr>,
      open && (
        <tr key={`${d.date}-detail`} className={hi}>
          <td colSpan={cols} className={note}>
            Impresi {fmtNumID(d.impressions)} · Klik {fmtNumID(d.clicks)} · Biaya/order {d.orders > 0 ? fmtRpID(d.cost / d.orders) : '—'}
            {seen && ' · boost terlihat (perkiraan)'}
            {ck?.roi != null && ` · saat titik ukur dicatat: ${fmtRoiID(Number(ck.roi))}`}
          </td>
        </tr>
      ),
    ]
  }
  const rowsWithSep = (days) => days.flatMap(d => (after && d.date === after.from ? [afterSep, dayRow(d)] : [dayRow(d)]))

  function groupRow({ key, label, agg, open, onToggle, lit, neutral }) {
    return (
      <tr key={key} onClick={onToggle} role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={(ev) => {
          if (ev.target !== ev.currentTarget) return
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onToggle() }
        }}
        className={`border-t border-line/10 text-ink cursor-pointer hover:bg-fill/[0.04] ${lit ? 'bg-accent/10' : ''}`}>
        <td className="py-1.5 px-1 text-left font-medium">
          {open ? <ChevronDown className="inline w-3.5 h-3.5 -mt-0.5" /> : <ChevronRight className="inline w-3.5 h-3.5 -mt-0.5" />} {label}
        </td>
        {st && <td />}
        <td className={td}>{fmtRpID(agg.cost)}</td>
        <td className={td}>{fmtRpID(agg.revenue)}</td>
        <td className={`${td} ${neutral ? 'text-ink-muted' : roiTone(agg.roi, roiFloor, spendFloor != null && agg.cost < spendFloor)}`}>{fmtRoiID(agg.roi)}</td>
        <td className={td}>{fmtNumID(agg.orders)}</td>
        {isVideo && <><td className={td}>{fmtPctID(agg.ctr)}</td><td className={td}>{fmtPctID(agg.cvr)}</td><td /></>}
      </tr>
    )
  }

  // Kaki tabel: total rentang terpilih + rincian hari, dengan satu definisi
  // "hari" yang sama dengan kartu (hari yang datanya masuk).
  let foot
  if (selAgg.counted === 0) {
    foot = 'Belum ada data pada rentang ini.'
  } else if (selSide === 'pre') {
    foot = `${[`${selAgg.counted} hari`, ...emptyNotes(selAgg, true)].join(' · ')} · ROI tidak diwarnai ambang — ini masa sebelum ${noun}.`
  } else {
    const parts = roiFloor != null
      ? [`${selAgg.above} hari berbelanja di atas ambang`, `${selAgg.below} di bawah ambang${selAgg.below > 0 && selAgg.zeroRevenue ? ` (${Math.min(selAgg.zeroRevenue, selAgg.below)} tanpa omzet)` : ''}`]
      : [`${selAgg.withRevenue} hari beromzet`]
    foot = `${selAgg.counted} hari: ${[...parts, ...emptyNotes(selAgg, true)].join(' · ')}.`
    if (roiFloor != null && selAgg.cost > 0) {
      foot += ` ${fmtRpID(selAgg.spendAbove)} dari ${fmtRpID(selAgg.cost)} belanja (${Math.round((selAgg.spendAbove / selAgg.cost) * 100)}%) ada di hari yang di atas ambang.`
    }
    if (selAgg.cost === 0) foot += ' Tanpa belanja pada rentang ini.'
    else if (spendFloor != null && selAgg.cost < spendFloor) foot += ` Belanja rentang ${fmtRpID(selAgg.cost)} di bawah lantai belanja ${fmtRpRbID(spendFloor)}.`
    if (selAgg.pending > 0) foot += ` Sementara — baru ${selAgg.counted} dari ${selAgg.calendarDays} hari.`
  }

  return (
    <table className={`w-full text-xs table-fixed ${st ? 'min-w-[620px]' : isVideo ? 'min-w-[540px]' : 'min-w-[420px]'}`}>
      <colgroup>
        {isVideo
          ? <><col style={{ width: 124 }} />{st && <col style={{ width: 80 }} />}<col style={{ width: 86 }} /><col style={{ width: 92 }} /><col style={{ width: 54 }} /><col style={{ width: 44 }} /><col style={{ width: 52 }} /><col style={{ width: 52 }} /><col /></>
          : <><col /><col style={{ width: 104 }} /><col style={{ width: 112 }} /><col style={{ width: 70 }} /><col style={{ width: 60 }} /></>}
      </colgroup>
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-ink-faint">
          <th className="font-semibold py-1.5 px-1 text-left">Hari</th>
          {st && <th className="font-semibold py-1.5 px-1 text-left">Status</th>}
          <th className={th}>Belanja</th><th className={th}>Omzet</th><th className={th}>ROI</th><th className={th}>Order</th>
          {isVideo && <><th className={th}>CTR</th><th className={th}>CVR</th><th /></>}
        </tr>
      </thead>
      {!hidden && (
        <tbody>
          {preAgg && groupRow({
            key: 'pre', label: cap(`sebelum ${noun}`), agg: preAgg, open: openPre, onToggle: onTogglePre, neutral: true,
            lit: !openPre && selSide === 'pre',
          })}
          {preAgg && (
            <tr className="border-t border-line/10">
              <td colSpan={cols} className={note}>
                {fmtSpanID(presets.pre.from, presets.pre.to)} · {[`${preAgg.counted} hari`, ...emptyNotes(preAgg)].join(', ')}
                {preComparable === false && ` · ROI tidak dibandingkan — belanja ${spendFloor != null ? `di bawah lantai belanja ${fmtRpRbID(spendFloor)}` : 'terlalu kecil'}`}
              </td>
            </tr>
          )}
          {openPre && preDays.flatMap(dayRow)}
          {gapDays.length > 0 && (openPre || !preAgg) && sep('gap-sep',
            `${fmtSpanID(gapDays[0].date, gapDays[gapDays.length - 1].date)} · di luar jendela sebelum ${noun} — tidak masuk total di atas`)}
          {gapDays.length > 0 && (openPre || !preAgg) && gapDays.flatMap(dayRow)}
          {rowsWithSep(runDays)}
          {lateAgg && lateIsAfter && afterSep}
          {lateAgg && groupRow({
            key: 'late', label: lateIsAfter ? 'Setelah boost dicabut' : `${lateDays.length} hari berikutnya`, agg: lateAgg,
            open: openLate, onToggle: onToggleLate, lit: !openLate && selSide === 'post' && sel.to >= lateDays[0].date,
          })}
          {lateAgg && (
            <tr className="border-t border-line/10">
              <td colSpan={cols} className={note}>
                {fmtSpanID(lateDays[0].date, lateDays[lateDays.length - 1].date)} · {[`${lateDays.length} hari`, ...emptyNotes(lateAgg)].join(', ')}
              </td>
            </tr>
          )}
          {lateAgg && openLate && (lateIsAfter ? lateDays.flatMap(dayRow) : rowsWithSep(lateDays))}
        </tbody>
      )}
      <tfoot>
        {selAgg.counted > 0 && (
          <tr className="border-t border-line/20 bg-fill/[0.04] text-ink font-semibold">
            <td className="py-1.5 px-1 text-left">Total {selLower}</td>
            {st && <td />}
            <td className={td}>{fmtRpID(selAgg.cost)}</td>
            <td className={td}>{fmtRpID(selAgg.revenue)}</td>
            <td className={`${td} ${roiTone(selAgg.roi, roiFloor, selSide === 'pre' || selAgg.pending > 0 || (spendFloor != null && selAgg.cost < spendFloor))}`}>{fmtRoiVsFloorID(selAgg.roi, roiFloor)}</td>
            <td className={td}>{fmtNumID(selAgg.orders)}</td>
            {isVideo && <><td className={td}>{fmtPctID(selAgg.ctr)}</td><td className={td}>{fmtPctID(selAgg.cvr)}</td><td /></>}
          </tr>
        )}
        <tr className="bg-fill/[0.04]"><td colSpan={cols} className={note}>{foot}</td></tr>
      </tfoot>
    </table>
  )
}

const Muted = ({ children }) => <span className="text-ink-faint">{children}</span>
function deltaPct(a, b, { invert = false, neutral = false } = {}) {
  if (a == null || b == null || a === 0) return <Muted>—</Muted>
  const p = ((b - a) / a) * 100
  const abs = Math.abs(p)
  if (abs < 0.05) return <span className="tabular-nums text-ink-muted">0%</span>
  const tone = neutral ? 'text-ink-muted' : (invert ? p < 0 : p > 0) ? 'text-emerald-400' : 'text-red-400'
  return <span className={`tabular-nums ${tone}`}>{p >= 0 ? '+' : '−'}{abs >= 10 ? fmtNumID(abs) : fmtDec1ID(abs)}%</span>
}
function deltaPoint(a, b) {
  if (a == null || b == null) return <Muted>—</Muted>
  const p = (b - a) * 100
  if (Math.abs(p) < 0.05) return <span className="tabular-nums text-ink-muted">0 poin</span>
  return <span className={`tabular-nums ${p >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p >= 0 ? '+' : '−'}{fmtDec1ID(Math.abs(p))} poin</span>
}

// Sebelum boost vs rentang terpilih. Volume = rata-rata per hari yang datanya
// masuk; rasio dari jumlah. Selisih ROI & biaya/order TIDAK dihitung bila
// belanja sebelum boost di bawah lantai (omzet organik yang kebetulan
// teratribusi bukan prestasi iklan), dan disembunyikan bila lantainya belum termuat.
function CompareTable({ base, post, baseLabel, postLabel, comparable }) {
  const per = (a, v) => (a.counted > 0 ? v / a.counted : null)
  // Huruf angka (mono) hanya untuk angkanya; keterangan teks tetap huruf biasa
  // supaya tidak melebar dan terpotong di kolom sempit.
  const n = (v) => (typeof v === 'string' ? <span className="tabular-nums">{v}</span> : v)
  const raw = (x, xu, yv, yu) => <div className="text-[10.5px] text-ink-faint">{fmtNumID(x)} {xu} / {fmtNumID(yv)} {yu}</div>
  const guarded = (el) => (comparable === false ? <Muted>tidak dibandingkan</Muted> : comparable == null ? <Muted>—</Muted> : el)
  const none = post.counted === 0
  const rows = [
    ['Belanja/hari', fmtRpID(per(base, base.cost)), fmtRpID(per(post, post.cost)), deltaPct(per(base, base.cost), per(post, post.cost), { neutral: true })],
    ['Omzet/hari', fmtRpID(per(base, base.revenue)), fmtRpID(per(post, post.revenue)), deltaPct(per(base, base.revenue), per(post, post.revenue))],
    ['ROI gabungan', <span key="b" className="tabular-nums text-ink-faint">{fmtRoiID(base.roi)}</span>, fmtRoiID(post.roi), guarded(deltaPct(base.roi, post.roi))],
    ['Impresi/hari', fmtNumID(per(base, base.impressions)), fmtNumID(per(post, post.impressions)), deltaPct(per(base, base.impressions), per(post, post.impressions))],
    ['Klik/hari', fmtNumID(per(base, base.clicks)), fmtNumID(per(post, post.clicks)), deltaPct(per(base, base.clicks), per(post, post.clicks))],
    ['CTR', <>{n(fmtPctID(base.ctr))}{base.impressions > 0 && raw(base.clicks, 'klik', base.impressions, 'impresi')}</>,
      <>{n(fmtPctID(post.ctr))}{post.impressions > 0 && raw(post.clicks, 'klik', post.impressions, 'impresi')}</>, deltaPoint(base.ctr, post.ctr)],
    ['CVR', <>{n(fmtPctID(base.cvr))}{base.clicks > 0 && raw(base.orders, 'order', base.clicks, 'klik')}</>,
      <>{n(fmtPctID(post.cvr))}{post.clicks > 0 && raw(post.orders, 'order', post.clicks, 'klik')}</>, deltaPoint(base.cvr, post.cvr)],
    ['Order/hari', fmtDec1ID(per(base, base.orders)), fmtDec1ID(per(post, post.orders)), deltaPct(per(base, base.orders), per(post, post.orders))],
    ['Biaya/order', fmtRpID(base.cpo), fmtRpID(post.cpo), guarded(deltaPct(base.cpo, post.cpo, { invert: true }))],
  ]
  return (
    <table className="w-full text-xs table-fixed">
      <colgroup><col style={{ width: 108 }} /><col /><col /><col style={{ width: 122 }} /></colgroup>
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-ink-faint">
          <th className="text-left font-semibold py-1.5 px-1">Metrik</th>
          <th className="text-right font-semibold py-1.5 px-1">{baseLabel}</th>
          <th className="text-right font-semibold py-1.5 px-1">{postLabel}</th>
          <th className="text-right font-semibold py-1.5 px-1">Selisih</th>
        </tr>
      </thead>
      <tbody>
        {none ? (
          <tr className="border-t border-line/10"><td colSpan={4} className="py-3 px-1 text-center text-ink-faint">Belum ada data pada rentang ini.</td></tr>
        ) : rows.map(([l, a, b, d]) => (
          <tr key={l} className="border-t border-line/10">
            <td className="py-1.5 px-1 text-ink align-top">{l}</td>
            <td className="py-1.5 px-1 text-right text-ink-muted align-top">{n(a)}</td>
            <td className="py-1.5 px-1 text-right text-ink align-top">{n(b)}</td>
            <td className="py-1.5 px-1 text-right align-top">{d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RetentionBars({ base, post }) {
  const max = Math.max(0.01, ...(base || []), ...(post || []))
  const h = (v) => Math.max(2, Math.round((v / max) * 84))
  const fp = (v) => (v * 100 >= 10 ? `${Math.round(v * 100)}%` : fmtPctID(v))
  const bar = (v, cls) => (
    <div className="flex flex-col items-center justify-end w-10">
      {v != null && <><span className="text-[10.5px] text-ink-muted tabular-nums">{fp(v)}</span><i className={`block w-4 rounded-sm ${cls}`} style={{ height: h(v) }} /></>}
    </div>
  )
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {VR_LABELS.map((l, i) => (
        <div key={l}>
          <div className="flex gap-1 justify-center items-end h-[108px]">
            {bar(base?.[i], 'bg-fill/30')}{bar(post?.[i], 'bg-emerald-500')}
          </div>
          <p className="text-[10.5px] text-ink-faint text-center mt-0.5">{l}</p>
        </div>
      ))}
    </div>
  )
}
