// Ketentuan Layanan. Dua klausul di sini BUKAN basa-basi hukum, melainkan
// cerminan sifat nyata sistem: (1) angka bisa berbeda antar sumber — sudah
// terbukti, dan (2) aplikasi ini dapat mengubah pengaturan iklan yang
// membelanjakan uang sungguhan.
import { PublicShell, Bagian, Daftar } from './shell'
import { PENYEDIA, BERLAKU_SEJAK, belumDiisi } from './data'

export default function Ketentuan() {
  const penyedia = belumDiisi(PENYEDIA.badanHukum) ? 'Praise Agency' : PENYEDIA.badanHukum
  return (
    <PublicShell judul="Ketentuan Layanan" ringkas={`Berlaku sejak ${BERLAKU_SEJAK}.`}>
      <Bagian judul="Layanan ini">
        <p>
          SellerOS adalah alat bantu analitik dan pengelolaan iklan untuk seller e-commerce,
          disediakan oleh {penyedia}. Dengan memakainya, kamu menyetujui ketentuan di halaman ini.
        </p>
        <p>
          Pendaftaran terbuka untuk umum. Alamat email wajib dikonfirmasi lewat tautan yang kami
          kirim sebelum akun bisa dipakai — ini juga yang membuat undangan tim aman terikat pada
          alamat tujuannya. Kamu bertanggung jawab menjaga kerahasiaan akses akunmu.
        </p>
      </Bagian>

      <Bagian judul="Angka yang ditampilkan bersifat informasional">
        <p>
          Kami berusaha menampilkan angka seakurat mungkin, tetapi <b>angka di SellerOS tidak
          menggantikan laporan resmi TikTok maupun marketplace</b>. Sumber yang berbeda bisa
          menghasilkan angka yang berbeda untuk hari yang sama.
        </p>
        <p>
          Satu contoh nyata yang kami ketahui: berkas ekspor manual “creative data for product
          campaigns” tidak mencakup campaign LIVE, sehingga totalnya bisa lebih rendah dibanding
          data yang ditarik langsung dari API. Karena itu unggah manual kami posisikan sebagai
          cadangan, bukan sumber utama.
        </p>
        <p>
          Keputusan bisnis — menaikkan budget, menghentikan iklan, menetapkan harga — sepenuhnya ada
          di tanganmu. Verifikasi angka penting ke sumber resminya sebelum mengambil keputusan besar.
        </p>
      </Bagian>

      <Bagian judul="Aksi yang membelanjakan uang">
        <p>
          Bila kamu menyambungkan akun TikTok Ads, SellerOS dapat melakukan perubahan atas
          perintahmu: mengubah budget harian, mengubah target ROI, mengikat kode spark, mengubah
          status penayangan, dan membuat sesi boost.
        </p>
        <p>Semua aksi tersebut tunduk pada pagar berikut, yang bisa kamu atur sendiri:</p>
        <Daftar items={[
          'Setiap aksi wajib melewati antrean persetujuan — tidak ada perubahan yang terjadi tanpa disetujui.',
          'Ada batas kenaikan budget per hari per campaign.',
          'Ada jeda minimum antar aksi pada campaign yang sama.',
          'Ada kill switch yang menghentikan seluruh eksekusi seketika.',
        ]} />
        <p>
          <b>Biaya iklan yang timbul adalah tanggung jawabmu.</b> Kami tidak menanggung biaya yang
          muncul dari aksi yang kamu setujui, termasuk bila hasilnya tidak sesuai harapan.
        </p>
      </Bagian>

      <Bagian judul="Penggunaan yang wajar">
        <Daftar items={[
          'Gunakan hanya untuk akun dan data bisnis yang memang kamu berhak akses.',
          'Jangan mencoba menembus pembatasan akses atau mengakses data akun lain.',
          'Jangan memakai layanan ini untuk melanggar ketentuan TikTok, Shopee, atau hukum yang berlaku.',
        ]} />
        <p>
          Penggunaan data TikTok lewat SellerOS juga tunduk pada ketentuan TikTok for Business yang
          berlaku bagi akun iklanmu.
        </p>
      </Bagian>

      <Bagian judul="Pembayaran">
        <p>
          Selama masa akses terbatas, biaya dan cara pembayaran disepakati langsung antara kamu dan
          {' '}{penyedia}. Belum ada penagihan otomatis di dalam aplikasi.
        </p>
      </Bagian>

      <Bagian judul="Ketersediaan layanan">
        <p>
          Layanan diberikan apa adanya. Kami tidak menjanjikan bebas gangguan — sinkronisasi
          otomatis bergantung pada ketersediaan API TikTok yang berada di luar kendali kami.
        </p>
        <p>
          Kami dapat melakukan pemeliharaan atau perubahan fitur. Untuk perubahan yang berdampak
          besar, kami berusaha memberi tahu lebih dulu.
        </p>
      </Bagian>

      <Bagian judul="Penghentian">
        <p>
          Kamu bisa berhenti kapan saja dan meminta penghapusan data (lihat{' '}
          <a href="/privasi" className="text-blue-400 hover:underline">Kebijakan Privasi</a>).
          Kami dapat menghentikan akses bila ketentuan ini dilanggar.
        </p>
      </Bagian>

      <Bagian judul="Batas tanggung jawab">
        <p>
          Sejauh diizinkan hukum yang berlaku, tanggung jawab {penyedia} atas kerugian yang timbul
          dari penggunaan SellerOS terbatas pada biaya layanan yang kamu bayarkan untuk periode
          berjalan. Kami tidak bertanggung jawab atas kehilangan keuntungan atau kerugian tidak
          langsung.
        </p>
      </Bagian>

      <Bagian judul="Hubungi kami">
        <p>Pertanyaan tentang ketentuan ini: <span className="text-ink">{PENYEDIA.emailPrivasi}</span></p>
      </Bagian>
    </PublicShell>
  )
}
