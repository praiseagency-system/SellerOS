// Jadwal sesi boost — dipakai bersama form Creative Boost & Max Delivery.
//
// ASIMETRI yang bukan pilihan kita (skema campaign_gmv_max_session_create):
//   Max Delivery   → schedule_start_time DIDUKUNG, boleh dijadwalkan mulai nanti.
//   Creative Boost → jadwalnya "antara WAKTU SEKARANG dan schedule_end_time";
//                    start tak bisa dimundurkan. Jadi kolom mulai disembunyikan
//                    dan diganti keterangan jujur, bukan kolom mati yang menipu.
//
// Zona waktu ditampilkan APA ADANYA. Di Ads Manager, pemilih jadwal sempat
// menunjukkan UTC+13 Samoa sementara akun iklannya Asia/Jakarta — kalau pengguna
// mengetik jam sambil mengira itu WIB, sesinya mulai 6 jam lebih awal. Di sini
// zona yang dipakai dicetak di layar supaya salah baca tak mungkin senyap.
import { AlertTriangle } from 'lucide-react'
import { MAX_SESSION_HOURS, SUPPORTS_START_TIME } from '../../data/gmvmaxCampaignControl'
import { toLocalInput, localZone } from '../../utils/gmvmaxSchedule'

const fmtFull = (v) => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function SessionSchedule({ kind, startAt, endAt, onChange, nowMs }) {
  const bisaMulaiNanti = SUPPORTS_START_TIME[kind]
  const startMs = bisaMulaiNanti && startAt ? Date.parse(startAt) : null
  const endMs = endAt ? Date.parse(endAt) : null
  const anchor = Number.isFinite(startMs) && startMs > nowMs ? startMs : nowMs
  const jam = Number.isFinite(endMs) ? (endMs - anchor) / 3600000 : null

  const terlaluPanjang = jam != null && jam > MAX_SESSION_HOURS
  const terbalik = jam != null && jam <= 0
  const mulaiLampau = Number.isFinite(startMs) && startMs < nowMs - 60000

  const inputCls = 'mt-1 w-full bg-surface2 border border-line/15 rounded-lg px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-violet-500/40'

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-3">
        {bisaMulaiNanti ? (
          <label className="block">
            <span className="text-[11px] text-ink-muted">Mulai</span>
            <input type="datetime-local" value={startAt || ''} min={toLocalInput(new Date(nowMs))}
              onChange={e => onChange({ startAt: e.target.value, endAt })} className={inputCls} />
            <span className="text-[10px] text-ink-faint">kosongkan artinya seketika</span>
          </label>
        ) : (
          <div>
            <span className="text-[11px] text-ink-muted">Mulai</span>
            <div className="mt-1 w-full bg-surface2/50 border border-line/10 rounded-lg px-2.5 py-1.5 text-sm text-ink-muted">
              Seketika
            </div>
            <span className="text-[10px] text-ink-faint">Creative Boost tak bisa dijadwalkan maju</span>
          </div>
        )}

        <label className="block">
          <span className="text-[11px] text-ink-muted">Selesai</span>
          <input type="datetime-local" value={endAt || ''} min={toLocalInput(new Date(nowMs))}
            onChange={e => onChange({ startAt, endAt: e.target.value })} className={inputCls} />
          <span className="text-[10px] text-ink-faint">maksimal {MAX_SESSION_HOURS} jam</span>
        </label>
      </div>

      <p className="text-[11px] text-ink-faint leading-relaxed">
        Waktu di atas dibaca sebagai <span className="text-ink-muted font-medium">{localZone()}</span>.
        {jam != null && !terbalik && (
          <> Sesi berjalan {jam < 1 ? `${Math.round(jam * 60)} menit` : `${Math.round(jam * 10) / 10} jam`}
            {' '}dan berakhir <span className="text-ink-muted">{fmtFull(endAt)}</span>.</>
        )}
      </p>

      {(terlaluPanjang || terbalik || mulaiLampau) && (
        <p className="text-[11px] text-amber-400 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          <span>
            {terbalik && 'Waktu selesai harus setelah waktu mulai.'}
            {terlaluPanjang && `Jendela ${Math.round(jam)} jam melewati pagar ${MAX_SESSION_HOURS} jam. Pagar ini milik kita sendiri, bukan TikTok — vonis eksperimen dinilai di H+3.`}
            {mulaiLampau && 'Waktu mulai sudah lewat — TikTok menolak start di masa lalu.'}
          </span>
        </p>
      )}
    </div>
  )
}
