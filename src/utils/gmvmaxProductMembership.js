// Kapan sebuah produk MASUK dan KELUAR dari sebuah campaign.
//
// `item_group_ids` (daftar produk yang dipromosikan) sudah ikut terpotret tiap
// pagi sejak migrasi 0020, dan diffSettings sudah membandingkannya — tapi
// hasilnya tak pernah sampai ke layar tempat orang bertanya: tabel produk di
// detail campaign. Produk yang dicabut malah hilang sama sekali dari sana,
// karena tabel itu menampilkan yang ADA SEKARANG.
//
// Modul ini menyusun riwayat keanggotaan dari potret harian. Ia PURE — tak
// menyentuh jaringan — supaya bisa diuji tanpa Supabase (lihat jebakan Node 20
// pada tes yang mengimpor src/data/*).
//
// KEJUJURAN YANG DIJAGA:
//   · Produk yang sudah ada di potret PERTAMA tidak diklaim "ditambahkan hari
//     itu" — kita cuma tahu ia sudah ada. Bedanya ditandai `sinceFirstSnapshot`.
//   · `modifyTime` adalah cap waktu perubahan TERAKHIR pada campaign menurut
//     TikTok, bukan tentu jam produk itu dipasang. Kalau sehari ada beberapa
//     perubahan, semuanya memakai cap yang sama — makanya disimpan terpisah
//     dari tanggal potret, bukan digabung jadi satu "waktu kejadian".
//   · Hari yang tak terpotret = lubang. Produk yang masuk lalu keluar di dalam
//     lubang itu tak akan pernah terlihat; `gaps` melaporkannya apa adanya.

const DAY = 86400000
const ids = (r) => (Array.isArray(r?.item_group_ids) ? r.item_group_ids.map(String) : [])

// rows: baris gmvmax_campaign_settings SATU campaign, urutan bebas.
// → { first, last, snapshots, gaps, byProduct: Map<pid, entri>, events: [...] }
// entri: { pid, present, addedOn, addedModifyTime, removedOn, removedModifyTime, sinceFirstSnapshot }
export function buildProductMembership(rows = []) {
  const urut = [...rows]
    .filter(r => r?.snapshot_date)
    .sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)))
  if (!urut.length) return { first: null, last: null, snapshots: 0, gaps: 0, byProduct: new Map(), events: [] }

  const byProduct = new Map()
  const events = []
  const upsert = (pid) => {
    if (!byProduct.has(pid)) {
      byProduct.set(pid, {
        pid, present: false, addedOn: null, addedModifyTime: null,
        removedOn: null, removedModifyTime: null, sinceFirstSnapshot: false,
      })
    }
    return byProduct.get(pid)
  }

  let prev = null
  for (const r of urut) {
    const tgl = String(r.snapshot_date)
    const kini = new Set(ids(r))
    if (prev === null) {
      for (const pid of kini) {
        const e = upsert(pid)
        e.present = true
        e.sinceFirstSnapshot = true   // sudah ada sebelum kita mulai memotret
      }
    } else {
      for (const pid of kini) if (!prev.has(pid)) {
        const e = upsert(pid)
        // Masuk lagi setelah pernah dicabut: riwayat lama tak dihapus diam-diam,
        // ia tercatat di events; entri ringkasnya memakai kejadian TERBARU.
        e.present = true; e.addedOn = tgl; e.addedModifyTime = r.modify_time || null
        e.removedOn = null; e.removedModifyTime = null; e.sinceFirstSnapshot = false
        events.push({ pid, kind: 'ADDED', date: tgl, modifyTime: r.modify_time || null })
      }
      for (const pid of prev) if (!kini.has(pid)) {
        const e = upsert(pid)
        e.present = false; e.removedOn = tgl; e.removedModifyTime = r.modify_time || null
        events.push({ pid, kind: 'REMOVED', date: tgl, modifyTime: r.modify_time || null })
      }
    }
    prev = kini
  }

  const first = String(urut[0].snapshot_date)
  const last = String(urut[urut.length - 1].snapshot_date)
  const rentang = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY) + 1
  const tanggalUnik = new Set(urut.map(r => String(r.snapshot_date))).size

  return {
    first, last, snapshots: tanggalUnik,
    gaps: Math.max(0, rentang - tanggalUnik),
    byProduct,
    events: events.reverse(),          // terbaru dulu
  }
}

// Ambil riwayat SATU campaign dari kumpulan baris semua campaign.
export function membershipForCampaign(rows = [], campaignId) {
  const cid = String(campaignId || '')
  if (!cid) return buildProductMembership([])
  return buildProductMembership(rows.filter(r => String(r.campaign_id) === cid))
}
