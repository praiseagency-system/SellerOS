// Pembantu MURNI untuk sesi boost. Terpisah dari data/gmvmaxBoostSessions.js
// karena berkas data mengimpor klien Supabase, dan klien itu membangun
// RealtimeClient saat modul dimuat — di Node 20 (yang dipakai CI) itu melempar
// "Node.js 20 detected without native WebSocket support". Logika murni di sini
// bisa diuji tanpa menyeret satu pun dependensi runtime.

// Satu sesi muncul di SETIAP potret harian selama ia masih berjalan. Yang
// menarik bagi pembaca adalah SESI-nya, bukan penampakan hariannya — jadi
// digabung: penampakan pertama (= kapan ia mulai terlihat), penampakan terakhir
// (= masih hidup atau sudah lenyap), dan item_id dari potret mana pun yang
// memilikinya (baris sebelum 31 Agu 2026 ditulis sebelum endpoint detail
// dipanggil, jadi item_id-nya kosong).
export function foldSessions(rows = []) {
  const by = new Map()
  for (const r of rows) {
    const cur = by.get(r.session_id)
    if (!cur) { by.set(r.session_id, { ...r, first_seen: r.snapshot_date, last_seen: r.snapshot_date, seen_days: 1 }); continue }
    cur.last_seen = r.snapshot_date > cur.last_seen ? r.snapshot_date : cur.last_seen
    cur.first_seen = r.snapshot_date < cur.first_seen ? r.snapshot_date : cur.first_seen
    cur.seen_days += 1
    if (!cur.item_id && r.item_id) cur.item_id = r.item_id
    if (!cur.spu_id && r.spu_id) cur.spu_id = r.spu_id
  }
  return [...by.values()].sort((a, b) =>
    String(b.schedule_start_time || b.first_seen).localeCompare(String(a.schedule_start_time || a.first_seen)))
}
