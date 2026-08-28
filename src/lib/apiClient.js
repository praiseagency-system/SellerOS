// Klien untuk fungsi serverless kita sendiri (api/*).
//
// Semua endpoint di api/ kini menolak permintaan tanpa sesi Supabase yang sah
// (lihat api/_lib/guard.js), jadi setiap panggilan WAJIB membawa JWT sesi yang
// sedang aktif. Sebelumnya endpoint-endpoint itu terbuka untuk siapa saja —
// termasuk api/gmvmax/execute yang MENGUBAH campaign & belanja iklan.
import { supabase } from './supabase'

export async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const jwt = data?.session?.access_token
  if (!jwt) throw new Error('Sesi berakhir. Masuk lagi lalu ulangi.')
  return { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${jwt}` }
}

// POST JSON ke endpoint kita + naikkan error jadi Error yang bisa dibaca UI.
export async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch { throw new Error(`balasan non-JSON (${res.status})`) }
  if (!res.ok || j.error) {
    const e = new Error(j.error_description || j.error || `gagal (${res.status})`)
    e.payload = j
    throw e
  }
  return j
}
