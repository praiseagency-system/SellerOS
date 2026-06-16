// Dataset Store Performance — di-scope per workspace. Menyimpan baris ternormalisasi
// gabungan dari semua file yang di-upload + metadata file.
import { getCurrentWorkspaceId } from './workspace'

function keyFor(ws) { return `quadrant_store_v1::${ws}` }
function currentKey() { return keyFor(getCurrentWorkspaceId()) }

export function getStore() {
  try { return JSON.parse(localStorage.getItem(currentKey()) || '{"files":[],"lines":[]}') }
  catch { return { files: [], lines: [] } }
}

// Tambah hasil ingest; file dengan nama sama menggantikan yang lama. Return store + warning.
export function addUpload({ fileName, source, months, lines }) {
  const store = getStore()
  const files = store.files.filter(f => f.name !== fileName)
  const keptLines = store.lines.filter(l => l._f !== fileName)
  const tagged = lines.map(l => ({ ...l, _f: fileName }))
  const next = {
    files: [...files, { name: fileName, source, months, count: lines.length, savedAt: new Date().toISOString() }],
    lines: [...keptLines, ...tagged],
  }
  let warning = null
  try { localStorage.setItem(currentKey(), JSON.stringify(next)) }
  catch { warning = 'Dataset terlalu besar untuk disimpan permanen — data tetap aktif di sesi ini.' }
  return { store: next, warning }
}

export function clearStore() {
  localStorage.removeItem(currentKey())
}

export function removeFile(fileName) {
  const store = getStore()
  const next = {
    files: store.files.filter(f => f.name !== fileName),
    lines: store.lines.filter(l => l._f !== fileName),
  }
  try { localStorage.setItem(currentKey(), JSON.stringify(next)) } catch { /* ignore */ }
  return next
}
