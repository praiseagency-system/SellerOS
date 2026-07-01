// Lookup nama akun/username TikTok dari video ID via oEmbed publik
// (access-control-allow-origin: * → aman dipanggil dari browser). Dipakai untuk
// mengisi kolom AKUN yang kosong. Hasil di-cache agar tak fetch berulang.

// Buang nama sampah dari oEmbed ("@", kosong, hanya simbol).
function cleanName(s) {
  const t = (s || '').trim()
  if (!t || t === '@' || !/[\p{L}\p{N}]/u.test(t)) return null
  return t
}

// Ambil author 1 video. Return { videoId, username, authorName, status }.
// username = handle asli dari author_url (paling andal); authorName = display.
export async function fetchAuthor(videoId, signal) {
  const url = `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@x/video/${videoId}`
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return { videoId, username: null, authorName: null, status: res.status >= 500 ? 'error' : 'notfound' }
    const d = await res.json()
    const m = (d.author_url || '').match(/tiktok\.com\/@([\w.-]+)/i)
    const username = m ? m[1] : null
    const authorName = cleanName(d.author_name)
    // Tanpa handle & tanpa nama valid (mis. oEmbed balikin "@") = tak terselesaikan.
    return { videoId, username, authorName, status: (username || authorName) ? 'ok' : 'notfound' }
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    return { videoId, username: null, authorName: null, status: 'error' }
  }
}

// Proses banyak video ID dengan batas konkurensi + jeda kecil (hindari throttle).
// onProgress(done, total, lastResult). Return array hasil.
export async function enrichVideos(videoIds, { concurrency = 5, delayMs = 120, onProgress, signal } = {}) {
  const ids = [...new Set(videoIds.filter(Boolean))]
  const results = []
  let idx = 0
  let done = 0

  async function worker() {
    while (idx < ids.length) {
      if (signal?.aborted) return
      const id = ids[idx++]
      const r = await fetchAuthor(id, signal)
      results.push(r)
      done++
      onProgress?.(done, ids.length, r)
      if (delayMs) await new Promise(res => setTimeout(res, delayMs))
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, worker)
  await Promise.all(workers)
  return results
}
