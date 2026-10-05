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
    // Produk di campaign (item_group_ids) — array, dibandingkan sebagai HIMPUNAN.
    // Datanya sudah lama ikut terpotret tapi tak pernah dibandingkan, sehingga
    // tambah/cabut produk lewat Ads Manager selama ini tak terlihat.
    const pi = Array.isArray(p.item_group_ids) ? p.item_group_ids.map(String) : []
    const ci = Array.isArray(c.item_group_ids) ? c.item_group_ids.map(String) : []
    const added = ci.filter(x => !pi.includes(x))
    const removed = pi.filter(x => !ci.includes(x))
    if (added.length || removed.length) {
      out.push({ campaign_id: c.campaign_id, campaign_name: c.campaign_name, field: 'item_group_ids', label: 'Produk',
        from: `${pi.length} produk`, to: `${ci.length} produk (${added.length ? `+${added.length}` : ''}${added.length && removed.length ? ' ' : ''}${removed.length ? `-${removed.length}` : ''})`,
        added, removed, money: false })
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
// → [{ date, prev_date, modify_time, campaign_id, campaign_name, field, label, from, to, money }]
// prev_date = label potret pembanding; perubahannya terjadi SETELAH potret itu
// (dipakai gmvmaxChangeImpact untuk menetapkan hari perubahan).
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
      out.push({ ...ch, date: dates[i], prev_date: dates[i - 1], modify_time: src?.modify_time || null })
    }
  }
  return out.reverse() // terbaru dulu
}

const HARI = 86400000

// Potret HASIL BACKFILL bukan riwayat. Potret berlabel D normalnya diambil D+1
// ±07.30 WIB. Backfill (`gmvmax-run --date D` berhari-hari kemudian) memanggil
// info_get yang hanya mengenal keadaan SEKARANG, lalu menstempelnya ke tanggal D
// — sehingga perubahan 29 Sep tampak terjadi 27 Sep, berbalik 28 Sep, lalu
// terjadi lagi (kejadian nyata 5 Okt 2026). Dua tanda, salah satu cukup:
//   • barisnya DIBUAT lebih dari sehari setelah labelnya (potret baru), atau
//   • modify_time TikTok lebih baru dari saat potret itu semestinya diambil
//     (potret lama yang ditimpa: upsert tak mengubah created_at).
// Seluruh potret tanggal itu dibuang; diff lalu membandingkan potret asli di
// kiri-kanannya, dan hari itu terbaca sebagai hari tak terpotret (apa adanya).
export function dropBackfilledSnapshots(rows = []) {
  const bad = new Set()
  for (const r of rows) {
    if (!r.snapshot_date || bad.has(r.snapshot_date)) continue
    const batas = Date.parse(`${r.snapshot_date}T00:00:00Z`) + 2 * HARI // D+2 00.00 UTC
    const dibuat = r.created_at ? Date.parse(r.created_at) : NaN
    const diubah = r.modify_time ? Date.parse(r.modify_time) : NaN
    if (dibuat >= batas || diubah >= batas) bad.add(r.snapshot_date)
  }
  return bad.size ? rows.filter(r => !bad.has(r.snapshot_date)) : rows
}
