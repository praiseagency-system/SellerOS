// Shadow store — ISOLATED, disk-based. NEW output + parity disimpan TERPISAH dari
// tabel produksi (nol tulis DB → mustahil menimpa source of truth). Cocok VPS
// (persist di filesystem). Base dir override via env GMVMAX_SHADOW_DIR (default logs/shadow).
// Layout:
//   <base>/runs/<date>__<advertiser>__<run_id>.json  (record penuh: report+parity+rowCount NEW)
//   <base>/index.jsonl                                (append-only, untuk query riwayat)
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'

// Dibaca saat pemanggilan (bukan import) → test bisa set env per-kasus.
function baseDir() { return process.env.GMVMAX_SHADOW_DIR || 'logs/shadow' }

export function persistRun(record) {
  // STAGE 2C: kegagalan tulis bukti (dir unwritable / ENOSPC / index gagal) → error
  // BER-KODE, TIDAK dibungkam. Pemanggil WAJIB mengklasifikasi FAILED (bukan SUCCESS).
  try {
    const RUNS_DIR = `${baseDir()}/runs`
    mkdirSync(RUNS_DIR, { recursive: true })
    const file = `${RUNS_DIR}/${record.snapshot_date}__${record.advertiser_id}__${record.run_id}.json`
    writeFileSync(file, JSON.stringify(record, null, 2))
    appendFileSync(`${baseDir()}/index.jsonl`, JSON.stringify({
      run_id: record.run_id, advertiser_id: record.advertiser_id, snapshot_date: record.snapshot_date,
      status: record.status, parity_status: record.parity?.status ?? null,
      started_at: record.started_at, finished_at: record.finished_at,
    }) + '\n')
    return file
  } catch (e) {
    const err = new Error(`SHADOW_PERSIST_FAILED: gagal menyimpan bukti shadow (${e.code || e.message}). Run TIDAK dianggap sukses.`)
    err.code = 'SHADOW_PERSIST_FAILED'; err.cause = e.code || null
    throw err
  }
}

export function persistBatchSummary(summary) {
  try {
    mkdirSync(baseDir(), { recursive: true })
    writeFileSync(`${baseDir()}/_last_batch.json`, JSON.stringify(summary, null, 2))
  } catch (e) {
    const err = new Error(`SHADOW_PERSIST_FAILED: gagal menyimpan ringkasan batch (${e.code || e.message}).`)
    err.code = 'SHADOW_PERSIST_FAILED'; throw err
  }
}
