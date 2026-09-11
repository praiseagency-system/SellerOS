// AI Assistant SellerOS — satu pintu chat (Vercel serverless).
// Diport dari src/app/api/assistant/route.ts Pikat: loop tool_use maks 6
// putaran, rate limit per user, simpan thread. Bedanya: data dibaca lewat
// PostgREST atas nama pemanggil (RLS), bukan Prisma.
//
// Kontrak body: { workspace_id, messages:[{role,content}], threadId?, context?:{page,period} }
// Balasan: { reply, threadId, title, saved }
//
// Model dialihkan ke gateway (9router) lewat env: ANTHROPIC_BASE_URL +
// ANTHROPIC_AUTH_TOKEN (Bearer) dan nama model gateway di ASSISTANT_MODEL.
import Anthropic from '@anthropic-ai/sdk'
import { guard, parseBody } from '../_lib/guard.js'
import { restGet, restWrite } from '../_lib/assistant/rest.js'
import { ASSISTANT_TOOLS, TOOL_EXECUTORS } from '../_lib/assistant/tools.js'
import { systemPrompt } from '../_lib/assistant/prompt.js'
import { MAX_THREADS, threadTitleFromMessage, sanitizeMessages } from '../../src/utils/assistantThread.js'

const MODEL = (process.env.ASSISTANT_MODEL || '').trim() || 'claude-haiku-4-5'
const MAX_TOOL_ROUNDS = 8
const MAX_PERSIST = 60     // pesan per thread yang disimpan
const HISTORY_TURNS = 12   // giliran terakhir yang dikirim ke model
const MAX_CHARS = 2000
const UUID = /^[0-9a-f-]{36}$/i

/**
 * Simpan percakapan ke thread milik user (RLS: harus anggota penulis).
 * threadId null → buat thread baru + pangkas yang terlama di luar MAX_THREADS.
 * Gagal menulis (mis. viewer) TIDAK menggagalkan jawaban: saved=false.
 */
async function persistConversation(auth, workspaceId, threadId, msgs) {
  const messages = msgs.slice(-MAX_PERSIST)
  const now = new Date().toISOString()
  try {
    if (threadId) {
      const rows = await restWrite(auth.token,
        `ai_conversations?id=eq.${threadId}&workspace_id=eq.${workspaceId}&user_id=eq.${auth.userId}&select=id,title`,
        'PATCH', { messages, updated_at: now })
      if (Array.isArray(rows) && rows.length === 1) return { threadId: rows[0].id, title: rows[0].title, saved: true }
      // Thread sudah dihapus dari tab lain → jatuh ke pembuatan thread baru.
    }
    const firstUser = messages.find(m => m.role === 'user')
    const title = threadTitleFromMessage(firstUser?.content ?? '')
    const created = await restWrite(auth.token, 'ai_conversations?select=id,title', 'POST',
      { workspace_id: workspaceId, user_id: auth.userId, title, messages })
    const row = Array.isArray(created) ? created[0] : null
    if (!row) return { threadId: null, title: '', saved: false }
    await pruneThreads(auth, workspaceId)
    return { threadId: row.id, title: row.title, saved: true }
  } catch (e) {
    console.error('[assistant] persist failed', e?.message || e)
    return { threadId: null, title: '', saved: false }
  }
}

async function pruneThreads(auth, workspaceId) {
  const stale = await restGet(auth.token,
    `ai_conversations?workspace_id=eq.${workspaceId}&user_id=eq.${auth.userId}&select=id&order=updated_at.desc&offset=${MAX_THREADS}&limit=50`)
  if (!Array.isArray(stale) || stale.length === 0) return
  const ids = stale.map(r => r.id).join(',')
  await restWrite(auth.token, `ai_conversations?id=in.(${ids})&user_id=eq.${auth.userId}`, 'DELETE', undefined, 'return=minimal')
}

export default async function handler(req, res) {
  // Tiap pesan bisa memicu beberapa panggilan model (loop tool) → 15/menit/user.
  const auth = await guard(req, res, { limit: 15, windowMs: 60_000 })
  if (!auth) return

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    res.status(503).json({ error: 'assistant_unconfigured', error_description: 'AI Assistant belum dikonfigurasi (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN belum di-set).' })
    return
  }

  const body = parseBody(req)
  const workspaceId = String(body.workspace_id || '')
  if (!UUID.test(workspaceId)) {
    res.status(400).json({ error: 'invalid_request', error_description: 'workspace_id tidak valid.' }); return
  }
  const threadId = typeof body.threadId === 'string' && UUID.test(body.threadId) ? body.threadId : null

  const fullHistory = sanitizeMessages(body.messages)
  const history = fullHistory.slice(-HISTORY_TURNS)
  const last = history[history.length - 1]
  if (!last || last.role !== 'user') {
    res.status(400).json({ error: 'invalid_request', error_description: 'Pesan terakhir harus dari user.' }); return
  }
  if (last.content.length > MAX_CHARS) {
    res.status(400).json({ error: 'invalid_request', error_description: `Pesan terlalu panjang (maks ${MAX_CHARS} karakter).` }); return
  }

  // Keanggotaan dibuktikan lewat RLS: workspace yang bukan milik/anggota
  // pemanggil tidak akan terbaca sama sekali. Nama ikut dipakai di prompt.
  let ws
  try {
    const rows = await restGet(auth.token, `workspaces?id=eq.${workspaceId}&select=id,name&limit=1`)
    ws = Array.isArray(rows) ? rows[0] : null
  } catch (e) {
    res.status(502).json({ error: 'workspace_lookup_failed', error_description: String(e?.message || e) }); return
  }
  if (!ws) {
    res.status(403).json({ error: 'forbidden', error_description: 'Workspace tak ditemukan untuk akun ini.' }); return
  }

  const ctx = { token: auth.token, workspaceId }
  const promptCtx = {
    workspaceName: ws.name,
    page: typeof body.context?.page === 'string' ? body.context.page.slice(0, 60) : null,
    period: typeof body.context?.period === 'string' ? body.context.period.slice(0, 20) : null,
  }

  const respond = async (reply) => {
    const saved = await persistConversation(auth, workspaceId, threadId, [...fullHistory, { role: 'assistant', content: reply }])
    res.status(200).json({ reply, ...saved })
  }

  const client = new Anthropic()
  const messages = history.map(m => ({ role: m.role, content: m.content }))

  const t0 = Date.now()
  const trace = [] // ringkasan tiap putaran → log Vercel: tool apa, berapa byte, error apa
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Streaming lalu dirakit jadi satu Message: wajib untuk gateway 9router
      // yang membalas bentuk OpenAI (content kosong) pada /v1/messages non-stream.
      const response = await client.messages
        .stream({ model: MODEL, max_tokens: 2048, system: systemPrompt(new Date(), promptCtx), tools: ASSISTANT_TOOLS, messages })
        .finalMessage()

      if (response.stop_reason === 'refusal') return respond('Maaf, aku tidak bisa membantu permintaan ini.')

      const toolUses = response.content.filter(b => b.type === 'tool_use')
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
        console.log('[assistant] done', JSON.stringify({ ws: workspaceId, rounds: round, ms: Date.now() - t0, stop: response.stop_reason, trace }))
        return respond(text || '(tidak ada jawaban)')
      }

      messages.push({ role: 'assistant', content: response.content })
      const toolResults = []
      for (const tu of toolUses) {
        const executor = TOOL_EXECUTORS[tu.name]
        let resultText; let isError = false
        try {
          if (!executor) { resultText = JSON.stringify({ error: `Tool ${tu.name} tidak dikenal.` }); isError = true }
          else resultText = JSON.stringify(await executor(ctx, tu.input || {}))
        } catch (e) {
          console.error('[assistant] tool failed', tu.name, e?.message || e)
          resultText = JSON.stringify({ error: e?.message || 'Tool gagal.' }); isError = true
        }
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: resultText, is_error: isError })
        trace.push({ r: round, tool: tu.name, bytes: resultText.length, err: isError ? resultText.slice(0, 120) : undefined })
      }
      messages.push({ role: 'user', content: toolResults })
    }

    // Jatah putaran habis: JANGAN buang data yang sudah terkumpul. Satu panggilan
    // terakhir TANPA tools memaksa model merangkum apa yang ada (Pikat langsung
    // minta maaf di sini; di SellerOS pertanyaan strategis lazim butuh 5-6 tool
    // berurutan, jadi jawaban parsial jauh lebih berguna daripada penolakan).
    messages.push({
      role: 'user',
      content: 'Jatah pemanggilan tool sudah habis. Jawab SEKARANG dari data yang sudah kamu dapat di atas, tanpa memanggil tool lagi. Sebutkan singkat kalau ada bagian yang belum sempat dicek.',
    })
    const final = await client.messages
      .stream({ model: MODEL, max_tokens: 2048, system: systemPrompt(new Date(), promptCtx), messages })
      .finalMessage()
    const text = final.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    console.log('[assistant] done-after-limit', JSON.stringify({ ws: workspaceId, rounds: MAX_TOOL_ROUNDS, ms: Date.now() - t0, trace }))
    return respond(text || 'Maaf, butuh terlalu banyak langkah untuk menjawab itu. Coba pertanyaan yang lebih spesifik ya.')
  } catch (e) {
    console.error('[assistant] error', e, JSON.stringify({ ws: workspaceId, ms: Date.now() - t0, trace }))
    const desc = e instanceof Anthropic.APIError ? `AI error (${e.status})` : 'Terjadi kesalahan internal.'
    res.status(500).json({ error: 'assistant_failed', error_description: desc })
  }
}
