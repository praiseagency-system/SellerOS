// Kerangka halaman PUBLIK (tanpa login): Tentang, Privasi, Ketentuan.
//
// Kenapa ada: melengkapi consent screen Google (syarat mengeluarkan app dari
// status Testing) menuntut alamat homepage dan kebijakan privasi yang bisa
// dibuka tanpa login. Sampai sekarang selleros.praiseagency.id langsung menuju
// layar masuk, jadi tak ada satu pun halaman publik.
//
// Halaman aplikasi tetap `noindex` (lihat index.html). Yang penting halaman ini
// BISA DIBUKA tanpa akun — bukan harus terindeks.
import { Zap } from 'lucide-react'
import { PENYEDIA, belumDiisi } from './data'

export function PublicShell({ judul, ringkas, children }) {
  const adaPlaceholder = Object.values(PENYEDIA).some(belumDiisi)
  return (
    <div className="min-h-screen bg-app">
      <header className="border-b border-line/10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <a href="/tentang" className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-blue-600/15 flex items-center justify-center">
              <Zap className="w-4 h-4 text-blue-500" />
            </span>
            <span className="leading-tight">
              <span className="block text-[10px] uppercase tracking-wide text-ink-faint">Praise Agency</span>
              <span className="block text-sm font-bold text-ink-strong">SellerOS</span>
            </span>
          </a>
          <a href="/" className="ml-auto text-xs font-semibold text-blue-400 hover:underline">Masuk</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {adaPlaceholder && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-xs text-amber-300 leading-relaxed">
              <b>Draf — belum siap dipublikasikan.</b> Masih ada isian bertanda <code>[…]</code> yang
              hanya bisa dilengkapi pemilik layanan (badan hukum, alamat, email kontak, lokasi data).
              Lengkapi di <code>src/pages/publik/shell.jsx</code> sebelum dikirim ke Google atau
              ditunjukkan ke klien.
            </p>
          </div>
        )}
        <h1 className="text-2xl font-bold text-ink-strong">{judul}</h1>
        {ringkas && <p className="text-sm text-ink-muted mt-2">{ringkas}</p>}
        <div className="mt-8 space-y-7">{children}</div>
      </main>

      <footer className="border-t border-line/10 mt-8">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-faint">
          <a href="/tentang" className="hover:text-ink">Tentang</a>
          <a href="/privasi" className="hover:text-ink">Kebijakan Privasi</a>
          <a href="/ketentuan" className="hover:text-ink">Ketentuan Layanan</a>
          <span className="ml-auto">© {new Date().getFullYear()} {belumDiisi(PENYEDIA.badanHukum) ? 'Praise Agency' : PENYEDIA.badanHukum}</span>
        </div>
      </footer>
    </div>
  )
}

export function Bagian({ judul, children }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-ink-strong">{judul}</h2>
      <div className="mt-2 space-y-2.5 text-sm text-ink-muted leading-relaxed">{children}</div>
    </section>
  )
}

export function Daftar({ items }) {
  return (
    <ul className="space-y-1.5 pl-4">
      {items.map((t, i) => (
        <li key={i} className="list-disc marker:text-ink-faint">{t}</li>
      ))}
    </ul>
  )
}
