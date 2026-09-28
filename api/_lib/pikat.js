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
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

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
      views: num(it.views),
      likes: num(it.likes),
      comments: num(it.comments),
      shares: num(it.shares),
      gmv_organic: num(it.gmvOrganik),
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

// Kolom metrik 0065 — bila migrasinya belum dijalankan, tulis tanpa kolom ini.
export const METRIC_COLS = ['likes', 'comments', 'shares', 'gmv_organic']

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

const strip = (rows) => rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !METRIC_COLS.includes(k))))
export const isMissingColumn = (e) => /PGRST204|Could not find the '(likes|comments|shares|gmv_organic)' column/i.test(String(e?.description || e?.message || ''))

async function upsert(rows) {
  if (!rows.length) return
  const send = (body) => service('pikat_spark_inbox?on_conflict=workspace_id,video_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body),
  })
  try { await send(rows) } catch (e) {
    if (!isMissingColumn(e)) throw e
    await send(strip(rows))
  }
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
  // Status ikut dikirim tiap tarikan (menangkap ikatan & kedaluwarsa dari potret
  // harian). Gagal lapor tak menggagalkan tarikan.
  let dilaporkan
  try { dilaporkan = (await reportToPikat(workspaceId, fetchImpl)).reported } catch { dilaporkan = null }
  return { ditarik: feed.items.length, baru: plan.baru, berubah: plan.berubah, dilaporkan, pikat: feed.workspace || null }
}

// ── Status balik ke Pikat ────────────────────────────────────────────────────
// Vonis kotak masuk + potret otorisasi spark terbaru → status yang dipahami Pikat.
// Dihitung dari database (bukan kiriman browser) supaya tak bisa dipalsukan.
export function statusForPikat(row, auth, nowMs = Date.now()) {
  const base = { videoId: String(row.video_id), sparkCode: row.spark_code }
  const bound = row.status === 'BOUND' || row.status === 'ALREADY' || auth?.ad_auth_status === 'AUTHORIZED'
  if (auth?.ad_auth_status === 'EXPIRED') return { ...base, status: 'EXPIRED', authEndTime: auth.auth_end_time || null }
  if (bound) {
    const end = auth?.auth_end_time || null
    const lewat = end && Date.parse(String(end).replace(' ', 'T')) <= nowMs
    return { ...base, status: lewat ? 'EXPIRED' : 'BOUND', authEndTime: end }
  }
  switch (row.status) {
    case 'INVALID': return { ...base, status: 'INVALID', detail: row.preview?.error || '' }
    case 'MISMATCH': return { ...base, status: 'MISMATCH', detail: row.preview?.item_id ? `kode untuk video ${row.preview.item_id}` : '' }
    case 'FAILED': return { ...base, status: 'FAILED', detail: row.preview?.error || '' }
    case 'DISMISSED': return { ...base, status: 'DISMISSED' }
    default: return { ...base, status: 'PENDING' }
  }
}

export async function reportToPikat(workspaceId, fetchImpl = fetch) {
  const token = await readLinkToken(workspaceId)
  if (!token) throw new TeamError(404, 'not_connected', 'Pikat belum tersambung untuk workspace ini.')
  const rows = await service(
    `pikat_spark_inbox?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
    '&select=video_id,spark_code,status,preview&order=updated_at.desc&limit=1000'
  ) || []
  if (!rows.length) return { reported: 0 }
  const last = await service(
    `gmvmax_spark_auth?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=snapshot_date&order=snapshot_date.desc&limit=1`
  )
  const authOf = new Map()
  if (last?.[0]?.snapshot_date) {
    const ids = rows.map(r => r.video_id)
    for (const part of chunk(ids, 100)) {
      const a = await service(
        `gmvmax_spark_auth?workspace_id=eq.${encodeURIComponent(workspaceId)}&snapshot_date=eq.${last[0].snapshot_date}` +
        `&item_id=in.(${part.join(',')})&select=item_id,ad_auth_status,auth_end_time`
      )
      for (const x of a || []) authOf.set(String(x.item_id), x)
    }
  }
  const items = rows.map(r => statusForPikat(r, authOf.get(String(r.video_id))))
  const r = await fetchImpl(`${pikatBaseUrl()}/api/v1/selleros/spark-status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (r.status === 401) throw new TeamError(401, 'pikat_token_rejected', 'Token Pikat ditolak — buat token baru di Pikat.')
  if (!r.ok) throw new TeamError(502, 'pikat_error', `Pikat membalas ${r.status} saat menerima status.`)
  return { reported: items.length }
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
