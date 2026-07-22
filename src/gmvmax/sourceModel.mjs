// GMV Max — DATE-EFFECTIVE ADVERTISER SOURCE MODEL (provenance hardening, STAGED).
// PURE & deterministic. Menghitung himpunan advertiser AKTIF untuk sebuah tanggal
// dari membership OTORITATIF (gmvmax_tenant_advertisers) — bukan static registry
// advertisers.mjs. Memperbaiki isu 7214 (LEGACY inactive) yang masih ditarik pada
// tanggal pasca-migrasi. Modul ini TIDAK mengubah canonical writer; hanya fungsi
// murni untuk diintegrasikan NANTI setelah disetujui. Tidak ada DB/TikTok/LLM.

// Advertiser aktif pada `date` (YYYY-MM-DD) menurut jendela efektif membership:
//   effective_from ≤ date ≤ effective_to (inklusif).
//   - Ada effective_to → itu = hari aktif TERAKHIR (LEGACY yang bermigrasi).
//   - Tanpa effective_to → pakai flag is_active saat ini.
// Ini yang membedakan:
//   date < migrasi        → 7214 masih required
//   date = tanggal transisi → 7214 + 7663 keduanya required
//   date > migrasi        → hanya 7663; 7214 historical lineage saja.
export function activeOnDate(adv, date) {
  const from = adv?.metadata?.effective_from ?? adv?.effective_from ?? null
  const to = adv?.metadata?.effective_to ?? adv?.effective_to ?? null
  if (from && date < from) return false
  if (to) return date <= to
  return adv?.is_active !== false
}

// Bagi membership → { expected (aktif date-effective), historical (sisanya) }.
// Deterministik: urut by priority lalu advertiser_id. Membership tetap dipertahankan
// di lineage (historical), TIDAK dihapus — hanya dikeluarkan dari expected-sources.
export function resolveDateEffectiveSources(tenantAdvertisers = [], date) {
  const rows = [...(tenantAdvertisers || [])].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0) || String(a.advertiser_id).localeCompare(String(b.advertiser_id)),
  )
  const expected = [], historical = []
  for (const a of rows) {
    const entry = {
      advertiser_id: a.advertiser_id,
      role: a.advertiser_role ?? a.role ?? null,
      is_active: a.is_active !== false,
      effective_to: a?.metadata?.effective_to ?? a?.effective_to ?? null,
    }
    ;(activeOnDate(a, date) ? expected : historical).push(entry)
  }
  return { date, expected, historical, expected_count: expected.length }
}

// Peta baris gmvmax_tenant_advertisers → target penarikan canonical untuk sebuah
// tanggal: HANYA advertiser yang date-effective active (historical dikeluarkan).
// Bentuk target kompatibel groupByWorkspace: { workspaceId, storeId, advertiserId, advertiserRole }.
// PURE — writer/loader yang menyuntik baris; di sini hanya transformasi.
export function advertiserTargetsForDate(tenantAdvertisers = [], date) {
  const byWs = new Map()
  for (const r of tenantAdvertisers || []) {
    if (!byWs.has(r.workspace_id)) byWs.set(r.workspace_id, [])
    byWs.get(r.workspace_id).push(r)
  }
  const targets = []
  for (const [ws, rows] of byWs) {
    const { expected } = resolveDateEffectiveSources(rows, date)
    for (const e of expected) {
      const row = rows.find(r => r.advertiser_id === e.advertiser_id)
      targets.push({ workspaceId: ws, storeId: row?.store_id ?? null, advertiserId: e.advertiser_id, advertiserRole: e.role })
    }
  }
  return targets
}
