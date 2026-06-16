// Biaya Administrasi Shopee per kategori — sumber: Pusat Edukasi Penjual Shopee
// fee = Non-Star seller rate (%). special=true → ada ketentuan tambahan.

export const FEE_DATA = [
  {
    id: 'fashion',
    label: 'Fashion',
    subs: [
      {
        label: 'Aksesoris Fashion',
        items: [
          { label: 'Aksesoris Rambut', tags: ['Bando & Bandana', 'Ikat Rambut', 'Pita & Scrunchie', 'Jepitan & Pin Rambut', 'Rambut Palsu & Extension', 'Hiasan Kepala', 'Tiara & Mahkota Bunga'], fee: 9.00 },
          { label: 'Aksesoris Tambahan – Masker', tags: ['Masker'], fee: 8.25 },
          { label: 'Aksesoris Tambahan – Umum', tags: ['Bros & Pin', 'Bordir', 'Liontin', 'Kancing Manset', 'Tato Temporer', 'Sapu Tangan'], fee: 9.00 },
          { label: 'Anting', tags: ['Anting'], fee: 9.00 },
          { label: 'Cincin', tags: ['Cincin'], fee: 9.00 },
          { label: 'Dasi', tags: ['Dasi'], fee: 9.00 },
          { label: 'Gelang Tangan & Kaki', tags: ['Gelang Kaki', 'Gelang Tangan', 'Bangle'], fee: 9.00 },
          { label: 'Ikat Pinggang', tags: ['Ikat Pinggang'], fee: 9.00 },
          { label: 'Kacamata & Aksesoris', tags: ['Kacamata Hitam', 'Frame Kacamata', 'Tempat Kacamata'], fee: 9.00 },
          { label: 'Kalung', tags: ['Kalung'], fee: 9.00 },
          { label: 'Logam Mulia', tags: ['Platinum & Emas', 'Perak', 'Berlian', 'Permata'], fee: 4.25 },
          { label: 'Sarung Tangan', tags: ['Sarung Tangan'], fee: 9.00 },
          { label: 'Set & Paket Aksesoris', tags: ['Set Aksesoris'], fee: 9.00 },
          { label: 'Syal & Selendang', tags: ['Syal', 'Selendang'], fee: 9.00 },
          { label: 'Topi', tags: ['Topi'], fee: 9.00 },
        ],
      },
      {
        label: 'Fashion Bayi & Anak',
        items: [
          { label: 'Aksesoris Bayi & Anak (Tas, Jam, Topi)', tags: ['Ransel', 'Tas Selempang', 'Jam Tangan', 'Topi', 'Kacamata', 'Aksesoris Rambut', 'Jas Hujan', 'Sepatu Boot Hujan'], fee: 9.00 },
          { label: 'Perhiasan Bayi & Anak', tags: ['Gelang', 'Anting', 'Kalung', 'Cincin'], fee: 4.25 },
          { label: 'Pakaian Anak Laki-Laki', tags: ['Kaos', 'Kemeja', 'Jeans', 'Celana', 'Jaket', 'Sweater', 'Kostum'], fee: 9.00 },
          { label: 'Pakaian Anak Perempuan', tags: ['Kaos', 'Dress', 'Rok', 'Legging', 'Sweater', 'Kostum'], fee: 9.00 },
          { label: 'Pakaian Bayi', tags: ['Bodysuit', 'Jumper', 'Set Bayi', 'Baju Tidur Bayi'], fee: 9.00 },
          { label: 'Sepatu Anak & Bayi', tags: ['Sepatu Anak Laki-Laki', 'Sepatu Anak Perempuan', 'Sepatu Bayi', 'Sandal Anak'], fee: 9.00 },
        ],
      },
      {
        label: 'Fashion Muslim',
        items: [
          { label: 'Baju Olahraga & Renang Muslim', tags: ['Baju Olahraga Muslim', 'Baju Renang Muslim'], fee: 10.00, special: true },
          { label: 'Mukena & Perlengkapan Sholat', tags: ['Mukena', 'Sajadah', 'Peci', 'Songkok', 'Set Sholat'], fee: 8.25 },
          { label: 'Pakaian Muslim Wanita', tags: ['Hijab', 'Gamis', 'Abaya', 'Kaftan', 'Tunik', 'Khimar', 'Pashmina'], fee: 9.00 },
          { label: 'Pakaian Muslim Pria', tags: ['Gamis Pria', 'Baju Koko', 'Sarung', 'Baju Melayu'], fee: 9.00 },
          { label: 'Pakaian Muslim Anak', tags: ['Mukena Anak', 'Hijab Anak', 'Gamis Anak'], fee: 9.00 },
          { label: 'Set Pakaian Muslim', tags: ['Set Muslim'], fee: 9.00 },
        ],
      },
      {
        label: 'Jam Tangan',
        items: [
          { label: 'Aksesoris Jam Tangan', tags: ['Strap', 'Kotak Jam Tangan', 'Baterai Jam Tangan', 'Alat Servis'], fee: 9.00 },
          { label: 'Jam Tangan Pria', tags: ['Jam Tangan Pria'], fee: 9.00 },
          { label: 'Jam Tangan Wanita', tags: ['Jam Tangan Wanita'], fee: 9.00 },
          { label: 'Jam Tangan Couple', tags: ['Jam Tangan Couple'], fee: 9.00 },
        ],
      },
      {
        label: 'Koper & Tas Travel',
        items: [
          { label: 'Tas Duffel', tags: ['Tas Duffel'], fee: 10.00, special: true },
          { label: 'Aksesoris Travel', tags: ['Passport Cover', 'Organizer Travel', 'Tag Koper', 'Bantal Leher', 'Botol Isi Ulang', 'Gembok Koper'], fee: 9.00 },
          { label: 'Koper', tags: ['Koper'], fee: 9.00 },
          { label: 'Tas Lipat & Serut', tags: ['Tas Serut', 'Tas Lipat'], fee: 9.00 },
        ],
      },
      {
        label: 'Pakaian Pria',
        items: [
          { label: 'Kaos Kaki', tags: ['Kaos Kaki'], fee: 10.00, special: true },
          { label: 'Atasan', tags: ['Kemeja', 'Kaos Polo', 'Kaos', 'Tanktop', 'Atasan Lainnya'], fee: 8.25 },
          { label: 'Celana Panjang & Jeans', tags: ['Celana Panjang', 'Jeans', 'Cargo', 'Jogger'], fee: 8.25 },
          { label: 'Celana Pendek', tags: ['Celana Pendek'], fee: 8.25 },
          { label: 'Hoodie & Sweatshirt', tags: ['Hoodie', 'Sweatshirt'], fee: 8.25 },
          { label: 'Jaket & Outerwear', tags: ['Jaket', 'Mantel', 'Rompi', 'Blazer'], fee: 8.25 },
          { label: 'Pakaian Dalam', tags: ['Celana Dalam', 'Kaos Dalam', 'Pakaian Termal'], fee: 8.25 },
          { label: 'Pakaian Tidur', tags: ['Pakaian Tidur'], fee: 8.25 },
          { label: 'Jas Formal & Setelan', tags: ['Jas Formal', 'Blazer Formal', 'Rompi Formal'], fee: 8.25 },
          { label: 'Sweater & Cardigan', tags: ['Sweater', 'Cardigan'], fee: 8.25 },
          { label: 'Kostum', tags: ['Kostum'], fee: 8.25 },
        ],
      },
      {
        label: 'Pakaian Wanita',
        items: [
          { label: 'Kaos Kaki', tags: ['Kaos Kaki'], fee: 10.00, special: true },
          { label: 'Stocking & Kaos Kaki Lainnya', tags: ['Stocking', 'Kaos Kaki Lainnya'], fee: 9.00 },
          { label: 'Atasan', tags: ['Tanktop', 'Kemben', 'Kaos', 'Kemeja & Blouse', 'Kaus Polo', 'Bodysuit'], fee: 8.25 },
          { label: 'Bawahan', tags: ['Jeans', 'Celana Panjang', 'Legging', 'Rok', 'Celana Pendek'], fee: 8.25 },
          { label: 'Dress', tags: ['Dress'], fee: 8.25 },
          { label: 'Jumpsuit & Overall', tags: ['Jumpsuit', 'Playsuit', 'Overall'], fee: 8.25 },
          { label: 'Hoodie & Jaket', tags: ['Hoodie', 'Sweatshirt', 'Jaket', 'Blazer', 'Cape'], fee: 8.25 },
          { label: 'Pakaian Dalam & Lingerie', tags: ['Bra', 'Celana Dalam', 'Lingerie', 'Korset'], fee: 8.25 },
          { label: 'Pakaian Tidur', tags: ['Piyama', 'Daster', 'Kimono'], fee: 8.25 },
          { label: 'Baju Hamil & Menyusui', tags: ['Baju Hamil', 'Bra Menyusui', 'Dress Hamil'], fee: 8.25 },
          { label: 'Wedding Dress', tags: ['Wedding Dress'], fee: 8.25 },
          { label: 'Kain (Batik, Kebaya, dll)', tags: ['Batik', 'Kebaya', 'Songket', 'Sutra'], fee: 8.25 },
          { label: 'Sweater & Cardigan', tags: ['Sweater', 'Cardigan'], fee: 8.25 },
        ],
      },
      {
        label: 'Sepatu Pria',
        items: [
          { label: 'Aksesoris & Perawatan Sepatu', tags: ['Tali Sepatu', 'Parfum Sepatu', 'Insole', 'Shoe Tree'], fee: 9.00 },
          { label: 'Boot', tags: ['Boot Fashion', 'Safety Boot', 'Sepatu Boot Hujan'], fee: 9.00 },
          { label: 'Loafer', tags: ['Loafer'], fee: 9.00 },
          { label: 'Oxford', tags: ['Oxford'], fee: 9.00 },
          { label: 'Sandal', tags: ['Sandal Jepit', 'Sandal Slide', 'Sandal Rumah', 'Sandal Kesehatan'], fee: 9.00 },
          { label: 'Sneakers', tags: ['Sneakers'], fee: 9.00 },
          { label: 'Slip-On & Mules', tags: ['Slip-On', 'Mules'], fee: 9.00 },
        ],
      },
      {
        label: 'Sepatu Wanita',
        items: [
          { label: 'Aksesoris & Perawatan Sepatu', tags: ['Tali Sepatu', 'Parfum Sepatu', 'Sol Dalam', 'Perawatan Sepatu'], fee: 9.00 },
          { label: 'Boots', tags: ['Boot Fashion', 'Sepatu Boot Hujan'], fee: 9.00 },
          { label: 'Heels', tags: ['Heels'], fee: 9.00 },
          { label: 'Sandal', tags: ['Sandal Flat', 'Sandal Jepit', 'Sandal Kesehatan', 'Sandal Rumah'], fee: 9.00 },
          { label: 'Sepatu Flat & Loafer', tags: ['Flat', 'Ballerina', 'Loafer', 'Oxford', 'Slip-On', 'Mules', 'Mary Janes'], fee: 9.00 },
          { label: 'Sneakers', tags: ['Sneakers'], fee: 9.00 },
          { label: 'Wedges', tags: ['Wedges'], fee: 9.00 },
        ],
      },
      {
        label: 'Tas Pria',
        items: [
          { label: 'Clutch', tags: ['Clutch'], fee: 9.00 },
          { label: 'Dompet', tags: ['Dompet Kartu', 'Dompet Koin', 'Dompet Lipat', 'Dompet Panjang'], fee: 9.00 },
          { label: 'Ransel & Tas Kerja', tags: ['Ransel Pria', 'Tas Kerja', 'Tas Laptop'], fee: 9.00 },
          { label: 'Tas Pinggang & Selempang', tags: ['Tas Pinggang', 'Tas Selempang', 'Tas Bahu'], fee: 9.00 },
          { label: 'Tote Bag', tags: ['Tote Bag'], fee: 9.00 },
        ],
      },
      {
        label: 'Tas Wanita',
        items: [
          { label: 'Aksesoris Tas', tags: ['Tali Tas', 'Gantungan Tas', 'Organizer Tas', 'Pembersih Tas'], fee: 9.00 },
          { label: 'Clutch', tags: ['Clutch'], fee: 9.00 },
          { label: 'Dompet', tags: ['Dompet Kartu', 'Dompet Koin', 'Dompet Lipat', 'Dompet Panjang'], fee: 9.00 },
          { label: 'Ransel & Tas Laptop', tags: ['Ransel Wanita', 'Tas Laptop'], fee: 9.00 },
          { label: 'Tas Pinggang & Selempang', tags: ['Tas Pinggang', 'Tas Selempang', 'Tas Bahu'], fee: 9.00 },
          { label: 'Top Handle Bag', tags: ['Top Handle Bag'], fee: 9.00 },
          { label: 'Tote Bag', tags: ['Tote Bag'], fee: 9.00 },
        ],
      },
    ],
  },

  {
    id: 'fmcg',
    label: 'FMCG',
    subs: [
      {
        label: 'Makanan & Minuman',
        items: [
          { label: 'Makanan Ringan (Biskuit, Keripik, dll)', tags: ['Biskuit', 'Keripik & Kerupuk', 'Kacang', 'Popcorn', 'Dendeng', 'Buah Kering', 'Abon', 'Snack Seafood'], fee: 10.00, special: true },
          { label: 'Permen & Cokelat', tags: ['Permen', 'Cokelat'], fee: 9.50 },
          { label: 'Makanan Instan', tags: ['Mie Instan', 'Nasi & Bubur Instan', 'Hotpot Instan', 'Makanan Siap Saji'], fee: 9.00 },
          { label: 'Susu & Olahan', tags: ['Susu UHT', 'Susu Bubuk', 'Susu Kental', 'Yoghurt', 'Keju', 'Mentega', 'Margarin'], fee: 8.25 },
          { label: 'Bahan Baking', tags: ['Tepung', 'Baking Powder', 'Pewarna Makanan', 'Bahan Dekorasi Kue'], fee: 6.75 },
          { label: 'Telur', tags: ['Telur'], fee: 6.50 },
          { label: 'Makanan & Minuman Lainnya', tags: [], fee: 9.50 },
        ],
      },
      {
        label: 'Kecantikan',
        items: [
          { label: 'Alat Kecantikan (Hair Dryer, Sisir, dll)', tags: ['Hair Dryer', 'Sisir', 'Alat Styling Rambut', 'Facial Steamer', 'Alat Pembersih Wajah'], fee: 8.25 },
          { label: 'Perawatan Kulit & Wajah', tags: ['Moisturizer', 'Serum', 'Sunscreen', 'Toner', 'Masker Wajah'], fee: 8.25 },
          { label: 'Makeup & Kosmetik', tags: ['Lipstik', 'Foundation', 'Bedak', 'Maskara', 'Eyeliner'], fee: 8.25 },
          { label: 'Perawatan Rambut', tags: ['Shampo', 'Kondisioner', 'Hair Mask', 'Minyak Rambut'], fee: 8.25 },
          { label: 'Parfum & Deodoran', tags: ['Parfum', 'Body Spray', 'Deodoran'], fee: 8.25 },
        ],
      },
      {
        label: 'Kesehatan',
        items: [
          { label: 'Hand Sanitizer', tags: ['Hand Sanitizer'], fee: 10.00, special: true },
          { label: 'Obat-obatan & Alat Kesehatan', tags: ['Obat Bebas', 'Masker Medis', 'Sarung Tangan Medis', 'Plester & Perban', 'Antiseptik', 'Alat Medis'], fee: 9.50 },
          { label: 'Perawatan Diri (Pembalut, dll)', tags: ['Pembalut', 'Panty Liner', 'Tampon', 'Tes Kehamilan'], fee: 9.00 },
          { label: 'Kesehatan Seksual', tags: ['Kondom', 'Pelumas'], fee: 9.00 },
          { label: 'Vitamin & Suplemen (Dewasa)', tags: ['Vitamin', 'Suplemen', 'Herbal'], fee: 9.50 },
        ],
      },
      {
        label: 'Ibu & Bayi',
        items: [
          { label: 'Mainan – Inflatable & Perosotan', tags: ['Inflatable', 'Perosotan'], fee: 10.00, special: true },
          { label: 'Keamanan Bayi', tags: ['Baby Monitor', 'Pintu & Pagar Bayi', 'Kelambu', 'Bumper Ranjang'], fee: 9.50 },
          { label: 'Popok & Pispot', tags: ['Popok Sekali Pakai', 'Popok Kain', 'Perlak', 'Pispot'], fee: 9.00 },
          { label: 'Kamar Bayi', tags: ['Boks Bayi', 'Ayunan Bayi', 'Baby Walker', 'Selimut', 'Bantal & Guling', 'Sprei Bayi'], fee: 8.25 },
          { label: 'Susu Formula & Makanan Bayi', tags: ['Susu Formula', 'Bubur Bayi', 'Sereal Bayi', 'Camilan Bayi'], fee: 6.75 },
          { label: 'Vitamin & Suplemen Bayi', tags: ['Vitamin Bayi', 'Suplemen Bayi'], fee: 6.50 },
          { label: 'Ibu & Bayi Lainnya', tags: [], fee: 8.25 },
        ],
      },
    ],
  },

  {
    id: 'elektronik',
    label: 'Elektronik',
    subs: [
      {
        label: 'Handphone & Aksesoris',
        items: [
          { label: 'Casing, Pelindung Layar, Aksesoris HP', tags: ['Casing HP', 'Pelindung Layar', 'Phone Holder', 'Tali Handphone', 'Pouch HP', 'Tongsis'], fee: 10.00, special: true },
          { label: 'Charger, Kabel & Adaptor', tags: ['Charger', 'Kabel HP', 'Charger Docking', 'Travel Adaptor'], fee: 10.00, special: true },
          { label: 'Powerbank & Baterai HP', tags: ['Powerbank', 'Powercase', 'Baterai HP'], fee: 9.50 },
          { label: 'Aksesoris Wearable', tags: ['Aksesoris Smartwatch', 'Strap Jam'], fee: 9.50 },
          { label: 'Kartu Memori', tags: ['Kartu Memori', 'Alat Casting'], fee: 9.00 },
          { label: 'Modem & USB', tags: ['Modem', 'USB Handphone', 'Lampu Handphone'], fee: 6.75 },
          { label: 'Earphone & Headphone', tags: ['Earphone', 'Headphone', 'TWS', 'Headset'], fee: 6.75 },
          { label: 'Handphone', tags: ['Handphone', 'Smartphone'], fee: 5.25 },
          { label: 'Handphone & Aksesoris Lainnya', tags: [], fee: 10.00, special: true },
        ],
      },
      {
        label: 'Komputer & Aksesoris',
        items: [
          { label: 'Aksesoris Laptop (Tas, Stand, Cooling Pad)', tags: ['Cooling Pad', 'Meja Laptop', 'Stand Laptop', 'Pelindung Laptop', 'Webcam', 'Charger Laptop'], fee: 6.75 },
          { label: 'USB HUB & Card Reader', tags: ['USB HUB', 'Card Reader'], fee: 6.75 },
          { label: 'Mouse Pad', tags: ['Mouse Pad'], fee: 6.75 },
          { label: 'Komponen Network (Router, Switch)', tags: ['Modem & Router', 'Repeater', 'Switch Internet', 'Wireless Adapter'], fee: 9.50 },
          { label: 'Sound Card', tags: ['Sound Card'], fee: 6.50 },
          { label: 'Desktop PC', tags: ['PC Desktop', 'PC Mini', 'All-in-One', 'Server PC'], fee: 5.25 },
          { label: 'Komputer & Aksesoris Lainnya', tags: [], fee: 6.75 },
        ],
      },
      {
        label: 'Audio',
        items: [
          { label: 'Earphone & Headphone', tags: ['Earphone', 'Headphone', 'TWS', 'Headset'], fee: 6.75 },
          { label: 'Amplifier & Mixer', tags: ['Amplifier', 'Mixer'], fee: 9.00 },
          { label: 'Media Player (MP3, DVD, Radio)', tags: ['MP3 Player', 'DVD Player', 'Radio', 'Voice Recorder'], fee: 9.50 },
          { label: 'Audio Lainnya', tags: [], fee: 9.00 },
        ],
      },
      {
        label: 'Gaming & Konsol',
        items: [
          { label: 'Konsol Game', tags: ['Playstation', 'Xbox', 'Nintendo Switch', 'PSP', 'PS Vita', 'Nintendo 3DS'], fee: 9.50 },
          { label: 'Aksesoris Konsol', tags: ['Controller', 'Headset Gaming', 'Joystick', 'Aksesoris Konsol Lainnya'], fee: 9.00 },
        ],
      },
      {
        label: 'Kamera & Drone',
        items: [
          { label: 'Aksesoris Kamera (Tripod, Flash, Gimbal)', tags: ['Tripod', 'Flash', 'Gimbal', 'Baterai Kamera', 'Charger Kamera', 'Tas Kamera', 'Printer Foto'], fee: 9.50 },
          { label: 'Kamera Keamanan / CCTV', tags: ['CCTV', 'Kamera Keamanan', 'DVR', 'Kamera Pengintai'], fee: 9.50 },
          { label: 'Aksesoris Drone', tags: ['Aksesoris Drone'], fee: 6.50 },
          { label: 'Kamera & Drone Lainnya', tags: [], fee: 9.50 },
        ],
      },
      {
        label: 'Elektronik Umum',
        items: [
          { label: 'Kelistrikan (Stop Kontak, Saklar, Alarm)', tags: ['Stop Kontak', 'Sambungan Kabel', 'Saklar', 'Alarm', 'Bel', 'Anti Petir'], fee: 10.00, special: true },
          { label: 'Baterai', tags: ['Baterai AA', 'Baterai AAA', 'Baterai Kancing'], fee: 9.50 },
          { label: 'Peralatan Listrik Besar (Mesin Cuci, AC, Kipas)', tags: ['Mesin Cuci', 'Pengering Pakaian', 'AC', 'AC Portable', 'Kipas Angin'], fee: 6.50 },
          { label: 'Proyektor', tags: ['Proyektor', 'Layar Proyektor', 'Pointer'], fee: 5.25 },
          { label: 'Elektronik Lainnya', tags: [], fee: 9.00 },
        ],
      },
    ],
  },

  {
    id: 'lifestyle',
    label: 'Lifestyle',
    subs: [
      {
        label: 'Olahraga & Outdoor',
        items: [
          { label: 'Aksesoris Olahraga & Outdoor', tags: ['Tas Olahraga', 'Topi Olahraga', 'Ikat Kepala', 'Tas Anti Air', 'Alat Training', 'Stopwatch', 'Gelang Olahraga'], fee: 10.00, special: true },
          { label: 'Jas Hujan', tags: ['Jas Hujan'], fee: 8.25 },
          { label: 'Olahraga & Outdoor Lainnya', tags: [], fee: 10.00, special: true },
        ],
      },
      {
        label: 'Perlengkapan Rumah',
        items: [
          { label: 'Alat Pengaman (Brankas, Gembok, Pemadam)', tags: ['Brankas', 'Pemadam Api', 'Gembok', 'Perangkat Pintu'], fee: 10.00, special: true },
          { label: 'Lampu', tags: ['Lampu LED', 'Lampu Hias', 'Lampu Meja'], fee: 9.50 },
          { label: 'Dekorasi – Bunga', tags: ['Bunga', 'Tanaman Hias'], fee: 9.00 },
          { label: 'Peralatan Dapur – Sealer', tags: ['Sealer', 'Alat Vakum'], fee: 6.50 },
          { label: 'Perlengkapan Rumah Lainnya', tags: [], fee: 10.00, special: true },
        ],
      },
      {
        label: 'Hobi & Koleksi',
        items: [
          { label: 'Alat & Aksesoris Musik', tags: ['Gitar', 'Keyboard', 'Piano', 'Ukulele', 'Gitar Bass', 'Alat Musik Tiup', 'Alat Musik Perkusi'], fee: 9.50 },
          { label: 'Souvenir & Hadiah', tags: ['Gantungan Kunci', 'Magnet Kulkas', 'Celengan', 'Kipas Tangan'], fee: 9.00 },
          { label: 'Hobi & Koleksi Lainnya', tags: [], fee: 9.50 },
        ],
      },
      {
        label: 'Buku & Alat Tulis',
        items: [
          { label: 'Perlengkapan Menggambar', tags: ['Pensil Warna', 'Krayon', 'Cat Air', 'Cat Akrilik', 'Kuas Lukis', 'Kanvas', 'Palet'], fee: 10.00, special: true },
          { label: 'Alat Tulis', tags: ['Pulpen', 'Pensil', 'Spidol', 'Highlighter', 'Penghapus', 'Tipe X'], fee: 9.00 },
          { label: 'Bubble Wrap & Kemasan', tags: ['Bubble Wrap'], fee: 9.50 },
          { label: 'Buku & Alat Tulis Lainnya', tags: [], fee: 10.00, special: true },
        ],
      },
      {
        label: 'Buku & Majalah',
        items: [
          { label: 'Majalah & Koran', tags: ['Majalah Bisnis', 'Majalah Gaya Hidup', 'Koran', 'Majalah Remaja'], fee: 10.00, special: true },
          { label: 'Buku Komik & Audio', tags: ['Komik', 'Buku Audio'], fee: 9.50 },
          { label: 'Buku Umum (Non-Fiksi, Fiksi, dll)', tags: ['Novel', 'Buku Pendidikan', 'Buku Resep', 'Buku Agama', 'Buku Bisnis', 'Buku Anak'], fee: 9.00 },
          { label: 'Buku & Majalah Lainnya', tags: [], fee: 9.50 },
        ],
      },
      {
        label: 'Hewan Peliharaan',
        items: [
          { label: 'Aksesoris & Mainan Hewan', tags: ['Tempat Tidur Hewan', 'Kandang', 'Mainan Kucing', 'Mainan Anjing', 'Akuarium', 'Mangkuk & Feeder'], fee: 9.50 },
        ],
      },
    ],
  },

  {
    id: 'lainnya',
    label: 'Lainnya',
    subs: [
      {
        label: 'Mobil',
        items: [
          { label: 'Suku Cadang Mobil', tags: ['Ban', 'Aki', 'Lampu Mobil', 'Filter Oli', 'Shock & Suspensi', 'Sistem Pengereman'], fee: 9.50 },
          { label: 'Oli & Pelumas Kendaraan', tags: ['Oli Mesin', 'Coolant', 'Pelumas Rem', 'Pelumas Transmisi'], fee: 9.00 },
          { label: 'Aksesoris Eksterior Mobil', tags: ['Stiker Mobil', 'Spion', 'Klakson', 'Sarung Mobil', 'Karpet Lumpur', 'Antena Mobil'], fee: 8.25 },
          { label: 'Mobil (Kendaraan)', tags: ['Mobil'], fee: 2.50 },
          { label: 'Mobil Lainnya', tags: [], fee: 8.25 },
        ],
      },
      {
        label: 'Sepeda Motor',
        items: [
          { label: 'Aksesoris Sepeda Motor', tags: ['Jok Motor', 'Spion Motor', 'Box Motor', 'Stiker Motor', 'Dudukan HP Motor', 'Kunci & Keamanan'], fee: 8.25 },
          { label: 'Sepeda Motor (Kendaraan)', tags: ['Sepeda Motor'], fee: 2.50 },
          { label: 'Sepeda Motor Lainnya', tags: [], fee: 8.25 },
        ],
      },
      {
        label: 'Tiket, Voucher & Layanan',
        items: [
          { label: 'Voucher Belanja / Ritel', tags: ['Voucher', 'Gift Card'], fee: 9.50 },
          { label: 'Gaming (Voucher Game, Top Up)', tags: ['Voucher Game', 'Top Up Game', 'Diamonds'], fee: 9.00 },
          { label: 'E-Money', tags: ['E-Money', 'OVO', 'GoPay', 'Dana', 'ShopeePay'], fee: 8.25 },
        ],
      },
    ],
  },
]
