// Registry advertiser yang eligible. BISA >1 entri per workspaceId → worker
// MENJUMLAHKAN (satu store, akun ads bermigrasi). Sumber kebenaran pemetaan —
// JANGAN tebak store/workspace di tempat lain.
export const ADVERTISERS = [
  {
    advertiserId: '7313535999831769090',
    storeId: '7495201716088572081',
    workspaceId: '10280d7b-2994-4a40-b639-2d88e0e2018b',
    label: 'AsterixSty',
  },
  // Dasfelix — MIGRASI AKUN ADS 2026-07-19 (store sama 7494949073431268328).
  // Akun lama winding-down + akun baru mulai → dijumlahkan; sum menangani seluruh
  // timeline otomatis (sebelum 19 Jul akun baru=0; sesudah akun lama→0).
  {
    advertiserId: '7214793879483170817',
    storeId: '7494949073431268328',
    workspaceId: 'c420074f-d4a6-4e6d-bf8e-2d0234b575d7',
    label: 'Dasfelix Store (akun lama)',
  },
  {
    advertiserId: '7663429402298089480',
    storeId: '7494949073431268328',
    workspaceId: 'c420074f-d4a6-4e6d-bf8e-2d0234b575d7',
    label: 'Dasfelix (akun baru)',
  },
]

export function eligibleAdvertisers() { return ADVERTISERS }

// Kelompokkan entri per workspaceId → [{ workspaceId, label, entries[] }].
// Worker memproses per-workspace: jalankan engine tiap advertiser lalu GABUNG
// jadi 1 snapshot (workspace,tanggal). Mempertahankan urutan kemunculan pertama.
export function groupByWorkspace(list) {
  const map = new Map()
  for (const a of list) {
    if (!map.has(a.workspaceId)) map.set(a.workspaceId, { workspaceId: a.workspaceId, label: a.label, entries: [] })
    map.get(a.workspaceId).entries.push(a)
  }
  return [...map.values()]
}
export function findAdvertiser(id) {
  const a = ADVERTISERS.find(x => x.advertiserId === id)
  if (!a) throw new Error(`advertiser tak dikenal/eligible: ${id} (tambahkan ke advertisers.mjs)`)
  return a
}
