// Pembangun REKOMENDASI AKSI harian (Opsi B — kartu per jenis pekerjaan).
// PURE: tak menyentuh jaringan/DB. Masukan sudah dimuat pemanggil.
//
// Beda dari mesin saran lama: keluaran Skills sengaja DESCRIPTIVE_ONLY dan
// menolak mengklaim aksi. Modul ini justru menghasilkan pekerjaan konkret yang
// bisa diantre ke 🔔 — dan tiap butirnya membawa SIDIK KONDISI.
//
// SIDIK KONDISI adalah kait untuk loop belajar. Begitu vonis H+7 berdatangan,
// buku pelajaran mencocokkan sidik ini ("boost pada status LEARNING, ROAS ≥6,
// belanja <50rb") dengan hasil nyatanya, lalu peringkat kartu menyusun ulang
// dirinya. Tanpa sidik, rekomendasi cuma kalimat dan vonis tak punya tempat
// menempel — itulah kenapa ia dipasang sejak baris pertama, bukan ditambal nanti.

const DAY = 86400000

// Ember dibuat KASAR dengan sengaja: pelajaran butuh banyak kasus per ember.
// Ember terlalu halus → tiap kondisi cuma punya 1-2 kasus dan tak pernah cukup
// bukti untuk naik status.
export function roasBucket(roas) {
  if (roas == null) return 'tak_terukur'
  if (roas >= 8) return '>=8'
  if (roas >= 6) return '6-8'
  if (roas >= 4) return '4-6'
  if (roas >= 1) return '1-4'
  return '<1'
}
export function spendBucket(cost, floor = 50000) {
  if (!(cost > 0)) return 'nol'
  if (cost < floor / 2) return 'sangat_kecil'
  if (cost < floor) return 'kecil'
  if (cost < floor * 4) return 'sedang'
  return 'besar'
}
export function ageDays(timePosted, now) {
  const t = Date.parse(timePosted)
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null
}

const sig = (o) => o   // penanda niat: objek ini disimpan apa adanya ke approval

// ── Alasan boost per video (Opsi A, 14 Sep 2026) ────────────────────────────
// Kartu kandidat boost menyaring dengan ROAS, tapi ROAS sendiri tak menjawab
// "kenapa video INI layak dinaikkan". Pada data nyata 1–12 Sep, video ber-ROAS
// 1918× ternyata cuma punya 4 impresi dan 0 klik: omzetnya lahir organik, bukan
// dari iklan. Boost atas dasar itu adalah UJI, bukan penggandaan. Maka tiap
// kandidat diberi VONIS dari jejak iklannya, lalu kalimat yang menyebut angka.
//
// Vonis SENGAJA tidak dimasukkan ke signature: bentuk sidik kondisi diuji
// persis (rekomendasi.test) dan pelajaran lama dicocokkan atasnya.
const MIN_IMPRESI_BUKTI = 50
export const VONIS_BOOST = {
  iklan:      { rank: 0, label: 'Terbukti lewat iklan',        tone: 'green' },
  organik:    { rank: 1, label: 'Laku organik, boost = uji',   tone: 'amber' },
  tak_tayang: { rank: 2, label: 'Tak tayang',                  tone: 'muted' },
}
const idn = (n) => Math.round(n).toLocaleString('id-ID')
const rpPendek = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(2).replace('.', ',')} jt`
  : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : idn(n)
const pct1 = (f) => `${(f * 100).toFixed(1).replace('.', ',')}%`
const pct0 = (f) => `${Math.round(f * 100)}%`
const tidakTayang = (delivery) => /NOT_DELIVER|TIDAK_?DITAYANG|NOT DELIVER/i.test(String(delivery || ''))

// Median CTR video yang impresinya cukup — pembanding "2,6× median" di kalimat.
export function medianCtr(videos, minImp = 100) {
  const xs = videos
    .filter(v => (v.lifetime?.impressions || 0) >= minImp && v.lifetime?.ctr != null)
    .map(v => v.lifetime.ctr).sort((a, b) => a - b)
  if (!xs.length) return null
  const m = xs.length >> 1
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2
}

export function boostVerdict(v, { floor = 50000, medianCtr: med = null } = {}) {
  const m = v.lifetime || {}
  const orders = m.orders || 0, imp = m.impressions || 0, clk = m.clicks || 0
  const cost = m.cost || 0, rev = m.revenue || 0
  const vr2s = m.funnel?.vr2s
  const bukti = `${orders} order${orders >= 2 ? ' berulang' : ''}, omzet ${rpPendek(rev)} dari cost ${idn(cost)} (${Math.max(1, Math.round(cost / floor * 100))}% lantai).`

  if (tidakTayang(v.delivery)) {
    return { vonis: 'tak_tayang', alasan: `${bukti} Saat ini tak tayang, ${idn(imp)} impresi: omzet sepenuhnya organik. Boost memaksa sistem menayangkannya lagi. Anggap sebagai uji.` }
  }
  if (imp < MIN_IMPRESI_BUKTI || clk === 0) {
    return { vonis: 'organik', alasan: `${bukti} Iklannya nyaris tak tayang: ${idn(imp)} impresi, ${idn(clk)} klik. Omzet ini lahir organik. Boost menguji apakah iklan bisa menambah.` }
  }
  const ctr = m.ctr, cvr = m.cvr
  const banding = med > 0 && ctr != null
    ? (ctr / med >= 1.3 ? ` (${(ctr / med).toFixed(1).replace('.', ',')}× median ${pct1(med)})`
      : ctr / med <= 0.7 ? ` (di bawah median ${pct1(med)})` : ' setara median')
    : ''
  const konversi = cvr == null ? '' : cvr > 1
    ? ', order melebihi klik (atribusi TikTok)'
    : `, ${pct0(cvr)} klik jadi order`
  const tahap = /LEARN|BELAJAR/i.test(String(v.delivery || ''))
    ? 'Masih belajar; boost mempercepat eksplorasi.'
    : 'Sedang tayang, tinggal diberi ruang belanja.'
  const hook = vr2s != null && imp >= MIN_IMPRESI_BUKTI && vr2s < 20
    ? ` Hook 2s ${Math.round(vr2s)}%, lemah: pantau retensi saat dinaikkan.` : ''
  return { vonis: 'iklan', alasan: `${bukti} Iklannya bekerja: CTR ${pct1(ctr)}${banding}${konversi}. ${tahap}${hook}` }
}

// ── Pembangun ───────────────────────────────────────────────────────────────
// videos      : hasil rollupVideos (punya lifetime, delivery, placements)
// thresholds  : { roasGood, roasBad, spendFloor }
// settings    : baris campaign_settings terbaru per campaign
// sparkAuth   : baris gmvmax_spark_auth potret terbaru
// excludes    : { keluar:Set, menunggu:Set } kunci `${videoId}|${campaignId}`
//               dari loadCreativeExcludeState() — jejak antrean 🔔.
export function buildRecommendations({
  videos = [], thresholds = {}, settings = [], sparkAuth = [], excludes = null, now = Date.now(),
} = {}) {
  const keluar = excludes?.keluar || new Set()
  const menunggu = excludes?.menunggu || new Set()

  // Sebuah PENEMPATAN (video × campaign) dianggap sudah keluar rotasi bila
  // TikTok sudah melaporkannya EXCLUDED, ATAU perintahnya sudah disetujui di 🔔.
  // Dua sumber, bukan satu, karena keduanya datang pada waktu berbeda: approval
  // detik ini, snapshot besok pagi.
  const tempatKeluar = (videoId, p) =>
    String(p.delivery || '').toUpperCase() === 'EXCLUDED' || keluar.has(`${videoId}|${p.campaignId}`)
  const berbelanja = (v) => (v.placements || []).filter(p => (p.cost || 0) > 0)

  // Video dianggap selesai dikerjakan hanya bila SEMUA penempatan yang masih
  // membelanjakan uang sudah dihentikan. Video yang ikut dua campaign dan baru
  // dikeluarkan dari satu masih membakar uang di sisanya — ia tetap ditagih.
  const sudahDihentikan = (v) => {
    const bs = berbelanja(v)
    if (bs.length) return bs.every(p => tempatKeluar(v.videoId, p))
    return String(v.delivery || '').toUpperCase() === 'EXCLUDED'
  }
  const sedangDiantre = (v) => {
    const bs = berbelanja(v)
    const list = bs.length ? bs : (v.placements || [])
    return list.some(p => menunggu.has(`${v.videoId}|${p.campaignId}`))
  }
  const floor = Number(thresholds.spendFloor) || 50000
  const good = Number(thresholds.roasGood) || 6
  const bad = Number(thresholds.roasBad) || 4

  // 1) Kandidat dinaikkan belanjanya — sudah terbukti laku, belum diberi ruang.
  //
  // GERBANG BUKTI. ROAS adalah rasio, dan rasio dengan penyebut nyaris nol tidak
  // membuktikan apa pun: pada data 27 Agu, 16 dari 18 "kandidat" ternyata
  // ber-cost di bawah Rp5.000 — satu di antaranya ROAS 2445x dari belanja Rp34
  // dengan 1 order. Omzetnya nyata, tapi datangnya bukan dari belanja itu.
  // Menyarankan boost atas dasar rasio semacam itu = menyuruh bertaruh pada
  // kebetulan. Jadi butuh SALAH SATU: belanja cukup besar untuk dipercaya, atau
  // konversi yang berulang.
  const minSpend = floor / 10
  const kredibel = (v) => v.lifetime.cost >= minSpend || (v.lifetime.orders || 0) >= 2
  const boostAll = videos
    .filter(v => (v.lifetime?.roas ?? 0) >= good && v.lifetime.cost > 0 && v.lifetime.cost < floor)
  const boostThin = boostAll.filter(v => !kredibel(v))
  const medCtr = medianCtr(videos)
  const boost = boostAll
    .filter(kredibel)
    .sort((a, b) => (b.lifetime.revenue || 0) - (a.lifetime.revenue || 0))
    .map(v => ({
      id: v.videoId, judul: v.title || v.videoId, akun: v.account,
      video: v,
      // Vonis + kalimat "kenapa boost" — kolom KENAPA di jendela daftar.
      ...boostVerdict(v, { floor, medianCtr: medCtr }),
      // Cost terlalu kecil untuk membuat ROAS bisa dipercaya. Bukan larangan —
      // order yang berulang tetap membuatnya layak — tapi angkanya perlu diberi
      // peringatan halus di tabel.
      thin: v.lifetime.cost < minSpend,
      // Urutan angka disengaja: order & omzet dulu (fakta yang kokoh), belanja
      // lalu ROAS terakhir. Memimpin dengan "ROAS 1124x" membuat rasio
      // berpenyebut Rp389 terbaca sebagai janji, padahal yang layak dipercaya
      // adalah konversi berulangnya.
      detail: `${v.lifetime.orders || 0} order · omzet ${Math.round(v.lifetime.revenue).toLocaleString('id-ID')} · cost ${Math.round(v.lifetime.cost).toLocaleString('id-ID')} · ROAS ${(v.lifetime.roas).toFixed(1)}×`,
      signature: sig({
        aksi: 'CREATIVE_BOOST', status: v.delivery || null,
        roas_bucket: roasBucket(v.lifetime.roas), spend_bucket: spendBucket(v.lifetime.cost, floor),
        // Selalu ADA meski null, supaya bentuk sidik tak berubah antar-zaman dan
        // pencocokan pelajaran tetap stabil. Catatan: pada data hari ini
        // time_posted kosong di SEMUA baris, jadi dimensi ini belum berguna.
        umur_video_hari: ageDays(v.timePosted, now),
      }),
    }))

  // 2) Otorisasi kedaluwarsa — video tak bisa diiklankan sampai kodenya diperbarui.
  const expired = sparkAuth
    .map(r => ({ r, t: Date.parse(r.auth_end_time) }))
    .filter(x => Number.isFinite(x.t) && x.t < now)
    .sort((a, b) => a.t - b.t)
    .map(({ r, t }) => ({
      id: r.item_id, judul: r.video_text || r.item_id, akun: r.tiktok_name,
      rawEnd: r.auth_end_time,
      detail: `izin habis ${new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} · ${Math.floor((now - t) / DAY)} hari lalu`,
      signature: sig({ aksi: 'REFRESH_AUTH', umur_kedaluwarsa_hari: Math.floor((now - t) / DAY) }),
    }))

  // 3) Campaign mati tapi budget masih terpasang — tak membakar uang, tapi
  //    mengaburkan angka rencana belanja.
  const idle = settings
    .filter(s => String(s.operation_status || '').toUpperCase() !== 'ENABLE' && Number(s.budget) > 0)
    .sort((a, b) => Number(b.budget) - Number(a.budget))
    .map(s => ({
      id: s.campaign_id, judul: s.campaign_name || s.campaign_id,
      budget: Number(s.budget), status: s.operation_status,
      detail: `budget ${Math.round(Number(s.budget)).toLocaleString('id-ID')} · status ${s.operation_status}`,
      signature: sig({ aksi: 'REVIEW_IDLE_BUDGET', budget: Number(s.budget) }),
    }))

  // 4) Butuh izin TAPI sudah menghasilkan — terbukti laku tanpa dibantu iklan,
  //    jadi paling layak dikejar kodenya lebih dulu.
  const earning = videos
    .filter(v => v.delivery === 'AUTHORIZATION_NEEDED' && (v.lifetime?.revenue || 0) > 0)
    .sort((a, b) => b.lifetime.revenue - a.lifetime.revenue)
    .map(v => ({
      id: v.videoId, judul: v.title || v.videoId, akun: v.account, video: v,
      detail: `omzet ${Math.round(v.lifetime.revenue).toLocaleString('id-ID')} tanpa kode spark`,
      signature: sig({
        aksi: 'CHASE_AUTH', roas_bucket: roasBucket(v.lifetime.roas),
        umur_video_hari: ageDays(v.timePosted, now),
      }),
    }))

  // 5) Boros — belanja sudah besar tapi tak menghasilkan.
  const borosSemua = videos
    .filter(v => v.lifetime.cost >= floor && (v.lifetime?.roas ?? 0) < bad)
    .sort((a, b) => b.lifetime.cost - a.lifetime.cost)
  // Yang sudah dihentikan DIKELUARKAN dari daftar kerja — bukan disembunyikan
  // diam-diam: jumlahnya diungkap di catatan kaki. Cost & ROAS-nya tetap besar
  // (angka sebulan tak bisa ditarik kembali), jadi tanpa saringan ini baris itu
  // akan menagih selamanya pekerjaan yang sudah beres.
  const borosSelesai = borosSemua.filter(sudahDihentikan)
  const wasteful = borosSemua
    .filter(v => !sudahDihentikan(v))
    .map(v => ({
      id: v.videoId, judul: v.title || v.videoId, akun: v.account, video: v,
      // Sudah diajukan tapi belum kamu setujui — barisnya tetap tampil (uangnya
      // masih terbakar) tapi tombolnya diganti keterangan supaya tak diantre dua kali.
      pending: sedangDiantre(v),
      detail: `cost ${Math.round(v.lifetime.cost).toLocaleString('id-ID')} · ROAS ${v.lifetime.roas == null ? '—' : v.lifetime.roas.toFixed(1) + '×'}`,
      signature: sig({
        aksi: 'CREATIVE_EXCLUDE', status: v.delivery || null,
        roas_bucket: roasBucket(v.lifetime.roas), spend_bucket: spendBucket(v.lifetime.cost, floor),
        umur_video_hari: ageDays(v.timePosted, now),
      }),
    }))

  const rp = (n) => Math.round(n).toLocaleString('id-ID')
  const omzetBoost = boost.reduce((s, x) => s + (x.video?.lifetime?.revenue || 0), 0)
  const costBoros = wasteful.reduce((s, x) => s + (x.video?.lifetime?.cost || 0), 0)

  // Urutan kartu = urutan pekerjaan yang masuk akal: peluang dulu (uang yang
  // belum diambil), lalu pemborosan, lalu perawatan, lalu kerapian.
  return [
    { key: 'BOOST_CANDIDATE', tone: 'green', items: boost,
      title: 'Kandidat dinaikkan belanjanya',
      subtitle: `ROAS ≥${good} tapi cost masih di bawah lantai${boost.length ? ` · omzet berjalan ${rp(omzetBoost)}` : ''}`,
      actionLabel: 'Buka daftar', minSpend,
      // Yang tersaring DIUNGKAP, bukan disembunyikan: kalau daftarnya pendek,
      // pengguna berhak tahu bahwa ada kandidat yang sengaja ditahan dan kenapa.
      footnote: boostThin.length
        ? `${boostThin.length} kandidat lain ditahan: cost-nya di bawah ${rp(minSpend)} dan ordernya belum berulang, jadi ROAS-nya belum membuktikan apa pun.`
        : null,
      emptyNote: 'Tak ada video berperforma tinggi yang cost-nya masih tertahan.' },

    { key: 'WASTEFUL', tone: 'red', items: wasteful,
      title: 'Video boros yang perlu dihentikan',
      subtitle: wasteful.length ? `cost ≥${rp(floor)} tapi ROAS di bawah ${bad} · total ${rp(costBoros)}` : `cost ≥${rp(floor)} tapi ROAS di bawah ${bad}`,
      actionLabel: 'Buka daftar',
      footnote: borosSelesai.length
        ? `${borosSelesai.length} video disembunyikan: sudah keluar dari rotasi (${rp(borosSelesai.reduce((s, v) => s + (v.lifetime?.cost || 0), 0))} cost bulan ini sudah berhenti). Tak ada lagi yang bisa dikerjakan di sana.`
        : null,
      emptyNote: borosSelesai.length
        ? `Semua video boros sudah dikeluarkan dari rotasi — ${borosSelesai.length} disembunyikan.`
        : 'Tidak ada — cost besar semuanya masih menghasilkan.' },

    { key: 'AUTH_NEEDED_EARNING', tone: 'amber', items: earning,
      title: 'Butuh izin, tapi sudah menghasilkan omzet',
      subtitle: 'terbukti laku tanpa dibantu iklan — paling layak dikejar kodenya',
      actionLabel: 'Buka daftar',
      emptyNote: 'Semua video berdaya sudah punya kode spark.' },

    { key: 'AUTH_EXPIRED', tone: 'amber', items: expired,
      title: 'Otorisasi spark kedaluwarsa',
      subtitle: sparkAuth.length
        ? `${expired.length ? Math.round(expired.length / sparkAuth.length * 100) + '% dari kolam · ' : ''}video tak bisa diiklankan sampai diperbarui`
        : 'potret otorisasi belum tersedia — menunggu sync harian',
      actionLabel: 'Salin daftar outreach',
      emptyNote: 'Semua otorisasi masih berlaku.' },

    { key: 'CAMPAIGN_IDLE_BUDGET', tone: 'blue', items: idle,
      title: 'Campaign mati, budget masih terpasang',
      subtitle: 'tak membakar uang, tapi mengaburkan angka rencana belanja',
      actionLabel: 'Buka daftar',
      emptyNote: 'Semua campaign nonaktif sudah bersih budgetnya.' },
  ]
}

export const totalActions = (groups = []) => groups.reduce((s, g) => s + g.items.length, 0)
