// Lock file-based per (advertiser, date) — cegah run konkuren duplikat.
// Lifecycle: acquire (buat file dgn pid+waktu) → run → release (hapus). Stale:
// lock lebih tua dari STALE_MS ATAU pid pemilik sudah mati → boleh diambil alih.
// Cocok VPS single-host (cron/systemd). Multi-host butuh lock DB (belum).
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'

const STALE_MS = 30 * 60 * 1000 // 30 menit
// Base dir mengikuti shadowStore (env GMVMAX_SHADOW_DIR) → layout VPS konsisten & test terisolasi.
function lockDir() { return `${process.env.GMVMAX_SHADOW_DIR || 'logs/shadow'}/locks` }
function lockPath(advertiserId, date) { return `${lockDir()}/${advertiserId}__${date}.lock` }
function pidAlive(pid) { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }

// → { ok:true, path } | { ok:false, reason:'LOCKED', holder }
export function acquireLock(advertiserId, date) {
  mkdirSync(lockDir(), { recursive: true })
  const path = lockPath(advertiserId, date)
  if (existsSync(path)) {
    let holder = null
    try { holder = JSON.parse(readFileSync(path, 'utf8')) } catch { /* korup → anggap stale */ }
    const age = holder ? Date.now() - holder.startedAt : Infinity
    const stale = !holder || age > STALE_MS || !pidAlive(holder.pid)
    if (!stale) return { ok: false, reason: 'LOCKED', holder }
    // stale → reklamasi (timpa di bawah)
  }
  writeFileSync(path, JSON.stringify({ pid: process.pid, startedAt: Date.now(), advertiserId, date, host: process.env.HOSTNAME || 'local' }))
  return { ok: true, path }
}

export function releaseLock(path) { try { if (path) rmSync(path) } catch { /* idempoten */ } }
export const LOCK_STALE_MS = STALE_MS
