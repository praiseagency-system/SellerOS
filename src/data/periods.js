// Lapisan data periode + produk — Supabase (tabel public.periods & public.products).
// Menggantikan penyimpanan "sesi" di localStorage. Tiap periode = 1 row di
// `periods`; tiap produk = 1 row di `products` (field ternormalisasi +
// raw_data jsonb berisi produk utuh). RLS membatasi per pemilik workspace.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { compactProduct } from '../utils/storage'

// ─── Mapping row ⇆ bentuk "session" yang dipakai QuadrantContext ─────────────

function productToRow(periodId, p) {
  const c = compactProduct(p)
  return {
    period_id: periodId,
    name: c.nama_produk ?? '',
    traffic_value: c.pengunjung ?? null,
    conversion_value: c.conversion_rate ?? null,
    quadrant: c.quadrant != null ? String(c.quadrant) : null,
    raw_data: c,
  }
}

function rowToProduct(r) {
  // raw_data menyimpan compactProduct utuh (termasuk quadrant numerik).
  const base = r.raw_data || {}
  return { ...base, quadrant: base.quadrant ?? Number(r.quadrant) }
}

function summarize(products) {
  const s = { 1: 0, 2: 0, 3: 0, 4: 0 }
  products.forEach(p => { if (s[p.quadrant] != null) s[p.quadrant]++ })
  return s
}

function rowToSession(period, productRows) {
  const products = productRows.map(rowToProduct)
  return {
    id: period.id,
    label: period.name,
    platform: period.platform,
    periodValue: period.period_value ?? null,
    periodType: period.period_type ?? null,
    settings: period.settings || {},
    savedAt: period.created_at,
    summary: summarize(products),
    products,
  }
}

// ─── Operasi ─────────────────────────────────────────────────────────────────

// Semua sesi di workspace aktif, terbaru dulu (mirror getSessions lama).
export async function listSessions() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return []

  const { data: periods, error } = await supabase
    .from('periods')
    .select('*')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!periods || periods.length === 0) return []

  const { data: prods, error: pe } = await supabase
    .from('products')
    .select('*')
    .in('period_id', periods.map(p => p.id))
  if (pe) throw pe

  const byPeriod = {}
  for (const r of prods || []) (byPeriod[r.period_id] ||= []).push(r)
  return periods.map(p => rowToSession(p, byPeriod[p.id] || []))
}

// Simpan sesi: identitas periode = (workspace + label + platform). Re-upload
// periode sama → ganti snapshot lama (hapus dulu, products ikut via CASCADE).
export async function saveSession({ label, platform, periodValue, periodType, settings, products }) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')

  await supabase.from('periods').delete()
    .eq('workspace_id', wsId).eq('name', label).eq('platform', platform)

  const { data: period, error } = await supabase
    .from('periods')
    .insert({
      workspace_id: wsId,
      name: label,
      platform,
      period_value: periodValue ?? null,
      period_type: periodType ?? null,
      settings: settings ?? null,
    })
    .select('*')
    .single()
  if (error) throw error

  if (products && products.length) {
    const rows = products.map(p => productToRow(period.id, p))
    const { error: pe } = await supabase.from('products').insert(rows)
    if (pe) throw pe
  }
  return period.id
}

export async function deleteSession(id) {
  // products ikut terhapus via ON DELETE CASCADE.
  const { error } = await supabase.from('periods').delete().eq('id', id)
  if (error) throw error
}
