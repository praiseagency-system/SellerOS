// Diff setting campaign antar-hari → daftar perubahan untuk Log Optimasi.
// CATATAN: logika ini KEMBARAN dari src/gmvmax/campaignSettings.mjs (worker).
// Sengaja diduplikasi karena src/gmvmax/ TIDAK ikut repo webapp (di-deploy via
// bundle ke VPS) — meng-import dari sana akan menggagalkan build Vercel.
// Kalau aturan diubah, ubah di KEDUA tempat.

// Bidang yang perubahannya layak dicatat.
const WATCHED = [
  { key: 'budget', label: 'Budget', money: true },
  { key: 'roas_bid', label: 'Target ROAS' },
  { key: 'operation_status', label: 'Status' },
  { key: 'deep_bid_type', label: 'Tipe bid' },
  { key: 'optimization_goal', label: 'Goal optimasi' },
]

// Diff 2 snapshot (hari sebelum → hari ini). prev/cur = array baris settings.
export function diffSettings(prev = [], cur = []) {
  const byId = new Map(prev.map(r => [r.campaign_id, r]))
  const out = []
  for (const c of cur) {
    const p = byId.get(c.campaign_id)
    if (!p) {
      out.push({ campaign_id: c.campaign_id, campaign_name: c.campaign_name, field: '_new', label: 'Campaign baru', from: null, to: c.campaign_name, money: false })
      continue
    }
    for (const { key, label, money } of WATCHED) {
      const a = p[key], b = c[key]
      if (a == null && b == null) continue
      if (String(a) !== String(b)) out.push({ campaign_id: c.campaign_id, campaign_name: c.campaign_name, field: key, label, from: a, to: b, money: !!money })
    }
    const pa = p.auto_budget || {}, ca = c.auto_budget || {}
    if (String(pa.auto_budget_enabled) !== String(ca.auto_budget_enabled)) {
      out.push({ campaign_id: c.campaign_id, campaign_name: c.campaign_name, field: 'auto_budget_enabled', label: 'Auto-budget', from: pa.auto_budget_enabled ? 'ON' : 'OFF', to: ca.auto_budget_enabled ? 'ON' : 'OFF', money: false })
    }
  }
  return out
}

// Riwayat datar (semua tanggal) → daftar perubahan ber-tanggal, terbaru dulu.
// rows = seluruh baris gmvmax_campaign_settings (urut tanggal naik).
// → [{ date, modify_time, campaign_id, campaign_name, field, label, from, to, money }]
export function buildChangeLog(rows = []) {
  const byDate = new Map()
  for (const r of rows) {
    if (!byDate.has(r.snapshot_date)) byDate.set(r.snapshot_date, [])
    byDate.get(r.snapshot_date).push(r)
  }
  const dates = [...byDate.keys()].sort()
  const out = []
  for (let i = 1; i < dates.length; i++) {
    const prev = byDate.get(dates[i - 1])
    const cur = byDate.get(dates[i])
    for (const ch of diffSettings(prev, cur)) {
      const src = cur.find(x => x.campaign_id === ch.campaign_id)
      out.push({ ...ch, date: dates[i], modify_time: src?.modify_time || null })
    }
  }
  return out.reverse() // terbaru dulu
}
