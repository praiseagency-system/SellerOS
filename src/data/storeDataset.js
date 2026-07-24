// Lapisan data Performa Toko — Supabase (tabel public.store_file_blobs).
// SATU BARIS PER FILE (bukan 1 blob raksasa per workspace) supaya hapus per-file
// = DELETE 1 baris (murah) dan import = upsert 1 baris (ringan). Blob lama di
// public.store_datasets dimigrasi otomatis saat load pertama.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { dedupeLines } from '../utils/storeData'

const EMPTY = { files: [], lines: [] }
const monthKeyOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

// True bila error karena tabel store_file_blobs belum dibuat (migrasi 0006 belum
// dijalankan). Dipakai agar app tetap jalan (baca blob lama) sebelum SQL di-apply.
const isMissingTable = (e) =>
  e?.code === '42P01' || e?.code === 'PGRST205' ||
  (/store_file_blobs/i.test(e?.message || '') && /(does not exist|schema cache|not find|relation)/i.test(e?.message || ''))

// Baca blob lama (store_datasets) read-only — TANPA migrasi. Dipakai sebagai
// fallback bila tabel baru belum ada, supaya halaman tak error.
async function readLegacyBlobOnly(wsId) {
  const { data, error } = await supabase
    .from('store_datasets').select('data').eq('workspace_id', wsId).maybeSingle()
  if (error) throw error
  const blob = data?.data || { ...EMPTY }
  const { lines, removed } = dedupeLines(blob.lines || [])
  return { ...blob, lines, dupRemoved: removed }
}

// Baris DB (per file) → bentuk store { files, lines } yang dipakai UI.
// Tiap baris di-tag `_f` = nama file agar hapus/analitik lama tetap jalan.
function rowsToStore(rows) {
  const files = []
  let lines = []
  for (const r of rows) {
    files.push({ name: r.file_name, source: r.source, months: r.months || [], count: r.count || 0, savedAt: r.saved_at })
    lines = lines.concat((r.lines || []).map(l => ({ ...l, _f: r.file_name })))
  }
  const { lines: deduped, removed } = dedupeLines(lines)
  return { files, lines: deduped, dupRemoved: removed }
}

export async function loadStore() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return { ...EMPTY }
  const { data, error } = await supabase
    .from('store_file_blobs')
    .select('file_name, source, months, count, lines, saved_at')
    .eq('workspace_id', wsId)
    .order('saved_at', { ascending: true })
  if (error) {
    // Tabel baru belum dibuat → baca blob lama read-only (jangan pecahkan halaman).
    if (isMissingTable(error)) return readLegacyBlobOnly(wsId)
    throw error
  }
  if (data && data.length) return rowsToStore(data)
  // Belum ada baris → coba migrasi blob lama (sekali).
  return (await migrateLegacyBlob(wsId)) || { ...EMPTY }
}

// Migrasi 1 blob lama (store_datasets) → banyak baris per file (store_file_blobs).
// Kelompokkan SEMUA baris per tag `_f` agar tak ada data hilang; baris tanpa tag
// dikumpulkan ke satu file "(data lama)". Blob lama dihapus setelah sukses.
async function migrateLegacyBlob(wsId) {
  const { data, error } = await supabase
    .from('store_datasets').select('data').eq('workspace_id', wsId).maybeSingle()
  if (error || !data?.data) return null
  const blob = data.data
  const files = blob.files || []
  const allLines = blob.lines || []
  if (!allLines.length && !files.length) return null

  const groups = new Map()
  for (const l of allLines) {
    const key = l._f || '(data lama)'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(l)
  }
  const rows = [...groups.entries()].map(([name, gl]) => {
    const meta = files.find(f => f.name === name)
    const clean = gl.map(({ _f, ...rest }) => rest) // eslint-disable-line no-unused-vars
    const months = meta?.months?.length ? meta.months : [...new Set(clean.map(l => monthKeyOf(l.t)))]
    return {
      workspace_id: wsId, file_name: name, source: meta?.source || clean[0]?.src || null,
      months, count: clean.length, lines: clean, saved_at: meta?.savedAt || new Date().toISOString(),
    }
  })
  if (!rows.length) return null
  // Upsert per file (payload tiap file kecil → aman dari batas ukuran).
  for (const row of rows) {
    const { error: upErr } = await supabase.from('store_file_blobs').upsert(row, { onConflict: 'workspace_id,file_name' })
    if (upErr) throw upErr
  }
  // Buang blob lama agar tak dimigrasi ulang (abaikan bila gagal — tak fatal).
  await supabase.from('store_datasets').delete().eq('workspace_id', wsId)
  return rowsToStore(rows)
}

// Simpan/replace SATU file (upsert per file_name).
export async function saveFileBlob(file) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const clean = (file.lines || []).map(({ _f, ...rest }) => rest) // eslint-disable-line no-unused-vars
  const { error } = await supabase.from('store_file_blobs').upsert({
    workspace_id: wsId, file_name: file.name, source: file.source,
    months: file.months || [], count: clean.length, lines: clean, saved_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,file_name' })
  if (error) throw error
}

// Hapus SATU file — DELETE 1 baris, tak menyentuh file lain.
export async function deleteFileBlob(name) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { error } = await supabase.from('store_file_blobs').delete()
    .eq('workspace_id', wsId).eq('file_name', name)
  if (error) throw error
}

export async function clearStore() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return
  const { error } = await supabase.from('store_file_blobs').delete().eq('workspace_id', wsId)
  if (error) throw error
}
