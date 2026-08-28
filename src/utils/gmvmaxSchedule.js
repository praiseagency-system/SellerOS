// Pembantu jadwal sesi boost. Terpisah dari komponennya karena berkas komponen
// hanya boleh mengekspor komponen (aturan react-refresh di repo ini).
//
// API menerima UTC+0; pengguna memilih waktu LOKAL peramban. Konversi terjadi
// di data layer (requestBoostSession) — di sini murni bentuk-mengubah-bentuk.
const pad = (n) => String(n).padStart(2, '0')

// Date → nilai <input type="datetime-local"> (waktu lokal peramban).
export const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

// Dipanggil dari event handler / initializer lazy, BUKAN badan render.
export const defaultSchedule = (hours = 24) => ({
  startAt: toLocalInput(new Date()),
  endAt: toLocalInput(new Date(Date.now() + hours * 3600 * 1000)),
})

// Zona waktu yang benar-benar dipakai peramban — dicetak di layar supaya salah
// baca zona (kasus UTC+13 Samoa di Ads Manager) tak mungkin terjadi senyap.
export const localZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'lokal' } catch { return 'lokal' }
}
