// Lookup nama akun/username TikTok dari video ID via oEmbed publik
// (access-control-allow-origin: * → aman dipanggil dari browser). Dipakai untuk
// mengisi kolom AKUN yang kosong. Hasil di-cache agar tak fetch berulang.

// Ambil author 1 video. Return { videoId, username, authorName, status }.
export async function fetchAuthor(videoId, signal) {
  const url = `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@x/video/${videoId}`
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return { videoId, username: null, authorName: null, status: res.status === 404 ? 'notfound' : 'error' }
    const d = await res.json()
    const m = (d.author_url || '').match(/@([^/?#]+)/)
    return {
      videoId,
      username: m ? m[1] : null,
      authorName: d.author_name || null,
      status: (m || d.author_name) ? 'ok' : 'notfound',
    }
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
