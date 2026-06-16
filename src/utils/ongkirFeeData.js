// Biaya Layanan Penjual — Program Opsional Gratis Ongkir XTRA (GOX)
// Sumber: seller.shopee.co.id/edu/article — berlaku mulai 2 Mei 2026
// Ukuran Biasa : berat < 5kg, panjang/lebar/tinggi < 60 cm, dimensi < 20.000 cm³
// Ukuran Khusus: berat ≥ 5kg ATAU dimensi ≥ 60cm / 20.000cm³ (maks. Rp60.000/produk)

export const ONGKIR_FEE_DATA = [
  // ─── ELEKTRONIK ───────────────────────────────────────────────
  {
    id: 'elektronik',
    label: 'Elektronik',
    subs: [
      {
        label: 'Audio',
        items: [
          {
            label: 'Audio',
            feeBiasa: 5.5, feeKhusus: 7,
            tags: ['Amplifier', 'Mixer', 'Earphone', 'Headphone', 'Headset', 'Speaker', 'Media Player', 'Mikrofon', 'Radio', 'Voice Recorder', 'Home Theater', 'Karaoke'],
          },
        ],
      },
      {
        label: 'Elektronik',
        items: [
          { label: 'Proyektor & Aksesoris', feeBiasa: 3.5, feeKhusus: 5, tags: ['Proyektor', 'Layar Proyektor', 'Pointer'] },
          { label: 'Baterai, TV & Peralatan Listrik', feeBiasa: 5.5, feeKhusus: 7, tags: ['Baterai', 'TV', 'AC', 'Mesin Cuci', 'Kulkas', 'Oven', 'Air Fryer', 'Microwave', 'Dispenser', 'Rice Cooker', 'Setrika', 'Penyedot Debu', 'Kipas Angin', 'Blender', 'Juicer', 'Slow Cooker', 'Remot Kontrol', 'Rokok Elektronik', 'Shisha'] },
          { label: 'Flosser Elektrik', feeBiasa: 6, feeKhusus: 7.5, tags: ['Flosser Elektrik'] },
          { label: 'Kelistrikan', feeBiasa: 6.5, feeKhusus: 8, tags: ['Stop Kontak', 'Sambungan Kabel', 'Saklar', 'Bel', 'Alarm', 'Anti Petir', 'Penghemat Listrik', 'Pengaman Stop Kontak'] },
          { label: 'Elektronik Lainnya', feeBiasa: 5.5, feeKhusus: 7, tags: ['Elektronik Lainnya'] },
        ],
      },
      {
        label: 'Gaming & Konsol',
        items: [
          { label: 'Gaming & Konsol', feeBiasa: 5.5, feeKhusus: 7, tags: ['Konsol Game', 'Playstation', 'Nintendo', 'Xbox', 'Switch', 'PSP', 'Video Game', 'Aksesoris Konsol', 'Gaming'] },
        ],
      },
      {
        label: 'Handphone & Aksesoris',
        items: [
          { label: 'Handphone & Tablet', feeBiasa: 1, feeKhusus: 2.5, tags: ['Handphone', 'HP', 'Smartphone', 'Tablet', 'iPad'] },
          { label: 'Aksesoris & Perangkat Wearable', feeBiasa: 5.5, feeKhusus: 7, tags: ['Casing HP', 'Charger', 'Powerbank', 'Pelindung Layar', 'Kabel Data', 'Kartu Memori', 'Smartwatch', 'Fitness Tracker', 'TWS', 'Modem', 'Kartu Perdana', 'Tongsis', 'Phone Holder', 'Walkie Talkie'] },
        ],
      },
      {
        label: 'Kamera & Drone',
        items: [
          { label: 'Kamera, Drone & Aksesoris', feeBiasa: 5.5, feeKhusus: 7, tags: ['Kamera DSLR', 'Mirrorless', 'Action Cam', 'Kamera Analog', 'Drone', 'CCTV', 'Tripod', 'Lensa', 'Flash', 'Gimbal', 'Tas Kamera', 'Printer Foto'] },
        ],
      },
      {
        label: 'Komputer & Aksesoris',
        items: [
          { label: 'Desktop, Laptop & Monitor', feeBiasa: 1, feeKhusus: 2.5, tags: ['Desktop', 'PC', 'Laptop', 'Notebook', 'Monitor', 'All-in-One', 'Server', 'PC Mini'] },
          { label: 'Komponen & Printer', feeBiasa: 2, feeKhusus: 3.5, tags: ['RAM', 'Motherboard', 'Processor', 'VGA Card', 'Power Supply', 'SSD Komponen', 'Casing PC', 'Fan', 'Heatsink', 'Printer', 'Scanner', '3D Printer', 'Tinta Printer'] },
          { label: 'Penyimpanan Data & Peralatan Kantor', feeBiasa: 3.5, feeKhusus: 5, tags: ['SSD', 'Hard Disk', 'Flashdisk', 'NAS', 'CD', 'Flashdisk OTG', 'Mesin Absensi', 'Penghancur Kertas', 'Mesin Ketik', 'Penghitung Uang'] },
          { label: 'Aksesoris Komputer & Jaringan', feeBiasa: 5.5, feeKhusus: 7, tags: ['Keyboard', 'Mouse', 'Webcam', 'USB Hub', 'Cooling Pad', 'Router', 'Modem WiFi', 'Switch Internet', 'Wireless Adapter', 'Drawing Tablet', 'Software', 'Baterai Laptop', 'Charger Laptop', 'Meja Laptop'] },
        ],
      },
    ],
  },

  // ─── FASHION ──────────────────────────────────────────────────
  {
    id: 'fashion',
    label: 'Fashion',
    subs: [
      {
        label: 'Aksesoris Fashion',
        items: [
          { label: 'Logam Mulia', feeBiasa: 2, feeKhusus: 3.5, tags: ['Berlian', 'Perak', 'Permata', 'Platinum', 'Emas', 'Logam Mulia'] },
          { label: 'Perhiasan Berharga', feeBiasa: 2, feeKhusus: 3.5, tags: ['Anting', 'Bros & Pin', 'Cincin', 'Gelang Kaki', 'Gelang Tangan', 'Kalung', 'Liontin', 'Set Perhiasan'] },
          { label: 'Aksesoris Tambahan — Masker', feeBiasa: 7.5, feeKhusus: 9, tags: ['Masker'] },
          { label: 'Aksesoris Rambut', feeBiasa: 8, feeKhusus: 9.5, tags: ['Bando', 'Bandana', 'Hiasan Kepala', 'Tiara', 'Mahkota Bunga', 'Ikat Rambut', 'Jepitan Rambut', 'Rambut Palsu', 'Pita & Scrunchie'] },
          { label: 'Aksesoris Tambahan & Fashion Lainnya', feeBiasa: 8, feeKhusus: 9.5, tags: ['Anting Fashion', 'Cincin Fashion', 'Dasi', 'Gelang Fashion', 'Ikat Pinggang', 'Kacamata', 'Kalung Fashion', 'Sarung Tangan', 'Set Aksesoris', 'Syal & Selendang', 'Topi', 'Bordir', 'Bros', 'Sapu Tangan'] },
          { label: 'Aksesoris Fashion Lainnya', feeBiasa: 5.5, feeKhusus: 7, tags: ['Aksesoris Fashion Lainnya'] },
        ],
      },
      {
        label: 'Fashion Bayi & Anak',
        items: [
          { label: 'Perhiasan Anak', feeBiasa: 2, feeKhusus: 3.5, tags: ['Anting Anak', 'Cincin Anak', 'Gelang Anak', 'Kalung Anak', 'Perhiasan Bayi'] },
          { label: 'Pakaian, Sepatu & Aksesoris Anak', feeBiasa: 5.5, feeKhusus: 7, tags: ['Pakaian Anak Laki-Laki', 'Pakaian Anak Perempuan', 'Pakaian Bayi', 'Sepatu Anak', 'Sepatu Bayi', 'Aksesoris Bayi', 'Topi Anak', 'Tas Anak', 'Koper Anak', 'Jam Tangan Anak', 'Kacamata Anak'] },
          { label: 'Perlengkapan Hujan Anak', feeBiasa: 8, feeKhusus: 9.5, tags: ['Jas Hujan Anak', 'Sepatu Boot Hujan Anak', 'Perlengkapan Hujan Anak'] },
          { label: 'Fashion Bayi & Anak Lainnya', feeBiasa: 5.5, feeKhusus: 7, tags: ['Fashion Bayi & Anak Lainnya'] },
        ],
      },
      {
        label: 'Fashion Muslim',
        items: [
          { label: 'Pakaian Muslim (Umum)', feeBiasa: 7.5, feeKhusus: 9, tags: ['Mukena', 'Mukena Travel', 'Sajadah', 'Peci', 'Songkok', 'Kopiah', 'Gamis Pria', 'Baju Melayu', 'Sarung', 'Pakaian Muslim Wanita', 'Hijab', 'Abaya', 'Kaftan', 'Tunik', 'Khimar', 'Pashmina', 'Pakaian Muslim Anak', 'Outerwear Muslim', 'Cardigan Muslim', 'Jaket Muslim'] },
          { label: 'Baju Olahraga & Renang Muslim', feeBiasa: 8, feeKhusus: 9.5, tags: ['Baju Olahraga Muslim', 'Baju Renang Muslim'] },
          { label: 'Fashion Muslim Lainnya', feeBiasa: 7.5, feeKhusus: 9, tags: ['Fashion Muslim Lainnya'] },
        ],
      },
      {
        label: 'Jam Tangan',
        items: [
          { label: 'Jam Tangan & Aksesoris', feeBiasa: 8, feeKhusus: 9.5, tags: ['Jam Tangan Pria', 'Jam Tangan Wanita', 'Jam Tangan Couple', 'Strap Jam Tangan', 'Kotak Jam Tangan', 'Baterai Jam Tangan', 'Aksesoris Jam Tangan'] },
        ],
      },
      {
        label: 'Koper & Tas Travel',
        items: [
          { label: 'Koper, Tas Travel & Aksesoris', feeBiasa: 7.5, feeKhusus: 9, tags: ['Koper', 'Tas Travel', 'Tas Lipat', 'Tas Serut', 'Aksesoris Travel', 'Bantal Leher', 'Gembok Koper', 'Organizer Travel', 'Passport Cover', 'Pelindung Koper', 'Tag Koper'] },
          { label: 'Tas Duffel', feeBiasa: 8, feeKhusus: 9.5, tags: ['Tas Duffel'] },
          { label: 'Koper & Tas Travel Lainnya', feeBiasa: 7.5, feeKhusus: 9, tags: ['Koper & Tas Travel Lainnya'] },
        ],
      },
      {
        label: 'Pakaian Pria',
        items: [
          { label: 'Pakaian Pria', feeBiasa: 6.5, feeKhusus: 8, tags: ['Atasan Pria', 'Kaos Pria', 'Kemeja Pria', 'Celana Pria', 'Jeans Pria', 'Celana Pendek Pria', 'Hoodie Pria', 'Jaket Pria', 'Jas & Blazer', 'Setelan Pria', 'Sweater Pria', 'Pakaian Dalam Pria', 'Pakaian Tidur Pria', 'Pakaian Tradisional Pria', 'Kostum Pria', 'Kaos Kaki Pria', 'Rompi Pria'] },
        ],
      },
      {
        label: 'Pakaian Wanita',
        items: [
          { label: 'Kaos Kaki & Stocking', feeBiasa: 6.5, feeKhusus: 8, tags: ['Kaos Kaki Wanita', 'Stocking'] },
          { label: 'Pakaian Wanita', feeBiasa: 7.5, feeKhusus: 9, tags: ['Atasan Wanita', 'Blouse', 'Kemeja Wanita', 'Kaos Wanita', 'Dress', 'Rok', 'Celana Wanita', 'Legging', 'Jeans Wanita', 'Hoodie Wanita', 'Jaket Wanita', 'Blazer Wanita', 'Baju Hamil', 'Pakaian Dalam Wanita', 'Pakaian Tidur Wanita', 'Jumpsuit', 'Overall', 'Wedding Dress', 'Kimono', 'Sweater Wanita', 'Kain Batik', 'Kebaya', 'Kostum Wanita'] },
        ],
      },
      {
        label: 'Sepatu Pria',
        items: [
          { label: 'Sepatu Pria', feeBiasa: 6.5, feeKhusus: 8, tags: ['Boot Pria', 'Safety Boot', 'Loafer Pria', 'Oxford Pria', 'Sandal Pria', 'Sneakers Pria', 'Slip-On Pria', 'Aksesoris Sepatu Pria', 'Insole', 'Tali Sepatu'] },
        ],
      },
      {
        label: 'Sepatu Wanita',
        items: [
          { label: 'Sepatu Wanita', feeBiasa: 6.5, feeKhusus: 8, tags: ['Boots Wanita', 'Heels', 'Sandal Wanita', 'Flat Shoes', 'Sneakers Wanita', 'Wedges', 'Loafer Wanita', 'Aksesoris Sepatu Wanita', 'Insole Wanita'] },
        ],
      },
      {
        label: 'Tas Pria',
        items: [
          { label: 'Tas Pria', feeBiasa: 7.5, feeKhusus: 9, tags: ['Ransel Pria', 'Dompet Pria', 'Tas Kerja', 'Tas Laptop Pria', 'Tas Selempang Pria', 'Tas Pinggang Pria', 'Clutch Pria', 'Tote Bag Pria'] },
        ],
      },
      {
        label: 'Tas Wanita',
        items: [
          { label: 'Tas Wanita', feeBiasa: 7.5, feeKhusus: 9, tags: ['Ransel Wanita', 'Dompet Wanita', 'Clutch Wanita', 'Tas Selempang Wanita', 'Tas Bahu Wanita', 'Top Handle Bag', 'Tote Bag Wanita', 'Tas Laptop Wanita', 'Tas Pinggang Wanita', 'Aksesoris Tas Wanita'] },
        ],
      },
    ],
  },

  // ─── FMCG ─────────────────────────────────────────────────────
  {
    id: 'fmcg',
    label: 'FMCG',
    subs: [
      {
        label: 'Ibu & Bayi',
        items: [
          { label: 'Perlengkapan Bayi & Ibu', feeBiasa: 5.5, feeKhusus: 7, tags: ['Susu Formula', 'Makanan Bayi', 'Bubur Bayi', 'Pompa ASI', 'Botol Susu', 'Popok', 'Stroller', 'Baby Walker', 'Gendongan Bayi', 'Baju Hamil', 'Perlengkapan Mandi Bayi', 'Kamar Bayi', 'Matras Bayi', 'Set Hadiah Bayi'] },
          { label: 'Mainan Bayi & Anak', feeBiasa: 8, feeKhusus: 9.5, tags: ['Mainan Bayi', 'Boneka', 'Puzzle Anak', 'Sepeda Anak', 'Lego', 'Action Figure Anak', 'Mainan Edukatif', 'Mainan Musik Anak', 'Trampolin', 'Kolam Bayi'] },
          { label: 'Ibu & Bayi Lainnya', feeBiasa: 5.5, feeKhusus: 7, tags: ['Ibu & Bayi Lainnya'] },
        ],
      },
      {
        label: 'Kesehatan',
        items: [
          { label: 'Kesehatan Seksual & Perawatan Khusus', feeBiasa: 5.5, feeKhusus: 7, tags: ['Kondom', 'Pelumas', 'Cairan Lensa Kontak', 'Obat Tetes Mata', 'Popok Dewasa'] },
          { label: 'Obat, Suplemen & Alat Kesehatan', feeBiasa: 6, feeKhusus: 7.5, tags: ['Obat Bebas', 'Suplemen', 'Vitamin', 'Alat Ukur Gula Darah', 'Alat Ukur Tekanan Darah', 'Termometer', 'Masker Medis', 'Sarung Tangan Medis', 'P3K', 'Kursi Roda', 'Antiseptik', 'Pasta Gigi', 'Sikat Gigi', 'Pembalut', 'Hand Sanitizer', 'Obat Kumur', 'Sikat Gigi Elektrik'] },
          { label: 'Lensa Kontak', feeBiasa: 8, feeKhusus: 9.5, tags: ['Lensa Kontak', 'Softlens'] },
          { label: 'Kesehatan Lainnya', feeBiasa: 6, feeKhusus: 7.5, tags: ['Kesehatan Lainnya'] },
        ],
      },
      {
        label: 'Makanan & Minuman',
        items: [
          { label: 'Makanan & Minuman', feeBiasa: 6, feeKhusus: 7.5, tags: ['Beras', 'Mie Instan', 'Bumbu Masak', 'Makanan Kaleng', 'Snack', 'Cokelat', 'Permen', 'Kopi', 'Teh', 'Susu', 'Minuman Energi', 'Air Mineral', 'Jus', 'Roti', 'Kue', 'Buah Segar', 'Daging', 'Seafood', 'Es Krim', 'Yoghurt', 'Madu', 'Sereal', 'Minyak Goreng', 'Minuman Alkohol'] },
        ],
      },
      {
        label: 'Perawatan & Kecantikan',
        items: [
          { label: 'Perawatan & Kecantikan', feeBiasa: 5.5, feeKhusus: 7, tags: ['Lipstik', 'Foundation', 'Bedak', 'Eyeshadow', 'Eyeliner', 'Maskara', 'Skincare', 'Sabun Mandi', 'Shampo', 'Kondisioner', 'Parfum', 'Pewarna Rambut', 'Deodoran', 'Sunscreen', 'Serum Wajah', 'Toner', 'Pelembab', 'Sikat Gigi Elektrik Kecantikan', 'Cat Kuku', 'Alat Kecantikan', 'Hair Dryer', 'Perawatan Pria'] },
        ],
      },
    ],
  },

  // ─── LIFESTYLE ────────────────────────────────────────────────
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    subs: [
      {
        label: 'Buku & Alat Tulis',
        items: [
          { label: 'Alat Tulis & Perlengkapan Sekolah/Kantor', feeBiasa: 5.5, feeKhusus: 7, tags: ['Pulpen', 'Pensil', 'Spidol', 'Highlighter', 'Penghapus', 'Penggaris', 'Stapler', 'Gunting', 'Kalkulator', 'Lem', 'Tipe-X', 'Bubble Wrap', 'Tempat Pensil', 'Papan Tulis'] },
          { label: 'Buku Tulis & Kertas', feeBiasa: 6, feeKhusus: 7.5, tags: ['Buku Tulis', 'Kertas Print', 'Notebook', 'Notepad', 'Stiker', 'Label', 'Memo', 'Sticky Notes', 'Binder', 'Kertas Termal'] },
          { label: 'Pembungkus Kado & Kemasan', feeBiasa: 7.5, feeKhusus: 9, tags: ['Kotak Kado', 'Kertas Kado', 'Kardus', 'Tas Kado', 'Pita Kado', 'Bungkus Kado'] },
          { label: 'Buku & Alat Tulis Lainnya', feeBiasa: 6, feeKhusus: 7.5, tags: ['Buku & Alat Tulis Lainnya'] },
        ],
      },
      {
        label: 'Buku & Majalah',
        items: [
          { label: 'Komik, E-Book & Majalah', feeBiasa: 5.5, feeKhusus: 7, tags: ['Komik', 'E-Book', 'Majalah', 'Koran', 'Majalah Bisnis', 'Majalah Remaja'] },
          { label: 'Buku (Umum)', feeBiasa: 6, feeKhusus: 7.5, tags: ['Novel', 'Non-Fiksi', 'Pendidikan', 'Bisnis & Investasi', 'Pengembangan Diri', 'Resep Masak', 'Agama & Filsafat', 'Kesehatan', 'Parenting', 'Sejarah', 'Sains', 'Seni'] },
          { label: 'Buku Bayi', feeBiasa: 8, feeKhusus: 9.5, tags: ['Buku Bayi', 'Buku Anak Balita'] },
          { label: 'Buku & Majalah Lainnya', feeBiasa: 6, feeKhusus: 7.5, tags: ['Buku & Majalah Lainnya'] },
        ],
      },
      {
        label: 'Hewan Peliharaan',
        items: [
          { label: 'Grooming, Pakaian & Kesehatan Hewan', feeBiasa: 7.5, feeKhusus: 9, tags: ['Grooming Hewan', 'Pakaian Anjing', 'Pakaian Kucing', 'Obat Hewan', 'Vitamin Hewan', 'Anti Kutu', 'Perawatan Kuku Hewan', 'Aksesoris Leher Hewan'] },
          { label: 'Aksesoris, Kandang & Makanan Hewan', feeBiasa: 8, feeKhusus: 9.5, tags: ['Kandang', 'Tempat Tidur Hewan', 'Mainan Anjing', 'Mainan Kucing', 'Litter Box', 'Mangkuk Hewan', 'Akuarium', 'Makanan Anjing', 'Makanan Kucing', 'Pakan Burung', 'Makanan Ikan', 'Snack Hewan', 'Popok Anjing', 'Tali Hewan'] },
          { label: 'Hewan Peliharaan Lainnya', feeBiasa: 6, feeKhusus: 7.5, tags: ['Hewan Peliharaan Lainnya'] },
        ],
      },
      {
        label: 'Hobi & Koleksi',
        items: [
          { label: 'Alat Musik & Hobi (Umum)', feeBiasa: 6, feeKhusus: 7.5, tags: ['Gitar', 'Gitar Bass', 'Ukulele', 'Keyboard Piano', 'Drum', 'Alat Musik Tiup', 'Aksesoris Musik', 'Album Foto', 'Hobi Lainnya'] },
          { label: 'Perlengkapan Menjahit', feeBiasa: 6.5, feeKhusus: 8, tags: ['Perlengkapan Menjahit', 'Benang', 'Jarum', 'Kain'] },
          { label: 'CD, DVD, Piringan Hitam & Souvenir', feeBiasa: 7.5, feeKhusus: 9, tags: ['CD', 'DVD', 'Bluray', 'Piringan Hitam', 'Vinyl', 'Souvenir', 'Gantungan Kunci', 'Magnet Kulkas', 'Celengan', 'Kipas Tangan'] },
          { label: 'Koleksi & Mainan Games', feeBiasa: 8, feeKhusus: 9.5, tags: ['Action Figure', 'Diecast', 'Mecha Model', 'Koleksi Anime', 'Koleksi Manga', 'Koleksi Olahraga', 'Patung', 'Board Game', 'Kartu Game', 'Rubik', 'Mainan RC', 'Mainan Sulap', 'Mainan Kapsul'] },
        ],
      },
      {
        label: 'Mobil',
        items: [
          { label: 'Mobil, Suku Cadang & Aksesoris', feeBiasa: 7.5, feeKhusus: 9, tags: ['Mobil', 'Suku Cadang Mobil', 'Ban Mobil', 'Aki Mobil', 'Oli Mobil', 'Jok Mobil', 'Karpet Mobil', 'Spion Mobil', 'Knalpot Mobil', 'Aksesoris Eksterior Mobil', 'Aksesoris Interior Mobil', 'Navigasi Mobil', 'Speaker Mobil', 'Sabun Cuci Mobil', 'Wiper'] },
        ],
      },
      {
        label: 'Olahraga & Outdoor',
        items: [
          { label: 'Jas Hujan & Pakaian Olahraga Anak', feeBiasa: 7.5, feeKhusus: 9, tags: ['Jas Hujan', 'Pakaian Olahraga Anak'] },
          { label: 'Alat Olahraga, Pakaian & Sepatu Olahraga', feeBiasa: 8, feeKhusus: 9.5, tags: ['Sepeda', 'Alat Gym', 'Raket Bulu Tangkis', 'Raket Tenis', 'Bola Kaki', 'Bola Basket', 'Matras Yoga', 'Tenda Camping', 'Sleeping Bag', 'Pakaian Olahraga', 'Jersey', 'Sports Bra', 'Sepatu Olahraga', 'Sepatu Running', 'Sepatu Bulu Tangkis', 'Sepatu Futsal', 'Baju Renang', 'Helm Sepeda', 'Tas Gym', 'Joran Pancing', 'Payung'] },
        ],
      },
      {
        label: 'Perlengkapan Rumah',
        items: [
          { label: 'Peralatan Makan, Dapur & Keagamaan', feeBiasa: 5.5, feeKhusus: 7, tags: ['Piring', 'Gelas', 'Mangkuk', 'Panci', 'Wajan', 'Pisau Dapur', 'Spatula', 'Talenan', 'Pengharum Ruangan', 'Diffuser', 'Minyak Esensial', 'Al-Quran', 'Mukena (rumah)', 'Sajadah (rumah)', 'Perlengkapan Keagamaan'] },
          { label: 'Furniture, Kamar Tidur & Lampu', feeBiasa: 6.5, feeKhusus: 8, tags: ['Sofa', 'Kursi', 'Meja', 'Lemari', 'Rak', 'Matras', 'Kasur', 'Bantal', 'Guling', 'Selimut', 'Sprei', 'Sarung Bantal', 'Lampu', 'Kelambu', 'Furniture Lainnya'] },
          { label: 'Pertukangan, Kamar Mandi, Taman & Pesta', feeBiasa: 7.5, feeKhusus: 9, tags: ['Bor', 'Palu', 'Obeng', 'Cat Dinding', 'Tangga', 'Pompa Air', 'Shower', 'Kepala Shower', 'Kloset', 'Handuk', 'Tirai Shower', 'Rak Kamar Mandi', 'Tanaman', 'Pupuk', 'Pot', 'Alat Berkebun', 'Pemadam Api', 'Brankas', 'Balon Pesta', 'Topi Pesta', 'Peralatan Makan Sekali Pakai', 'Selempang Pesta'] },
          { label: 'Dekorasi, Organizer & Perawatan Rumah', feeBiasa: 8, feeKhusus: 9.5, tags: ['Bingkai Foto', 'Karpet', 'Tirai', 'Gorden', 'Cermin', 'Jam Dinding', 'Dekorasi Dinding', 'Lilin', 'Vas Bunga', 'Wallpaper', 'Stiker Dinding', 'Box Penyimpanan', 'Organizer Lemari', 'Gantungan', 'Tempat Sampah', 'Sapu', 'Kain Pel', 'Spons', 'Detergen', 'Tisu', 'Kantong Plastik', 'Tali Jemuran'] },
        ],
      },
      {
        label: 'Sepeda Motor',
        items: [
          { label: 'Sepeda Motor, Suku Cadang & Aksesoris', feeBiasa: 7.5, feeKhusus: 9, tags: ['Sepeda Motor', 'Helm Motor', 'Aksesoris Helm', 'Suku Cadang Motor', 'Ban Motor', 'Aki Motor', 'Knalpot Motor', 'Sarung Motor', 'Spion Motor', 'Box Motor', 'Aksesoris Motor', 'Oli Motor'] },
        ],
      },
    ],
  },

  // ─── LAINNYA ──────────────────────────────────────────────────
  {
    id: 'lainnya',
    label: 'Lainnya',
    subs: [
      {
        label: 'Tiket, Voucher & Layanan',
        items: [
          { label: 'Tiket, Voucher & Layanan (Umum)', feeBiasa: 5.5, feeKhusus: 7, tags: ['Tiket Event', 'Tiket Konser', 'Gaming', 'Streaming', 'Pulsa', 'Data Internet', 'Voucher Hotel', 'Paket Tour', 'Penerbangan', 'Makanan Dine-in', 'Listrik Token', 'Gas', 'Telco'] },
          { label: 'E-Money', feeBiasa: 7.5, feeKhusus: 9, tags: ['E-Money', 'Dompet Digital', 'ShopeePay', 'GoPay', 'OVO', 'Dana', 'LinkAja'] },
        ],
      },
    ],
  },
]
