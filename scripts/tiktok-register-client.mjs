// Registrasi klien OAuth TikTok (DCR / RFC 7591) untuk domain baru.
// redirect_uri HARUS terdaftar persis per-origin — kalau tidak, tombol
// "Connect TikTok Ads" akan ditolak di domain baru.
//
// Pakai:  node scripts/tiktok-register-client.mjs https://selleros.praiseagency.id
//   (boleh beberapa origin sekaligus; localhost dev ikut didaftarkan otomatis)
//
// Output: client_id baru → tempel ke src/lib/tiktokOAuth.js (TIKTOK_OAUTH.clientId).
// CATATAN: setelah client_id berganti, koneksi lama harus "Sambungkan ulang"
// sekali dari Pengaturan → Integrasi (refresh token lama terikat klien lama).

const BASE = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth'
const origins = process.argv.slice(2)
if (!origins.length) {
  console.error('Sebutkan minimal satu origin, mis: https://selleros.praiseagency.id')
  process.exit(1)
}
const redirectUris = [
  ...origins.map(o => `${o.replace(/\/$/, '')}/tiktok-callback`),
  'http://localhost:5173/tiktok-callback',
  'http://localhost:4174/tiktok-callback',
]

const meta = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json()
if (!meta.registration_endpoint) { console.error('registration_endpoint tak tersedia'); process.exit(1) }

const res = await fetch(meta.registration_endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_name: 'SellerOS (Praise Agency)',
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',   // public client + PKCE
    scope: 'mcp:tt4b',
  }),
})
const body = await res.json()
if (!res.ok) { console.error('Registrasi GAGAL:', JSON.stringify(body, null, 2)); process.exit(1) }

console.log('\n✓ Klien terdaftar\n')
console.log('  client_id :', body.client_id)
console.log('  redirect  :', redirectUris.join('\n              '))
if (body.registration_access_token) {
  console.log('\n  registration_access_token (SIMPAN — untuk mengubah redirect_uris kelak):')
  console.log('  ' + body.registration_access_token)
}
console.log('\nLangkah berikut: ganti TIKTOK_OAUTH.clientId di src/lib/tiktokOAuth.js, deploy,')
console.log('lalu Pengaturan → Integrasi → "Sambungkan ulang" di tiap workspace.\n')
