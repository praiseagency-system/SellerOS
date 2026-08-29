// Kebijakan Privasi — isinya mengikuti apa yang BENAR-BENAR disimpan sistem ini,
// bukan template. Setiap poin bisa ditelusuri ke tabel/kode yang ada.
import { PublicShell, Bagian, Daftar } from './shell'
import { PENYEDIA, BERLAKU_SEJAK, belumDiisi } from './data'

export default function Privasi() {
  const penyedia = belumDiisi(PENYEDIA.badanHukum) ? 'Praise Agency' : PENYEDIA.badanHukum
  return (
    <PublicShell judul="Kebijakan Privasi" ringkas={`Berlaku sejak ${BERLAKU_SEJAK}.`}>
      <Bagian judul="Siapa yang mengelola data">
        <p>
          SellerOS disediakan oleh {penyedia}{!belumDiisi(PENYEDIA.alamat) && <>, {PENYEDIA.alamat}</>}.
          Pertanyaan atau permintaan terkait data pribadi bisa dikirim ke{' '}
          <span className="text-ink">{PENYEDIA.emailPrivasi}</span>.
        </p>
      </Bagian>

      <Bagian judul="Data yang kami simpan">
        <p><b>Data akun.</b> Alamat email (dipakai untuk masuk), serta nama, nomor telepon, dan foto profil bila kamu mengisinya.</p>
        <p><b>Data bisnis yang kamu masukkan.</b> Berkas ekspor dari Shopee dan TikTok Shop, daftar produk beserta harga jual dan harga pokok, campaign dan voucher, serta catatan dan keputusan optimasi yang kamu buat.</p>
        <p><b>Data iklan dari TikTok.</b> Bila kamu menyambungkan akun TikTok Ads, kami menarik performa iklan GMV Max — biaya, pendapatan, pesanan, dan metrik per video/produk — beserta daftar akun iklan dan video yang terotorisasi.</p>
        <p><b>Kredensial koneksi TikTok.</b> Token akses dan token perpanjangan disimpan agar sinkronisasi bisa berjalan otomatis. Token ini <b>tidak bisa dibaca dari peramban</b>; hanya server kami yang dapat menggunakannya.</p>
        <p><b>Data teknis di peramban.</b> Sesi login, penanda workspace yang sedang aktif, dan preferensi tampilan seperti sidebar terlipat. Kami tidak memakai cookie iklan atau pelacak pihak ketiga.</p>
      </Bagian>

      <Bagian judul="Siapa yang bisa melihat datamu">
        <p>Ini bagian yang paling penting untuk dibaca.</p>
        <Daftar items={[
          <><b>Kamu sendiri.</b> Secara bawaan, data workspace hanya bisa dilihat pemiliknya. Pembatasan ini ditegakkan di lapisan basis data, bukan sekadar disembunyikan di tampilan.</>,
          <><b>Anggota tim yang kamu undang.</b> Sejak fitur tim tersedia, siapa pun yang kamu undang ke sebuah workspace dapat melihat seluruh data di dalamnya. Peran <i>viewer</i> hanya bisa membaca; <i>editor</i> bisa mengubah. Mengelola anggota dan koneksi TikTok tetap milik pemilik workspace.</>,
          <><b>Tim {penyedia} — hanya bila kamu mengizinkan.</b> Ada saklar di Pengaturan → Profil bernama “Izinkan tim Praise Agency melihat data saya”. Setelan bawaannya <b>nonaktif</b>. Selama nonaktif, tak ada admin yang bisa membaca datamu. Bila kamu aktifkan, admin kami dapat <b>membaca</b> data workspace-mu untuk membantu analisis — tidak mengubahnya. Kamu bisa mematikannya kapan saja.</>,
        ]} />
      </Bagian>

      <Bagian judul="Pihak ketiga yang kami gunakan">
        <Daftar items={[
          <><b>Supabase</b> — basis data, autentikasi, dan penyimpanan. Data disimpan di wilayah <span className="text-ink">{PENYEDIA.wilayahData}</span>.</>,
          <><b>Vercel</b> — hosting aplikasi dan fungsi server.</>,
          <><b>TikTok for Business</b> — sumber data iklan, hanya untuk akun yang kamu sambungkan sendiri.</>,
        ]} />
        <p>Kami tidak menjual data kamu, dan tidak membagikannya untuk kepentingan periklanan pihak lain.</p>
      </Bagian>

      <Bagian judul="Berapa lama disimpan">
        <p>
          Data akun dan data bisnis disimpan selama akunmu aktif. Khusus snapshot harian iklan,
          sistem memangkas otomatis: untuk bulan yang sudah lewat hanya satu snapshot final per bulan
          yang disimpan, sementara bulan berjalan disimpan utuh per hari agar tren tetap terbaca.
        </p>
        <p>Bila kamu meminta penghapusan akun, data workspace yang kamu miliki ikut dihapus.</p>
      </Bagian>

      <Bagian judul="Hak kamu">
        <Daftar items={[
          'Meminta salinan data yang kami simpan tentang kamu.',
          'Memperbaiki data yang keliru — sebagian bisa langsung kamu ubah di Pengaturan.',
          'Meminta penghapusan akun beserta data workspace milikmu.',
          'Mencabut izin akses tim kami kapan saja lewat saklar di Pengaturan → Profil.',
          'Memutus koneksi TikTok Ads kapan saja lewat Pengaturan → Integrasi.',
        ]} />
        <p>Permintaan dikirim ke <span className="text-ink">{PENYEDIA.emailPrivasi}</span>.</p>
      </Bagian>

      <Bagian judul="Keamanan">
        <p>
          Akses data dibatasi di lapisan basis data per baris, sehingga satu akun tak bisa membaca
          data akun lain meski mencoba lewat jalur teknis. Token TikTok tidak pernah dikirim ke
          peramban dan tidak dapat dibaca dari sana. Semua endpoint server menolak permintaan tanpa
          sesi yang sah.
        </p>
        <p>
          Tidak ada sistem yang sepenuhnya bebas risiko. Bila terjadi insiden yang berdampak pada
          datamu, kami akan memberitahu pengguna yang terdampak.
        </p>
      </Bagian>

      <Bagian judul="Perubahan kebijakan">
        <p>
          Bila kebijakan ini berubah secara berarti, kami memberitahu lewat aplikasi atau email
          sebelum perubahan berlaku.
        </p>
      </Bagian>
    </PublicShell>
  )
}
