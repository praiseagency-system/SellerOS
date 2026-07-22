// Campaign Ads — setting campaign (budget, target ROAS, auto-budget, status)
// digabung dengan performa periode terpilih. Setting dari gmvmax_campaign_settings
// (di-capture worker harian via MCP campaign_gmv_max_info_get); performa dari
// rollupCampaigns (di-join pakai campaignId). Bagian bawah: log perubahan
// otomatis hasil diff antar-hari.
import { useState, useEffect, useMemo } from 'react'
import { Megaphone, TrendingUp, Wallet, Target, Info, History, Loader2 } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { EmptyState, StatCard, fmtRp, fmtRpC, fmtRoasX } from '../../components/gmvmax/ui'
import { loadCampaignSettingsHistory, latestPerCampaign } from '../../data/gmvmaxCampaignSettings'
import { buildChangeLog } from '../../utils/gmvmaxCampaignDiff'

const n = (v) => (v || 0).toLocaleString('id-ID')
const isOn = (s) => s === 'ENABLE'

export default function CampaignAdsPage({ onOpenUpload }) {
  const { campaigns, hasData, periodName } = useGmvMax()
  const [settings, setSettings] = useState([])
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setErr(null)
    loadCampaignSettingsHistory({ days: 30 })
      .then(rows => { if (!active) return; setSettings(latestPerCampaign(rows)); setChanges(buildChangeLog(rows)) })
      .catch(e => { if (active) setErr(e.message || 'Gagal memuat setting campaign.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // Gabung setting (by campaign_id) + performa (by campaignId).
  const merged = useMemo(() => {
    const perf = new Map((campaigns || []).filter(c => c.campaignId).map(c => [c.campaignId, c]))
    const out = settings.map(s => ({
      id: s.campaign_id, name: s.campaign_name || s.campaign_id, s,
      p: perf.get(s.campaign_id) || null,
    }))
    // Campaign yang punya belanja tapi belum ter-capture settingnya.
    for (const c of campaigns || []) {
      if (c.campaignId && !settings.some(s => s.campaign_id === c.campaignId)) {
        out.push({ id: c.campaignId, name: c.campaign, s: null, p: c })
      }
    }
    return out.sort((a, b) => (b.p?.total.revenue || 0) - (a.p?.total.revenue || 0)
      || (Number(b.s?.budget) || 0) - (Number(a.s?.budget) || 0))
  }, [settings, campaigns])

  const sum = useMemo(() => {
    const act = merged.filter(m => isOn(m.s?.operation_status))
    // Budget "aktif" = HANYA campaign ENABLE yang benar-benar BELANJA (spend > 0).
    // Campaign ENABLE tapi spend 0 tak menyerap budget → tak dihitung, biar angka
    // mencerminkan budget yang benar-benar jalan (bukan kapasitas terpasang).
    const spending = act.filter(m => (m.p?.total.cost || 0) > 0)
    return {
      total: merged.length,
      aktif: act.length,
      spendingCount: spending.length,
      budget: spending.reduce((a, m) => a + (Number(m.s?.budget) || 0), 0),
      spend: merged.reduce((a, m) => a + (m.p?.total.cost || 0), 0),
      revenue: merged.reduce((a, m) => a + (m.p?.total.revenue || 0), 0),
    }
  }, [merged])

  if (!hasData) return <EmptyState title="Belum ada data GMV Max" desc="Upload dulu di Import Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  if (loading) return <div className="flex items-center justify-center py-32 text-ink-faint gap-2">
    <Loader2 className="w-5 h-5 animate-spin" /> Memuat setting campaign…
  </div>

  const roas = sum.spend > 0 ? sum.revenue / sum.spend : null
  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {periodName && <p className="text-sm text-ink-muted -mb-1">{periodName} <span className="text-ink-faint">· performa periode ini · setting = kondisi terkini</span></p>}

      {err && (
        <p className="text-xs text-amber-300 flex items-start gap-1.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{err} — setting di-capture worker harian; kalau tabelnya baru dibuat, tunggu run berikutnya.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Megaphone} tone="violet" label="Campaign" value={n(sum.total)} sub={`${n(sum.aktif)} aktif`} />
        <StatCard icon={Wallet} tone="amber" label="Budget harian (aktif)" value={fmtRpC(sum.budget)} sub={`${n(sum.spendingCount)} campaign belanja (spend > 0)`} />
        <StatCard icon={TrendingUp} tone="green" label="Revenue periode" value={fmtRpC(sum.revenue)} sub={`spend ${fmtRpC(sum.spend)}`} />
        <StatCard icon={Target} tone="blue" label="ROAS periode" value={fmtRoasX(roas)} />
      </div>

      <div className="space-y-3">
        {merged.map(m => <CampaignCard key={m.id} m={m} />)}
        {merged.length === 0 && (
          <p className="text-sm text-ink-faint text-center py-10">
            Belum ada setting campaign ter-capture. Worker mengambilnya tiap hari — cek lagi setelah run berikutnya.
          </p>
        )}
      </div>

      <ChangeLog changes={changes} />
    </div>
  )
}

function CampaignCard({ m }) {
  const { s, p, name } = m
  const on = isOn(s?.operation_status)
  const ab = s?.auto_budget || {}
  const budget = Number(s?.budget) || 0
  const bid = s?.roas_bid != null ? Number(s.roas_bid) : null
  const actual = p?.total.roas ?? null
  const gap = bid != null && actual != null ? actual - bid : null
  const headroom = ab.auto_budget_enabled && ab.maximum_budget
    ? Math.min(100, (Number(ab.current_budget || budget) / Number(ab.maximum_budget)) * 100) : null

  return (
    <div className={`rounded-xl p-4 border ${on ? 'glass-card border-line/10' : 'bg-surface border-line/8 opacity-75'}`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-sm font-semibold text-ink-strong truncate">{name}</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${on ? 'bg-emerald-500/15 text-emerald-400' : 'bg-fill/10 text-ink-faint'}`}>
          {s?.operation_status || '—'}
        </span>
        {s?.promotion_type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{s.promotion_type.replace('_GMV_MAX', '')}</span>}
        {s?.modify_time && <span className="ml-auto text-[10px] text-ink-faint">diubah {new Date(s.modify_time).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Cell label="Budget harian" value={s ? fmtRp(budget) : '—'} />
        <Cell label="Target ROAS (bid)" value={bid != null ? `${bid}x` : '—'} />
        <Cell label="ROAS aktual" value={fmtRoasX(actual)}
          tone={gap == null ? 'ink' : gap >= 0 ? 'green' : 'red'} />
        <Cell label="Spend / Revenue" value={p ? `${fmtRpC(p.total.cost)} / ${fmtRpC(p.total.revenue)}` : 'tanpa belanja'} />
      </div>

      {headroom != null && (
        <div className="bg-fill/5 rounded-lg p-2.5">
          <div className="flex justify-between text-[11px] text-ink-muted mb-1.5">
            <span>Auto-budget ON · +{ab.budget_increase_percentage}%/naik · sisa {ab.remained_times ?? '—'}x</span>
            <span>{fmtRpC(ab.current_budget)} → maks {fmtRpC(ab.maximum_budget)}</span>
          </div>
          <div className="h-1.5 bg-fill/10 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${headroom}%` }} />
          </div>
          {ab.next_increase != null && <p className="text-[10px] text-ink-faint mt-1.5">Kenaikan berikutnya: {fmtRp(ab.next_increase)}</p>}
        </div>
      )}
      {s && !ab.auto_budget_enabled && <p className="text-[10px] text-ink-faint">Auto-budget OFF</p>}

      {gap != null && p?.total.cost > 0 && (
        <p className={`mt-2.5 text-xs rounded-lg px-2.5 py-2 ${gap >= 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
          {gap >= 0
            ? `ROAS aktual ${(actual / bid).toFixed(1)}× di atas target — kandidat naikkan budget.`
            : `ROAS aktual di bawah target (${fmtRoasX(actual)} vs ${bid}x) — tinjau bid/kreatif.`}
        </p>
      )}
    </div>
  )
}

const TONE = { green: 'text-emerald-400', red: 'text-red-400', ink: 'text-ink-strong' }
function Cell({ label, value, tone = 'ink' }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-ink-faint uppercase tracking-wide truncate">{label}</p>
      <p className={`text-sm font-semibold tabular-nums truncate ${TONE[tone]}`}>{value}</p>
    </div>
  )
}

function ChangeLog({ changes }) {
  const fmtVal = (v, money) => (v == null || v === '' ? '—' : money ? fmtRp(Number(v)) : String(v))
  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-ink-strong mb-1 flex items-center gap-2">
        <History className="w-4 h-4 text-blue-400" /> Perubahan setting
      </h3>
      <p className="text-[11px] text-ink-faint mb-3">
        Terdeteksi otomatis dari perbandingan snapshot harian. Muncul juga di Log Optimasi.
      </p>
      {changes.length === 0 ? (
        <p className="text-xs text-ink-faint py-4 text-center">
          Belum ada perubahan terdeteksi. Riwayat mulai terkumpul sejak capture pertama — perubahan akan tampil di sini begitu budget/bid/status diubah.
        </p>
      ) : (
        <div className="space-y-1.5">
          {changes.slice(0, 30).map((c, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm border-b border-line/5 pb-1.5 last:border-0">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 mt-0.5">auto</span>
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate">
                  {c.label} <span className="text-ink-faint">{fmtVal(c.from, c.money)}</span>
                  <span className="text-ink-faint"> → </span>
                  <span className="font-semibold text-ink-strong">{fmtVal(c.to, c.money)}</span>
                  <span className="text-ink-faint"> · {c.campaign_name}</span>
                </p>
                <p className="text-[10px] text-ink-faint">{c.date}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
