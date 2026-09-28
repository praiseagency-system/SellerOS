// Sambungan Pikat → SellerOS (28 Sep 2026): kode spark yang dikumpulkan Pikat
// dari kreator masuk ke kotak "Kode dari Pikat" di halaman Boost.
//
// Pola izin sama dengan api/_lib/team.js & tiktokToken.js, dan urutannya sama
// pentingnya: PERAN pemanggil diperiksa dulu dengan JWT-nya sendiri (RLS yang
// memutuskan), baru service_role dipakai. Token Pikat (`psl_…`) tak pernah
// terbaca browser — kolomnya tidak di-grant (migrasi 0064).
//
//   connect / disconnect  → owner saja (sama seperti koneksi TikTok)
//   pull                  → owner & editor (viewer hanya membaca kotaknya)
import { selectAsUser } from './guard.js'
import { service, TeamError } from './team.js'

export const PIKAT_ERR = TeamError
const isUuid = (v) => /^[0-9a-f-]{36}$/i.test(v || '')

// Base URL Pikat. Bisa ditimpa env tanpa mengubah kode (staging / domain baru).
export const pikatBaseUrl = () =>
  String(process.env.PIKAT_API_URL || 'https://app.praiseagency.id').trim().replace(/\/+$/, '')

export const TARIK_HARI = 30
export const TARIK_BATAS = 300

export async function roleOf(userJwt, userId, workspaceId) {
  if (!isUuid(workspaceId)) throw new TeamError(400, 'invalid_request', 'workspace_id bukan UUID.')
  let rows
  try {
    rows = await selectAsUser(
      userJwt,
      `workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
      `&user_id=eq.${encodeURIComponent(userId)}&select=role&limit=1`
    )
  } catch (e) {
    throw new TeamError(502, 'membership_lookup_failed', String(e?.message || e))
  }
  return Array.isArray(rows) && rows[0] ? rows[0].role : null
}

export async function assertRole(userJwt, userId, workspaceId, allowed) {
  const role = await roleOf(userJwt, userId, workspaceId)
  // "Bukan anggota" dan "peran kurang" sengaja berjawaban sama.
  if (!allowed.includes(role)) {
    throw new TeamError(403, 'forbidden_workspace', `Butuh peran ${allowed.join('/')} di workspace ini.`)
  }
  return role
}

// Panggil feed Pikat. Galat dari Pikat diteruskan dengan pesan yang bisa
// ditindaklanjuti (token dicabut ≠ Pikat sedang mati).
export async function fetchPikatCodes(token, { days = TARIK_HARI, limit = TARIK_BATAS } = {}, fetchImpl = fetch) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 15_000)
  let r
  try {
    r = await fetchImpl(`${pikatBaseUrl()}/api/v1/selleros/spark-codes?days=${days}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: ctl.signal,
    })
  } catch (e) {
    throw new TeamError(502, 'pikat_unreachable', `Pikat tak terjangkau: ${e?.name === 'AbortError' ? 'waktu habis' : String(e?.message || e)}`)
  } finally {
    clearTimeout(timer)
  }
  const text = await r.text()
  let j
  try { j = text.trim() ? JSON.parse(text) : null } catch { j = null }
  if (r.status === 401) {
    throw new TeamError(401, 'pikat_token_rejected', 'Token Pikat ditolak (dicabut atau salah tempel). Buat token baru di Pikat → License Key → Sambungan SellerOS.')
  }
  if (!r.ok || !j || !Array.isArray(j.items)) {
    throw new TeamError(502, 'pikat_error', j?.error || `Pikat membalas ${r.status}.`)
  }
  return j
}

// Rencana tulis kotak masuk. Dipisah murni supaya bisa diuji tanpa database.
//   baru/berubah → baris penuh, status kembali NEW (kreator mengirim kode baru —
//                  keputusan lama atas kode lama tak berlaku lagi)
//   sama         → hanya metadata (views, label) yang disegarkan; status &
//                  keputusan tim Ads tak disentuh
export function planInbox(workspaceId, items, existing, nowIso) {
  const lama = new Map(existing.map(e => [String(e.video_id), e]))
  const full = []
  const meta = []
  let baru = 0, berubah = 0
  for (const it of items) {
    const videoId = String(it.videoId || '')
    const code = String(it.sparkCode || '').trim()
    if (!/^\d{8,25}$/.test(videoId) || !code) continue
    const m = {
      workspace_id: workspaceId,
      video_id: videoId,
      tiktok_username: it.tiktokUsername || null,
      source: it.source || null,
      label: it.label || null,
      views: Number.isFinite(Number(it.views)) ? Number(it.views) : null,
      uploaded_at: it.uploadedAt || null,
      recorded_at: it.recordedAt || null,
      updated_at: nowIso,
    }
    const e = lama.get(videoId)
    if (!e || e.spark_code !== code) {
      if (e) berubah++; else baru++
      full.push({
        ...m, spark_code: code, status: 'NEW', preview: null,
        approval_id: null, decided_by: null, decided_at: null,
      })
    } else {
      meta.push(m)
    }
  }
  return { full, meta, baru, berubah }
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

async function upsert(rows) {
  if (!rows.length) return
  await service('pikat_spark_inbox?on_conflict=workspace_id,video_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
}

export async function readLinkToken(workspaceId) {
  const rows = await service(
    `pikat_links?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=token&limit=1`
  )
  return Array.isArray(rows) && rows[0] ? rows[0].token : null
}

export async function pullIntoInbox(workspaceId, fetchImpl = fetch) {
  const token = await readLinkToken(workspaceId)
  if (!token) throw new TeamError(404, 'not_connected', 'Pikat belum tersambung untuk workspace ini (Pengaturan → Integrasi).')

  const nowIso = new Date().toISOString()
  let feed
  try {
    feed = await fetchPikatCodes(token, {}, fetchImpl)
  } catch (e) {
    // Catat galatnya supaya kartu sambungan bisa menjelaskan kenapa kotak kosong.
    await service(`pikat_links?workspace_id=eq.${encodeURIComponent(workspaceId)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_error: String(e?.description || e?.message || e).slice(0, 300), updated_at: nowIso }),
    }).catch(() => {})
    throw e
  }

  const ids = [...new Set(feed.items.map(it => String(it.videoId || '')).filter(v => /^\d{8,25}$/.test(v)))]
  const existing = []
  for (const part of chunk(ids, 100)) {
    const rows = await service(
      `pikat_spark_inbox?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
      `&video_id=in.(${part.join(',')})&select=video_id,spark_code,status`
    )
    if (Array.isArray(rows)) existing.push(...rows)
  }

  const plan = planInbox(workspaceId, feed.items, existing, nowIso)
  for (const part of chunk(plan.full, 200)) await upsert(part)
  for (const part of chunk(plan.meta, 200)) await upsert(part)

  await service(`pikat_links?workspace_id=eq.${encodeURIComponent(workspaceId)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      last_pulled_at: nowIso, last_error: null, updated_at: nowIso,
      pikat_workspace_id: feed.workspace?.id ?? null,
      pikat_workspace_name: feed.workspace?.name ?? null,
    }),
  })
  return { ditarik: feed.items.length, baru: plan.baru, berubah: plan.berubah, pikat: feed.workspace || null }
}

export async function connectLink(workspaceId, userId, token, fetchImpl = fetch) {
  const t = String(token || '').trim()
  if (!/^psl_[A-Za-z0-9_-]{20,}$/.test(t)) {
    throw new TeamError(400, 'invalid_token', 'Token Pikat harus berawalan psl_ — salin dari Pikat → License Key → Sambungan SellerOS.')
  }
  // Uji dulu: token yang ditolak Pikat tak boleh tersimpan sebagai "tersambung".
  const feed = await fetchPikatCodes(t, { days: 1, limit: 1 }, fetchImpl)
  const nowIso = new Date().toISOString()
  await service('pikat_links?on_conflict=workspace_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      workspace_id: workspaceId, token: t, token_hint: t.slice(-4),
      pikat_workspace_id: feed.workspace?.id ?? null,
      pikat_workspace_name: feed.workspace?.name ?? null,
      connected_by: userId, connected_at: nowIso, last_error: null, updated_at: nowIso,
    }),
  })
  return { pikat: feed.workspace || null }
}

export async function disconnectLink(workspaceId) {
  await service(`pikat_links?workspace_id=eq.${encodeURIComponent(workspaceId)}`, {
    method: 'DELETE', headers: { Prefer: 'return=minimal' },
  })
}
