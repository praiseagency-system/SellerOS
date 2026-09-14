// Urgensi keputusan untuk campaign yang masih menunggu persetujuan, diturunkan
// dari tanggal mulai: keputusan seharusnya jatuh SEBELUM campaign berjalan.
// Tidak ada kolom "batas keputusan" di data — kalau nanti ada, helper ini
// tempat menggabungkannya (kolom eksplisit menang, sisanya aturan ini).
import { campaignPeriods, periodBounds, campaignStatus, fmtDate } from './campaignPeriods'

const DAY = 86400000
const CLS = {
  red:     'bg-red-500/12 text-red-300',
  amber:   'bg-amber-500/12 text-amber-300',
  neutral: 'bg-gray-600/20 text-gray-400',
}

// Hasil: { key, rank, sortKey, days, label, cls }
// rank  : 0 sudah berjalan / pendaftaran sudah ditutup · 1 terjadwal atau
//         batas pendaftaran masih terbuka · 4 tanpa tanggal · 9 selesai
// sortKey: pengurut di dalam rank yang sama (kecil = lebih mendesak)
export function decisionUrgency(c, now = Date.now()) {
  const st = campaignStatus(c, now)
  if (st.key === 'ended') return { key: 'ended', rank: 9, sortKey: 0, days: null, label: 'Campaign selesai', cls: CLS.neutral }

  // Batas pendaftaran eksplisit (kolom registration_deadline, 0063) menang atas
  // aturan turunan tanggal mulai — inilah deadline yang sebenarnya.
  const dl = c?.registrationDeadline
  if (dl && st.key !== 'running' && st.key !== 'gap') {
    const end = new Date(dl + 'T23:59:59').getTime()
    if (!isNaN(end)) {
      if (now > end) {
        const days = Math.ceil((now - end) / DAY)
        return { key: 'closed', rank: 0, sortKey: end, days, label: `Pendaftaran ditutup ${fmtDate(dl)} · lewat ${days} hari`, cls: CLS.red }
      }
      const days = Math.floor((end - now) / DAY)
      return {
        key: 'deadline', rank: 1, sortKey: end, days,
        label: days <= 0 ? `Daftar hari ini · batas ${fmtDate(dl)}` : `Daftar sebelum ${fmtDate(dl)} · ${days} hari lagi`,
        cls: days <= 3 ? CLS.red : days <= 7 ? CLS.amber : CLS.neutral,
      }
    }
  }
  if (st.key === 'draft') return { key: 'nodate', rank: 4, sortKey: 0, days: null, label: 'Tanpa tanggal', cls: CLS.neutral }

  const list = campaignPeriods(c)
  if (st.key === 'running' || st.key === 'gap') {
    // Sudah dimulai tanpa keputusan: tiap hari = kehilangan promo. Yang paling
    // cepat berakhir naik ke atas (kesempatan terakhir).
    const started = list.filter(p => periodBounds(p).from <= now)
    const from = Math.max(...started.map(p => periodBounds(p).from))
    const to = Math.min(...list.filter(p => periodBounds(p).to >= now).map(p => periodBounds(p).to))
    const days = Number.isFinite(from) ? Math.floor((now - from) / DAY) : 0
    return {
      key: 'started', rank: 0, sortKey: Number.isFinite(to) ? to : Number.MAX_SAFE_INTEGER, days,
      label: days > 0 ? `Sudah berjalan ${days} hari · belum diputuskan` : 'Mulai hari ini · belum diputuskan',
      cls: CLS.red,
    }
  }

  // Terjadwal: hitung hari ke tanggal mulai terdekat.
  const next = list.find(p => periodBounds(p).from > now)
  const from = periodBounds(next).from
  const days = Math.ceil((from - now) / DAY)
  return {
    key: 'upcoming', rank: 1, sortKey: from, days,
    label: days <= 0 ? 'Mulai hari ini' : `Mulai ${days} hari lagi`,
    cls: days <= 3 ? CLS.red : days <= 7 ? CLS.amber : CLS.neutral,
  }
}
