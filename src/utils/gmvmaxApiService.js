// Service GMV Max API → dataset siap-impor. Menjembatani poller (gmvmaxApiPoller)
// dengan seam importDataset(parsed) di GmvMaxContext. Menghasilkan { meta, rows }
// yang bentuknya identik parser xlsx, LENGKAP dengan meta-harian (name, periodMonth,
// snapshotDate) supaya slot ke model SNAPSHOT HARIAN & idempoten per tanggal
// (re-tarik tanggal sama → mengganti snapshot, sama seperti re-upload xlsx).
//
// Transport `call(toolName, params)` di-inject caller (lihat gmvmaxApiPoller):
//   • MCP interaktif  : bungkus tool_execute.
//   • Produksi (app)  : route serverless Vercel yang memegang Access-Token TikTok
//                       lalu proxy ke Marketing API (butuh approval developer app).
import { pollGmvMax } from './gmvmaxApiPoller'
import { fmtSnapshotLabel } from './parseGmvMax'

// Tarik SATU hari (model harian). date = 'YYYY-MM-DD'.
// → { meta, rows, campaigns } siap dilempar ke importDataset().
export async function fetchGmvMaxDay(call, { advertiserId, date, storeId, activeOnly = true, currency = 'IDR', onProgress }) {
  if (!advertiserId) throw new Error('advertiserId wajib diisi.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Tanggal harus format YYYY-MM-DD.')

  const { rows, meta, campaigns } = await pollGmvMax(call, {
    advertiserId, storeId, activeOnly, currency,
    dateRange: { startDate: date, endDate: date },
    onProgress,
  })

  return {
    meta: {
      ...meta,
      name: fmtSnapshotLabel(date),        // label harian ("8 Jul 2026")
      periodMonth: `${date.slice(0, 7)}-01`, // pengelompokan bulan
      snapshotDate: date, startDate: date, endDate: date,
      filename: null,
    },
    rows,
    campaigns,
  }
}

// Tarik RENTANG tanggal sebagai banyak snapshot harian sekaligus (loop per hari).
// Mengembalikan array hasil fetchGmvMaxDay; caller memanggil importDataset per item.
// onDay(dateStr, i, total) opsional untuk progress UI.
export async function fetchGmvMaxRange(call, { advertiserId, startDate, endDate, storeId, activeOnly = true, currency = 'IDR', onDay }) {
  const days = eachDay(startDate, endDate)
  const out = []
  for (let i = 0; i < days.length; i++) {
    onDay?.(days[i], i, days.length)
    out.push(await fetchGmvMaxDay(call, { advertiserId, date: days[i], storeId, activeOnly, currency }))
  }
  return out
}

// 'YYYY-MM-DD'..'YYYY-MM-DD' inklusif → ['YYYY-MM-DD', ...] (UTC, aman DST).
function eachDay(start, end) {
  const out = []
  let d = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  if (isNaN(d) || isNaN(last)) throw new Error('Rentang tanggal tidak valid.')
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() + 86400000)
  }
  return out
}
