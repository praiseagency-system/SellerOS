import { describe, it, expect } from 'vitest'
import { foldSessions } from '../gmvmaxSessions'

// Potret harian mencatat ULANG sesi yang sama tiap pagi selama ia berjalan.
// Yang dilihat pembaca panel adalah SESI-nya, bukan penampakan hariannya.
const potret = (o = {}) => ({
  session_id: 'S1', campaign_id: '111', campaign_name: 'Exotic Blue GMV Max',
  bid_type: 'CREATIVE_NO_BID', budget: 50000, item_id: '999', spu_id: '77',
  schedule_start_time: '2026-08-28T18:30:08.000Z', snapshot_date: '2026-08-29', ...o,
})

describe('foldSessions', () => {
  it('menggabung penampakan harian jadi satu sesi + rentang terlihatnya', () => {
    const out = foldSessions([
      potret({ snapshot_date: '2026-08-28' }),
      potret({ snapshot_date: '2026-08-29' }),
      potret({ snapshot_date: '2026-08-30' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].first_seen).toBe('2026-08-28')
    expect(out[0].last_seen).toBe('2026-08-30')
    expect(out[0].seen_days).toBe(3)
  })

  it('memungut item_id dari potret mana pun yang memilikinya', () => {
    // Baris sebelum 31 Agu 2026 ditulis sebelum endpoint detail dipanggil →
    // item_id-nya null. Kalau penampakan pertama yang menang mentah-mentah,
    // videonya akan hilang padahal potret berikutnya sudah membawanya.
    const out = foldSessions([
      potret({ snapshot_date: '2026-08-28', item_id: null }),
      potret({ snapshot_date: '2026-08-29', item_id: '999' }),
    ])
    expect(out[0].item_id).toBe('999')
    expect(out[0].first_seen).toBe('2026-08-28')
  })

  it('sesi terbaru di atas', () => {
    const out = foldSessions([
      potret({ session_id: 'LAMA', schedule_start_time: '2026-08-20T00:00:00.000Z' }),
      potret({ session_id: 'BARU', schedule_start_time: '2026-08-30T00:00:00.000Z' }),
    ])
    expect(out.map(s => s.session_id)).toEqual(['BARU', 'LAMA'])
  })

  it('daftar kosong tidak meledak', () => {
    expect(foldSessions()).toEqual([])
    expect(foldSessions([])).toEqual([])
  })
})
