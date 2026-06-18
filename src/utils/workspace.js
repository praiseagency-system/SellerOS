// Pointer workspace aktif (preferensi per-device) + helper.
// Daftar workspace kini disimpan di Supabase (lihat src/data/workspaces.js).
// File ini hanya menyimpan POINTER workspace aktif + kunci localStorage untuk
// data yang BELUM dimigrasi ke Supabase (sesi/produk/store) — akan menyusut
// seiring data ikut pindah.

const CURRENT_KEY = 'quadrant_current_workspace_v1'

export const PRESET_COLORS = [
  '#f97316', // orange
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6b7280', // gray
]

// Warna stabil dari id — dipakai bila workspace belum punya kolom `color`
// (migration 0002 belum dijalankan). Deterministik agar warna tidak berubah-ubah.
export function colorForId(id) {
  const s = String(id)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PRESET_COLORS[h % PRESET_COLORS.length]
}

export function getCurrentWorkspaceId() {
  return localStorage.getItem(CURRENT_KEY) || null
}

export function setCurrentWorkspace(id) {
  if (id) localStorage.setItem(CURRENT_KEY, id)
}

// ─── Kunci localStorage yang masih di-scope per-workspace ─────────────────
export function sessionsKeyFor(workspaceId) {
  return `quadrant_sessions_v1::${workspaceId}`
}

// Bersihkan data localStorage yang masih di-scope ke workspace (sesi/produk/store)
// saat workspace dihapus. Data Supabase (periods/products) terhapus via CASCADE.
export function clearWorkspaceLocalData(id) {
  localStorage.removeItem(sessionsKeyFor(id))
  localStorage.removeItem(`quadrant_products_v1::${id}`)
  localStorage.removeItem(`quadrant_store_v1::${id}`)
}
