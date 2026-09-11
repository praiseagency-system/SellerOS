// Akses PostgREST ATAS NAMA pemanggil untuk AI Assistant.
//
// Semua tool asisten dan penyimpanan thread memakai JWT user yang sedang login,
// bukan service_role: RLS Supabase (keanggotaan workspace, pola migrasi 0053)
// yang menentukan baris mana yang terbaca. Jadi asisten tidak pernah bisa
// membocorkan data workspace lain — pagarnya sama dengan yang dipakai UI.
import { supabaseEnv } from '../guard.js'

async function call(token, path, init = {}) {
  const { url, anonKey } = supabaseEnv()
  if (!url || !anonKey) throw new Error('SUPABASE_URL/ANON_KEY tak tersedia')
  const r = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  })
  const text = await r.text()
  if (!r.ok) {
    const e = new Error(`PostgREST ${r.status}: ${text.slice(0, 160)}`)
    e.status = r.status
    throw e
  }
  return text.trim() ? JSON.parse(text) : null
}

export const restGet = (token, path) => call(token, path)

export const restWrite = (token, path, method, body, prefer = 'return=representation') =>
  call(token, path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { Prefer: prefer } })

// PostgREST memotong jawaban di 1000 baris (lihat ref PostgREST 1000 cap).
// Untuk daftar yang bisa lebih panjang dari itu (produk per periode, baris
// order), tarik per halaman sampai habis atau sampai batas aman.
export async function restGetAll(token, path, { pageSize = 1000, maxRows = 5000 } = {}) {
  const out = []
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const sep = path.includes('?') ? '&' : '?'
    const rows = await call(token, `${path}${sep}limit=${pageSize}&offset=${offset}`)
    if (!Array.isArray(rows) || rows.length === 0) break
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}
