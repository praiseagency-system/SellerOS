// Identitas: profil (per user) & brand (per workspace) — SUMBERNYA DATABASE.
//
// Dulu semua ini di localStorage per-perangkat (data/localIdentity.js). Sejak
// keanggotaan workspace jadi nyata, itu tak lagi memadai: anggota yang diundang
// akan melihat workspace tanpa nama brand dan tanpa logo, karena datanya hanya
// ada di browser si pengundang.
//
// localIdentity TETAP DIPAKAI untuk satu hal: mengangkat data lama milik
// pengguna yang sudah ada ke DB, sekali saja (lihat angkatDariLokal).
import { supabase } from '../lib/supabase'
import { getLocalProfile, getAllLocalBrands } from './localIdentity'

// Kolom gambar SENGAJA tak ikut di jalur panas — data URL bisa puluhan KB.
const PROFIL_KOLOM = 'id, full_name, phone, avatar_url'

export async function getProfile(uid) {
  if (!uid) return { name: '', phone: '', avatar: null }
  const { data, error } = await supabase
    .from('profiles').select(PROFIL_KOLOM).eq('id', uid).maybeSingle()
  if (error) throw error
  return { name: data?.full_name || '', phone: data?.phone || '', avatar: data?.avatar_url || null }
}

export async function saveProfile(uid, patch) {
  if (!uid) throw new Error('Belum masuk.')
  const row = {}
  if ('name' in patch) row.full_name = patch.name
  if ('phone' in patch) row.phone = patch.phone
  if ('avatar' in patch) row.avatar_url = patch.avatar
  const { error } = await supabase.from('profiles').update(row).eq('id', uid)
  if (error) throw error
}

// Brand seluruh workspace yang bisa dilihat user (RLS `ws_member_read` yang
// menyaring) → { [wsId]: { name, logo } }.
export async function getAllBrands() {
  const { data, error } = await supabase
    .from('workspaces').select('id, brand_name, brand_logo')
  if (error) throw error
  return Object.fromEntries(
    (data || []).map(w => [w.id, { name: w.brand_name || '', logo: w.brand_logo || null }])
  )
}

// Hanya owner yang boleh — dijaga policy `ws_owner_modify` (0053), bukan UI.
export async function saveBrand(wsId, patch) {
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const row = {}
  if ('name' in patch) row.brand_name = patch.name
  if ('logo' in patch) row.brand_logo = patch.logo
  const { error } = await supabase.from('workspaces').update(row).eq('id', wsId)
  if (error) throw error
}

// Angkat data lama dari localStorage ke DB, SEKALI saja per user/perangkat.
// Tanpa ini, pengguna yang sudah punya profil & logo mendapati keduanya "hilang"
// begitu sumbernya pindah ke DB. Sengaja TIDAK menimpa yang sudah ada di DB:
// data server selalu menang, localStorage cuma pengisi kekosongan.
const TANDA = (uid) => `sq_identity_migrated_${uid}`

export async function angkatDariLokal(uid) {
  if (!uid) return
  try { if (localStorage.getItem(TANDA(uid))) return } catch { return }

  try {
    const lokal = getLocalProfile(uid)
    const diDb = await getProfile(uid)
    const tambal = {}
    if (!diDb.name && lokal.name) tambal.name = lokal.name
    if (!diDb.phone && lokal.phone) tambal.phone = lokal.phone
    if (!diDb.avatar && lokal.avatar) tambal.avatar = lokal.avatar
    if (Object.keys(tambal).length) await saveProfile(uid, tambal)

    const brandLokal = getAllLocalBrands()
    if (Object.keys(brandLokal).length) {
      const brandDb = await getAllBrands()
      for (const [wsId, b] of Object.entries(brandLokal)) {
        if (!b || !(wsId in brandDb)) continue   // workspace yang bukan miliknya lagi
        const t = {}
        if (!brandDb[wsId].name && b.name) t.name = b.name
        if (!brandDb[wsId].logo && b.logo) t.logo = b.logo
        // Gagal karena bukan owner itu WAJAR — lewati, jangan gagalkan semuanya.
        if (Object.keys(t).length) await saveBrand(wsId, t).catch(() => {})
      }
    }
    try { localStorage.setItem(TANDA(uid), '1') } catch { /* penuh — abaikan */ }
  } catch { /* pengangkatan gagal: biarkan, jangan halangi aplikasi jalan */ }
}
