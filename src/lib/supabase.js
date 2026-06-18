import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Pesan jelas saat env belum di-set (dev maupun build Vercel).
  console.error(
    'Supabase belum dikonfigurasi. Set VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY ' +
    'di .env.local (lokal) atau Environment Variables (Vercel).'
  )
}

// Fallback placeholder agar createClient tidak throw saat env belum di-set
// (mis. build pertama / lupa isi .env). Operasi auth tetap di-guard via
// isSupabaseConfigured, jadi tak ada call jaringan ke placeholder ini.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)

// True bila env Supabase tersedia — dipakai untuk menampilkan pesan setup.
export const isSupabaseConfigured = Boolean(url && anonKey)
