// Halaman publik "Tentang" — sekaligus alamat homepage yang diminta Google
// saat melengkapi consent screen OAuth.
import { PublicShell, Bagian, Daftar } from './shell'
import { PENYEDIA, belumDiisi } from './data'

export default function Tentang() {
  return (
    <PublicShell
      judul="SellerOS"
      ringkas="Alat bantu analitik & pengelolaan iklan untuk seller dan agensi e-commerce di Shopee dan TikTok Shop."
    >
      <Bagian judul="Apa ini">
        <p>
          SellerOS menggantikan spreadsheet manual untuk tiga pekerjaan yang biasanya terpisah:
          menghitung biaya, ongkir, dan profit per produk marketplace; memetakan produk ke kuadran
          traffic × konversi agar terlihat mana yang perlu ditindak; dan memantau performa iklan
          TikTok GMV Max harian beserta rekomendasi aksinya.
        </p>
        <p>
          Data iklan ditarik otomatis dari akun TikTok Ads yang kamu sambungkan sendiri. Unggah
          manual tersedia sebagai cadangan bila sinkronisasi otomatis sedang tak bisa dipakai.
        </p>
      </Bagian>

      <Bagian judul="Penyedia layanan">
        <p>
          SellerOS disediakan oleh {belumDiisi(PENYEDIA.badanHukum) ? 'Praise Agency' : PENYEDIA.badanHukum}
          {!belumDiisi(PENYEDIA.alamat) && <>, {PENYEDIA.alamat}</>}.
        </p>
        <p>
          Pertanyaan seputar layanan maupun data pribadi:{' '}
          <span className="text-ink">{PENYEDIA.emailPrivasi}</span>
        </p>
      </Bagian>

      <Bagian judul="Akses">
        <p>
          Siapa pun bisa mendaftar sendiri di halaman masuk. Alamat email harus dikonfirmasi lebih
          dulu lewat tautan yang kami kirim — akun belum aktif sebelum tautan itu dibuka.
        </p>
        <p>
          Kamu juga bisa masuk ke workspace orang lain bila pemiliknya mengundangmu. Undangan
          terikat pada alamat email yang dituju.
        </p>
      </Bagian>

      <Bagian judul="Dokumen">
        <Daftar items={[
          <><a href="/privasi" className="text-blue-400 hover:underline">Kebijakan Privasi</a> — data apa yang disimpan, siapa bisa melihat, berapa lama.</>,
          <><a href="/ketentuan" className="text-blue-400 hover:underline">Ketentuan Layanan</a> — batas tanggung jawab, terutama untuk aksi yang membelanjakan biaya iklan.</>,
        ]} />
      </Bagian>
    </PublicShell>
  )
}
