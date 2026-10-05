// PENAMBAL HARI BOLONG — dijalankan di AKHIR run harian worker commit.
//
// KENAPA ADA: sebelum ini satu run yang gagal = satu tanggal hilang selamanya,
// kecuali ada yang kebetulan melihat lalu menjalankan backfill manual
// (Asterixsty 27 Sep & 3 Okt 2026 bolong berhari-hari tanpa ada yang tahu).
// Sekarang tiap run memeriksa N hari terakhir per workspace: tanggal tanpa
// import `is_current` di gmvmax_imports ditarik ulang.
//
// DI AKHIR, bukan di awal: snapshot kemarin (beserta potret setelannya, yang
// hanya sah bila diambil pagi ini) tak boleh tertunda atau ikut jatuh gara-gara
// penambal. Token juga sudah segar dari run utama.
//
// Yang ditulis untuk tanggal lampau HANYA data performa — penjaganya ada di
// currentStateCapture.mjs dan diturunkan dari tanggal, jadi modul ini tak perlu
// (dan tak bisa) mematikannya. Pure: sb, jam, sleep & pemroses di-inject.
import { dateMinusDays } from './runtime/jakartaDate.mjs'
import { safeLog } from './runtime/redact.mjs'

export const DEFAULT_GAP_FILL_DAYS = 7
export const MAX_GAP_FILL_DAYS = 31
// Batas waktu sejak proses mulai. Unit systemd memberi TimeoutStartSec=1800
// (30 mnt) untuk SELURUH run; satu tanggal ±1,5 mnt. Penambal berhenti MEMULAI
// tarikan baru setelah 15 mnt supaya tak pernah dibunuh systemd di tengah jalan.
// Sisanya dikerjakan run besok (jendelanya 7 hari).
export const DEFAULT_GAP_FILL_BUDGET_MS = 15 * 60 * 1000

const realSleep = (ms) => new Promise(r => setTimeout(r, ms))

// GMVMAX_GAP_FILL_DAYS: kosong/tak sah → 7; 0 → penambal mati; dibatasi 31.
export function gapFillDaysFromEnv(raw) {
  if (raw == null || String(raw).trim() === '') return DEFAULT_GAP_FILL_DAYS
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) return DEFAULT_GAP_FILL_DAYS
  return Math.min(n, MAX_GAP_FILL_DAYS)
}

// `days` tanggal berurutan yang BERAKHIR di latestDate (inklusif), menaik.
export function windowDates(latestDate, days) {
  const out = []
  for (let i = days - 1; i >= 0; i--) out.push(dateMinusDays(latestDate, i))
  return out
}

// Tanggal di jendela yang belum punya import is_current.
// Tanggal SEBELUM import pertama workspace bukan "bolong" — itu masa sebelum
// workspace punya data (tenant baru tersambung) dan sengaja tidak diisi mundur.
// → { dates, missing, firstHistoryDate }
export async function findMissingDates(sb, { workspaceId, latestDate, days }) {
  const dates = windowDates(latestDate, days)
  if (!dates.length) return { dates, missing: [], firstHistoryDate: null }
  const { data, error } = await sb.from('gmvmax_imports').select('snapshot_date')
    .eq('workspace_id', workspaceId).eq('is_current', true)
    .gte('snapshot_date', dates[0]).lte('snapshot_date', dates[dates.length - 1])
  if (error) throw new Error(`baca gmvmax_imports gagal: ${error.message}`)
  const present = new Set((data || []).map(r => String(r.snapshot_date).slice(0, 10)))
  const absent = dates.filter(d => !present.has(d))
  if (!absent.length) return { dates, missing: [], firstHistoryDate: null }

  const { data: first, error: e2 } = await sb.from('gmvmax_imports').select('snapshot_date')
    .eq('workspace_id', workspaceId).eq('is_current', true)
    .order('snapshot_date', { ascending: true }).limit(1).maybeSingle()
  if (e2) throw new Error(`baca import pertama gagal: ${e2.message}`)
  const firstHistoryDate = first?.snapshot_date ? String(first.snapshot_date).slice(0, 10) : null
  const missing = firstHistoryDate ? absent.filter(d => d > firstHistoryDate) : []
  return { dates, missing, firstHistoryDate }
}

// Urutan kerja: KEMARIN dulu bila ia bolong (hanya tanggal itu yang masih boleh
// dipotret setelannya, makin cepat makin dekat ke keadaan akhir-hari), lalu
// sisanya dari yang TERTUA — yang paling dekat keluar dari jendela.
export function fillOrder(missing, latestDate) {
  const older = missing.filter(d => d !== latestDate).sort()
  return missing.includes(latestDate) ? [latestDate, ...older] : older
}

// Run utama workspace ini berakhir dengan jawaban auth DEFINITIF (refresh token
// ditolak / token blocking)? Maka JANGAN sentuh lagi di run ini: tiap tarikan
// akan mengirim ulang refresh token yang sudah ditolak server. Galat token yang
// transien (jaringan, sudah habis jatah retry) boleh dicoba sekali lagi.
export function authUnusable(mainResult) {
  if (!mainResult || mainResult.ok) return false
  if (mainResult.status === 'AUTH_BLOCKING') return true
  return mainResult.status === 'TOKEN_FAILED' && mainResult.transient !== true
}

// Pindai + tambal semua workspace. TIDAK pernah throw.
//   workspaces   : [{ workspaceId }] — yang ditarget run utama
//   mainResults  : Map(workspaceId → hasil processWorkspace run utama)
//   entriesFor   : async (workspaceId, date) → entries[] | null (advertiser aktif pada tanggal itu)
//   processDate  : async ({ workspaceId, entries, date }) → { ok, status, error, ... }
// → { scanned, filled, failed, deferred, skipped, scanFailed, planned, recovered:Set }
// Pemutus arus: begitu satu tanggal GAGAL untuk sebuah workspace, sisa tanggal
// workspace itu ditunda ke run besok — penyebabnya hampir pasti sama (akses
// dicabut, API down) dan mengulang 7× hanya membakar kuota.
export async function runGapFill({
  sb, workspaces, mainResults = new Map(), latestDate, days, dryRun = false,
  entriesFor, processDate, startedAt, budgetMs = DEFAULT_GAP_FILL_BUDGET_MS,
  clock = Date.now, pauseMs = 0, sleepImpl = realSleep, log = safeLog,
}) {
  const out = { scanned: 0, filled: [], failed: [], deferred: [], skipped: [], scanFailed: [], planned: [], recovered: new Set() }
  for (const { workspaceId } of workspaces) {
    const main = mainResults.get(workspaceId)
    if (main && !main.ok && (authUnusable(main) || main.status === 'LOCKED')) {
      const reason = main.status === 'LOCKED' ? 'LOCKED' : 'AUTH_NOT_USABLE'
      out.skipped.push({ workspaceId, reason })
      log({ event: 'GAP_FILL_SKIPPED', workspace_id: workspaceId, reason, main_status: main.status }, console.error)
      continue
    }

    let scan
    try {
      scan = await findMissingDates(sb, { workspaceId, latestDate, days })
    } catch (e) {
      out.scanFailed.push({ workspaceId, error: e.message })
      log({ event: 'GAP_SCAN_FAILED', level: 'warn', workspace_id: workspaceId, message: e.message }, console.error)
      continue
    }
    out.scanned++
    // Dry-run: run utama tak menulis, jadi "kemarin" pasti tampak bolong — itu
    // bukan lubang, run sungguhan yang akan mengisinya.
    const todo = fillOrder(dryRun ? scan.missing.filter(d => d !== latestDate) : scan.missing, latestDate)
    log({
      event: 'GAP_SCAN', workspace_id: workspaceId, days, window_from: scan.dates[0] ?? null, window_to: latestDate,
      first_history_date: scan.firstHistoryDate, missing: todo, dry_run: dryRun,
    })
    if (dryRun) { for (const date of todo) out.planned.push({ workspaceId, date }); continue }

    for (let i = 0; i < todo.length; i++) {
      const date = todo[i]
      if (clock() - startedAt >= budgetMs) {
        const rest = todo.slice(i)
        for (const d of rest) out.deferred.push({ workspaceId, date: d, reason: 'TIME_BUDGET' })
        log({ event: 'GAP_FILL_DEFERRED', level: 'warn', workspace_id: workspaceId, reason: 'TIME_BUDGET', dates: rest, message: 'Batas waktu penambal habis — dilanjutkan run berikutnya.' }, console.error)
        break
      }
      let r
      try {
        const entries = await entriesFor(workspaceId, date)
        if (!entries?.length) {
          out.skipped.push({ workspaceId, date, reason: 'NO_ACTIVE_ADVERTISER' })
          log({ event: 'GAP_FILL_SKIPPED', workspace_id: workspaceId, snapshot_date: date, reason: 'NO_ACTIVE_ADVERTISER' })
          continue
        }
        if (pauseMs > 0) await sleepImpl(pauseMs)
        log({ event: 'GAP_FILL_START', workspace_id: workspaceId, snapshot_date: date, advertiser_ids: entries.map(e => e.advertiserId) })
        r = await processDate({ workspaceId, entries, date })
      } catch (e) {
        r = { ok: false, status: 'FAILED', error: e.message }
      }
      log({ event: 'GAP_FILL_RESULT', workspace_id: workspaceId, snapshot_date: date, ok: r.ok === true, status: r.status ?? null, written: r.written === true, row_count: r.rowCount ?? null, error: r.error ?? null },
        r.ok ? console.log : console.error)
      if (r.ok) {
        out.filled.push({ workspaceId, date })
        if (date === latestDate && main && !main.ok) out.recovered.add(workspaceId)
        continue
      }
      out.failed.push({ workspaceId, date, error: r.error ?? r.status ?? 'FAILED' })
      const rest = todo.slice(i + 1)
      if (rest.length) {
        for (const d of rest) out.deferred.push({ workspaceId, date: d, reason: 'CIRCUIT_OPEN' })
        log({ event: 'GAP_FILL_DEFERRED', level: 'warn', workspace_id: workspaceId, reason: 'CIRCUIT_OPEN', dates: rest, message: 'Satu tanggal gagal — sisa tanggal workspace ini ditunda ke run berikutnya.' }, console.error)
      }
      break
    }
  }
  return out
}
