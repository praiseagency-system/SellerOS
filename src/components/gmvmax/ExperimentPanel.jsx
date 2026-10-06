// Eksperimen (#3b) — catat aksi sbg eksperimen + lacak hasil. Owner buat definisi
// + stop/simpulkan manual; checkpoint H+1/H+3/H+7 & kesimpulan OTOMATIS diisi
// server (pipeline) dari time-series kanonik. Read-only ke TikTok — pencatatan.
import { useEffect, useState, useCallback } from 'react'
import {
  LayoutGrid, TriangleAlert, Rocket, Sparkles, Zap, Ban, Clapperboard, Users, Package, Radio, FlaskConical,
} from 'lucide-react'
import { EmptyState } from './ui'
import {
  listExperiments, createExperiment, closeExperiment,
  EXPERIMENT_TYPES, CONCLUSION_LABEL,
} from '../../data/gmvmaxExperiments'
import { loadBoostSessions } from '../../data/gmvmaxBoostSessions'
import { getThresholds, saveExperimentRoiFloor } from '../../data/gmvmaxSettings'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { liveConclusion } from '../../utils/gmvmaxExperimentLive'
import { experimentAlerts, indexSessions, latestSeenOf } from '../../utils/gmvmaxExperimentAlerts'
import {
  ALL, CLOSE, buildTiles, applyFilter, resolveFilter, verdictBucket,
} from '../../utils/gmvmaxExperimentGroups'
import { fmtRoiID, fmtRoiVsFloorID, fmtRpRbID, fmtRpTinyID, fmtSignedX, verdictReasonID, CONFIDENCE_LABEL } from '../../utils/gmvmaxExperimentFormat'
import {
  resolveRuleConfig, windowOf, windowJudged, actionDirection, isContaminated, dayOne, wibDateOf,
} from '../../gmvmax/skills/experimentWindows.mjs'
import { addDaysISO, fmtDayID, latestWorkerSnapshot } from '../../utils/gmvmaxExperimentDaily'
import ExperimentDetailDrawer from './ExperimentDetailDrawer'

const typeLabel = (t) => (EXPERIMENT_TYPES.find(([k]) => k === t)?.[1]) || t
const BLUE = 'bg-blue-500/10 text-blue-400'
const VIOLET = 'bg-violet-500/10 text-violet-400'
const PLAIN = 'bg-fill/5 text-ink-muted'
// Ikon + warna per jenis — pembeda sekilas di baris; jenis tak dikenal jatuh ke labu.
const TYPE_ICON = {
  MANUAL_BOOST: [Rocket, BLUE], ACCELERATE_TESTING: [Zap, BLUE],
  NEW_CREATIVE_TEST: [Sparkles, VIOLET], CONTENT_ANGLE_TEST: [Clapperboard, VIOLET],
  PRODUCT_CREATIVE_TEST: [Package, VIOLET], LIVE_CREATIVE_TEST: [Radio, VIOLET],
  AFFILIATE_TEST: [Users, PLAIN], CREATIVE_EXCLUSION: [Ban, PLAIN],
}
const typeIcon = (t) => TYPE_ICON[t] || [FlaskConical, PLAIN]
// Satu warna per keranjang vonis — dipakai lencana baris DAN garis sebaran ubin.
const VERDICT = {
  win: { badge: 'bg-emerald-500/10 text-emerald-400', bar: 'bg-emerald-500', label: 'Menang' },
  spike: { badge: 'bg-amber-500/10 text-amber-400', bar: 'bg-amber-400', label: 'Lonjakan sementara' },
  weak: { badge: 'bg-red-500/10 text-red-400', bar: 'bg-red-500', label: 'Lemah' },
  none: { badge: 'bg-fill/5 text-ink-muted', bar: 'bg-line/30', label: 'Belum ada vonis' },
}
const BUCKETS = ['win', 'spike', 'weak', 'none']

export default function ExperimentPanel({ draft, onDraftUsed, onNavigate, onRuleConfig }) {
  const [state, setState] = useState({ loading: true })
  // Draft dari tombol "Jadikan eksperimen" (DecisionPanel) → form terbuka saat mount.
  const [showForm, setShowForm] = useState(!!draft)
  const [roiFloor, setRoiFloor] = useState(null)
  const [spendFloor, setSpendFloor] = useState(null)
  const [detail, setDetail] = useState(null) // eksperimen yang dibuka di drawer
  const [filter, setFilter] = useState(ALL) // ubin ringkasan yang sedang dipilih
  // Potret sesi boost — dipakai HANYA untuk peringatan "boost tak terlihat lagi".
  // Gagal memuat sengaja didiamkan: peringatan itu tambahan, bukan syarat panel.
  const [sessions, setSessions] = useState([])
  const { productNames, imports } = useGmvMax()

  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true }))
    listExperiments().then(r => setState({ loading: false, ...r })).catch(e => setState({ loading: false, error: e.message }))
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    getThresholds().then(t => { setRoiFloor(t.experimentRoiFloor ?? null); setSpendFloor(t.spendFloor ?? null) }).catch(() => {})
  }, [])
  useEffect(() => { loadBoostSessions({ days: 60 }).then(setSessions).catch(() => {}) }, [])

  // Panel lain di tab yang sama memakai setelan vonis yang sama dengan daftar
  // ini. (Hook — harus di atas early-return.)
  useEffect(() => { onRuleConfig?.(resolveRuleConfig({ roiFloor, spendFloor })) }, [onRuleConfig, roiFloor, spendFloor])

  if (state.loading) return <p className="text-sm text-ink-muted py-10 text-center">Memuat eksperimen…</p>
  if (state.error) return <EmptyState title="Gagal memuat" desc={state.error} />
  if (state.available === false) return <EmptyState title="Belum aktif" desc="Tabel eksperimen (migrasi 0031) belum di-apply." />

  const rows = state.rows || []
  const bySession = indexSessions(sessions)
  // Saksi yang sama dengan drawer: stempel sesi mana pun ATAU potret harian
  // worker — tanpa itu, toko yang boost-nya satu per satu tak pernah diperingatkan.
  const latestSeen = [latestSeenOf(sessions), latestWorkerSnapshot(imports || [])]
    .filter(Boolean).map(d => String(d).slice(0, 10)).sort().pop() || null
  // Vonis LIVE dari setelan terkini (server menyamakan tiap evaluasi harian).
  // Lantai belanja selalu ada — kosong berarti bawaan Rp50.000.
  const cfg = resolveRuleConfig({ roiFloor, spendFloor })
  const items = rows.map(e => {
    const oc = liveConclusion(e, cfg)
    return {
      exp: e, oc, conclusion: oc.conclusion,
      alerts: experimentAlerts({
        exp: e, session: e.source_session_id ? bySession.get(String(e.source_session_id)) : null, latestSeen,
      }),
    }
  })
  const tiles = buildTiles(items)
  const active = resolveFilter(tiles, filter)
  const shown = applyFilter(items, active)
  const running = shown.filter(it => it.exp.status === 'RUNNING')
  const done = shown.filter(it => it.exp.status !== 'RUNNING')
  const nRunning = rows.filter(r => r.status === 'RUNNING').length
  // Selama bundel server lama masih terpasang, barisnya tetap berformat lama.
  const nLegacy = items.filter(it => it.oc.format === 'legacy').length
  const row = (it) => (
    <ExperimentRow key={it.exp.id} it={it} cfg={cfg} productNames={productNames}
      onChanged={reload} onOpen={() => setDetail(it.exp)} />
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-ink-muted">{nRunning} berjalan · {rows.length - nRunning} selesai</p>
        <button onClick={() => setShowForm(v => !v)} className="text-sm px-3 py-1.5 rounded-lg bg-accent/15 text-accent font-medium hover:bg-accent/20">
          {showForm ? 'Tutup form' : '+ Eksperimen baru'}
        </button>
      </div>

      <RoiFloorSetting key={String(roiFloor)} roiFloor={roiFloor} onSaved={setRoiFloor} />

      {showForm && <ExperimentForm draft={draft} onDone={() => { setShowForm(false); onDraftUsed?.(); reload() }} onCancel={() => { setShowForm(false); onDraftUsed?.() }} />}

      {rows.length === 0 && !showForm && (
        <EmptyState title="Belum ada eksperimen" desc="Catat aksi (mis. boost, uji kreatif) sebagai eksperimen untuk melacak hasilnya dibanding sebelum mulai." />
      )}

      {rows.length > 0 && <>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
          {tiles.map(t => <Tile key={t.key} tile={t} active={t.key === active} onClick={() => setFilter(t.key)} />)}
        </div>
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-ink-faint">
          {BUCKETS.map(b => (
            <span key={b} className="inline-flex items-center gap-1.5">
              <i className={`w-2 h-2 rounded-sm ${VERDICT[b].bar}`} />{VERDICT[b].label}
            </span>
          ))}
          <span className="ml-auto">{shown.length} dari {rows.length} ditampilkan · klik baris untuk rincian</span>
        </div>
        {nLegacy > 0 && (
          <p className="text-[11px] text-ink-faint">
            {nLegacy} eksperimen masih dinilai dengan aturan lama (tiga hari tunggal) — menunggu server menghitung ulang dengan total hari ke-1–3 dan ke-1–7.
          </p>
        )}
      </>}

      {running.length > 0 && <div className="space-y-1.5">
        <h4 className="text-xs font-semibold text-ink-faint uppercase tracking-wider">Berjalan</h4>
        {running.map(row)}
      </div>}
      {done.length > 0 && <div className="space-y-1.5">
        <h4 className="text-xs font-semibold text-ink-faint uppercase tracking-wider">Selesai</h4>
        {done.map(row)}
      </div>}

      {detail && (
        <ExperimentDetailDrawer exp={detail} cfg={cfg} onNavigate={onNavigate}
          onClose={() => setDetail(null)} onChanged={reload} />
      )}
    </div>
  )
}

// Ubin ringkasan = saringan. Garis di bawah angka = sebaran vonis kelompok itu.
function Tile({ tile, active, onClick }) {
  const warn = tile.key === CLOSE
  const [Icon] = tile.key === ALL ? [LayoutGrid] : warn ? [TriangleAlert] : typeIcon(tile.type)
  const label = tile.key === ALL ? 'Semua' : warn ? 'Perlu ditutup' : typeLabel(tile.type)
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={label}
      className={`text-left rounded-xl border p-3 transition-colors ${active
        ? 'border-accent/60 bg-accent/[0.07]' : 'border-line/15 bg-surface hover:border-line/30'}`}>
      <div className={`flex items-center gap-1.5 text-[11px] ${warn ? 'text-amber-400' : 'text-ink-muted'}`}>
        <Icon size={13} className="shrink-0" /><span className="truncate">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-ink-strong leading-tight mt-0.5">{tile.total}</div>
      <div className="flex h-1 gap-0.5 mt-2 rounded-full overflow-hidden">
        {BUCKETS.filter(b => tile[b] > 0).map(b => (
          <i key={b} className={VERDICT[b].bar} style={{ flexGrow: tile[b], flexBasis: 0 }}
            title={`${VERDICT[b].label}: ${tile[b]}`} />
        ))}
      </div>
    </button>
  )
}

// Peringatan diringkas jadi satu frasa di baris. SENGAJA tak mengubah status apa
// pun: mesin memberi tahu, pemilik yang memutuskan (lihat gmvmaxExperimentAlerts.js).
function alertText(alerts) {
  const ended = alerts.find(a => a.kind === 'BOOST_ENDED')
  const passed = alerts.find(a => a.kind === 'WINDOW_PASSED')
  return [
    // lastSeen = STEMPEL potret (tanggal data kemarin); potretnya diambil pagi
    // berikutnya, jadi boost terakhir terlihat pada lastSeen + 1.
    ended && `boost terakhir terlihat ${fmtDayID(addDaysISO(String(ended.lastSeen).slice(0, 10), 1))}`,
    passed && `jendela 7 hari lewat (${passed.days} hari)${passed.missing > 0 ? `, ${passed.missing} hari datanya belum masuk` : ''}`,
  ].filter(Boolean).join(' · ')
}

// Satu eksperimen = satu baris; rincian, Tutup, dan Hapus ada di drawer detail.
// Tombol Tutup hanya muncul di baris yang berperingatan, supaya bersih-bersih
// tak perlu membuka drawer satu per satu.
// Kotak jendela di baris daftar (aturan v2): "3 hr 4,9x · Rp237 rb". Warna
// hanya bila jendelanya memang dinilai; kalau tidak, kotaknya netral dan
// menyebut sebabnya — ROI raksasa dari belanja receh tak lagi berwarna hijau.
function WindowPill({ w, cfg, direction }) {
  if (!w) return null
  const n = w.days
  const roi = w.spend > 0 ? w.revenue / w.spend : null
  // Satu syarat dengan aturan vonis (cukup hari berdata, lantai, arah aksi).
  const judged = windowJudged(w, cfg, direction)
  const tone = !judged ? 'bg-fill/5 text-ink-muted' : roi >= cfg.roiFloor ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
  // ROI hanya ditulis bila belanjanya mencapai lantai: "200x" dari Rp450 bukan
  // informasi, walau kotaknya abu-abu.
  const enough = w.spend > 0 && w.spend >= cfg.spendFloor
  const text = w.counted === 0 ? (w.complete ? 'tak ada data' : 'menunggu')
    : !enough ? `belanja ${fmtRpTinyID(w.spend)}`
      : !w.complete ? `${fmtRoiVsFloorID(roi, cfg.roiFloor)} · ${w.counted}/${n} hari`
        : `${fmtRoiVsFloorID(roi, cfg.roiFloor)} · ${fmtRpTinyID(w.spend)}`
  const why = w.counted === 0 ? '' : !w.complete ? ` — baru ${w.counted} dari ${n} hari` : w.spend < cfg.spendFloor ? ` — belanja di bawah lantai ${fmtRpRbID(cfg.spendFloor)}` : ''
  return (
    <span className={`text-[11px] rounded-md px-1.5 py-1 tabular-nums whitespace-nowrap ${tone}`}
      title={`Hari 1–${n}: ROI gabungan ${fmtRoiVsFloorID(roi, cfg.roiFloor)} dari belanja ${fmtRpRbID(w.spend)}${why}`}>
      <span className="opacity-60">{n} hr</span> {text}
    </span>
  )
}

function ExperimentRow({ it, cfg, productNames, onChanged, onOpen }) {
  const { exp: e, oc, alerts } = it
  const roiFloor = cfg.roiFloor
  const isV2 = oc.format === 'v2'
  const noun = e.experiment_type === 'MANUAL_BOOST' || e.experiment_type === 'ACCELERATE_TESTING' ? 'boost' : 'perubahan'
  const [busy, setBusy] = useState(false)
  const checkpoints = Array.isArray(e.checkpoints) ? e.checkpoints : []
  const [Icon, tint] = typeIcon(e.experiment_type)
  const direction = actionDirection(e)
  // Dua pembatas vonis dari LUAR eksperimen — keduanya diberi tanda kuning.
  const mixed = isContaminated(e)
  const overlapDay = isV2 ? (windowOf(checkpoints, 'w7')?.overlap_day ?? null) : null
  const v = VERDICT[verdictBucket(oc.conclusion)]
  const warn = alertText(alerts)
  const pid = e.product_id ? String(e.product_id).trim() : null
  // Tanggal mulai = hari ke-1 jendela (WIB), bukan tanggal menurut zona peramban.
  const sub = [typeLabel(e.experiment_type), pid && (productNames?.[pid] || `produk ${pid}`), `mulai ${dayOne(e) ? fmtDayID(dayOne(e)) : '—'}`]
    .filter(Boolean).join(' · ')
  // Warna checkpoint hanya bila ambang ROI diisi — tanpa ambang tak ada patokan.
  const cpTone = (roi) => (roi == null || roiFloor == null ? 'bg-fill/5 text-ink-muted'
    : roi >= roiFloor ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')
  async function close(ev) {
    ev.stopPropagation()
    setBusy(true)
    try { await closeExperiment(e); onChanged() } catch (err) { alert('Gagal: ' + err.message); setBusy(false) }
  }
  return (
    <div onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(ev) => { if (ev.key === 'Enter') onOpen?.() }}
      className="rounded-xl border border-line/15 bg-surface px-3 py-2.5 cursor-pointer hover:border-line/30 transition-colors flex items-center gap-x-3 gap-y-2 flex-wrap md:flex-nowrap">
      <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${tint}`}><Icon size={15} /></span>
      <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] md:basis-0">
        <p className="text-sm text-ink-strong truncate">{e.treatment || '—'}</p>
        <p className="text-[11px] text-ink-faint md:truncate" title={warn ? `${sub} · ${warn}` : sub}>
          {sub}{warn && <span className="text-amber-400"> · {warn}</span>}
        </p>
      </div>
      {/* Lebar kolom dipatok di layar lebar supaya vonis sejajar antarbaris. */}
      <div className={`gap-1 shrink-0 md:w-[17rem] md:justify-end ${checkpoints.length ? 'flex' : 'hidden md:flex'}`}>
        {isV2 && <><WindowPill w={windowOf(checkpoints, 'w3')} cfg={cfg} direction={direction} /><WindowPill w={windowOf(checkpoints, 'w7')} cfg={cfg} direction={direction} /></>}
        {!isV2 && checkpoints.map((c, i) => (
          <span key={c.label || i} className={`text-[11px] rounded-md px-1.5 py-1 tabular-nums ${cpTone(c.roi)}`}
            title={c.roi_delta_vs_baseline != null
              ? `${c.label}: ${fmtSignedX(Number(c.roi_delta_vs_baseline))} dibanding sebelum mulai` : c.label}>
            <span className="opacity-60">{c.label}</span> {c.roi != null ? fmtRoiID(Number(c.roi)) : '—'}
          </span>
        ))}
      </div>
      <span title={[isV2 || oc.code === 'NOT_EVALUATED' ? verdictReasonID(oc, { noun }) : '', CONFIDENCE_LABEL[oc.confidence] ? `Keyakinan ${CONFIDENCE_LABEL[oc.confidence]}.` : '', mixed ? 'Tercampur perubahan lain.' : '', overlapDay != null ? `Ada boost lain pada video/produk yang sama mulai hari ke-${overlapDay}.` : ''].filter(Boolean).join(' ') || undefined}
        className={`shrink-0 text-[11px] font-medium rounded-full px-2.5 py-1 md:w-48 truncate text-center ${v.badge}`}>
        {(mixed || overlapDay != null) && <span className="text-amber-400" aria-label={mixed ? 'Tercampur' : 'Ada boost lain'}>● </span>}
        {CONCLUSION_LABEL[oc.conclusion] || oc.conclusion}{oc.provisional && isV2 ? ' · sementara' : ''}
      </span>
      <span className={`shrink-0 md:w-14 justify-end ${warn ? 'flex' : 'hidden md:flex'}`}>
        {warn && <button disabled={busy} onClick={close}
          title="Menutup catatan eksperimen saja — tidak menghentikan iklan di TikTok"
          className="shrink-0 text-[11px] font-medium text-amber-200 border border-amber-500/40 rounded-lg px-2.5 py-1 hover:bg-amber-500/10 disabled:opacity-50">
          Tutup
        </button>}
      </span>
    </div>
  )
}

function ExperimentForm({ draft, onDone, onCancel }) {
  // Tanggal WIB: tanggal mulai menjadi hari ke-1 jendela vonis, jadi formulir
  // yang dibuka pukul 00.00–06.59 WIB tidak boleh terisi tanggal kemarin (UTC).
  const today = wibDateOf(new Date().toISOString())
  const [f, setF] = useState({
    experiment_type: draft?.experiment_type || 'MANUAL_BOOST',
    treatment: draft?.treatment || '',
    product_id: draft?.product_id || '',
    campaign_id: draft?.campaign_id || '',
    creative_video_id: draft?.creative_video_id || '',
    stop_condition: draft?.stop_condition || '',
    baseline_start: addDaysISO(today, -3),
    baseline_end: addDaysISO(today, -1),
    start_at: today,
    notes: draft?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))

  async function save() {
    if (!f.treatment.trim()) { setErr('Isi "Perlakuan" (apa yang diubah).'); return }
    setSaving(true); setErr(null)
    try {
      await createExperiment({ ...f, start_at: new Date(f.start_at).toISOString() })
      onDone()
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  const inp = 'w-full px-3 py-2 rounded-lg bg-surface border border-line/15 text-sm text-ink'
  const lbl = 'text-[11px] text-ink-faint uppercase tracking-wide mb-1 block'
  return (
    <div className="rounded-xl border border-line/20 bg-fill/[0.03] p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className={lbl}>Jenis eksperimen</label>
          <select value={f.experiment_type} onChange={set('experiment_type')} className={inp}>
            {EXPERIMENT_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div><label className={lbl}>Perlakuan (satu hal yang diubah)</label>
          <input value={f.treatment} onChange={set('treatment')} placeholder="mis. naikkan budget 20% / boost video X" className={inp} /></div>
        <div><label className={lbl}>Product ID (opsional)</label><input value={f.product_id} onChange={set('product_id')} className={inp} /></div>
        <div><label className={lbl}>Video ID / Campaign ID (opsional)</label><input value={f.creative_video_id} onChange={set('creative_video_id')} className={inp} /></div>
        <div><label className={lbl}>Sebelum mulai — dari</label><input type="date" value={f.baseline_start} onChange={set('baseline_start')} className={inp} /></div>
        <div><label className={lbl}>Sebelum mulai — sampai</label><input type="date" value={f.baseline_end} onChange={set('baseline_end')} className={inp} /></div>
        <div><label className={lbl}>Mulai eksperimen</label><input type="date" value={f.start_at} onChange={set('start_at')} className={inp} /></div>
        <div><label className={lbl}>Hentikan bila</label><input value={f.stop_condition} onChange={set('stop_condition')} placeholder="mis. ROI < 3x 2 hari berturut" className={inp} /></div>
      </div>
      <div><label className={lbl}>Catatan (opsional)</label><input value={f.notes} onChange={set('notes')} className={inp} /></div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex items-center gap-2">
        <button disabled={saving} onClick={save} className="text-sm px-4 py-2 rounded-lg bg-accent text-white font-medium disabled:opacity-50">{saving ? 'Menyimpan…' : 'Simpan eksperimen'}</button>
        <button disabled={saving} onClick={onCancel} className="text-sm px-3 py-2 rounded-lg text-ink-muted border border-line/20">Batal</button>
      </div>
      <p className="text-[11px] text-ink-faint">Vonis dihitung otomatis tiap pagi dari total hari ke-1–3 dan hari ke-1–7 (tanggal mulai = hari ke-1). Hanya pencatatan — tidak mengubah apa pun di TikTok.</p>
    </div>
  )
}

// Setelan ambang ROI vonis (roiFloor) per-workspace. Simpan → vonis kartu langsung
// terhitung ulang (client) + server ikut memakainya pada eval harian berikutnya.
function RoiFloorSetting({ roiFloor, onSaved }) {
  const [val, setVal] = useState(roiFloor == null ? '' : String(roiFloor))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  async function save(value) {
    setSaving(true); setMsg(null)
    try { const v = await saveExperimentRoiFloor(value); onSaved(v); setMsg(v == null ? 'Direset' : 'Tersimpan') }
    catch (e) { setMsg(e.message) } finally { setSaving(false) }
  }
  return (
    <div className="rounded-xl border border-line/15 bg-fill/[0.03] p-3 flex items-center gap-3 flex-wrap">
      <div className="text-sm text-ink">
        <span className="font-medium">Ambang ROI vonis</span>
        <span className="text-ink-faint text-xs ml-2">ROI ≥ angka ini = kandidat menang; kosong = belum ada vonis (belum konklusif)</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <input type="number" step="0.1" min="0" value={val} onChange={e => setVal(e.target.value)} placeholder="mis. 5"
          className="w-24 px-3 py-1.5 rounded-lg bg-surface border border-line/15 text-sm text-ink" />
        <span className="text-ink-faint text-sm">x</span>
        <button disabled={saving} onClick={() => save(val)} className="text-sm px-3 py-1.5 rounded-lg bg-accent/15 text-accent font-medium disabled:opacity-50">Simpan</button>
        {roiFloor != null && <button disabled={saving} onClick={() => save(null)} className="text-xs text-ink-muted hover:text-ink">reset</button>}
        {msg && <span className="text-xs text-ink-faint">{msg}</span>}
      </div>
    </div>
  )
}
