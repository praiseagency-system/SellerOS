// Upload foto produk ke Supabase Storage (bucket publik `product-images`).
// Foto di-resize di browser jadi thumbnail kecil (webp) sebelum diunggah,
// disimpan di folder per workspace: `{workspace_id}/{uuid}.webp`.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'

const BUCKET = 'product-images'

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

// Resize ke sisi terpanjang `max` px, ekspor webp. Mengembalikan Blob.
async function resizeImage(file, max = 512, quality = 0.82) {
  const img = await loadImage(file)
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', quality))
  if (!blob) throw new Error('Gagal memproses gambar.')
  return blob
}

// Upload satu foto. Mengembalikan { path, url }.
export async function uploadProductImage(file) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const blob = await resizeImage(file)
  const path = `${wsId}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { path, url: data.publicUrl }
}

// Hapus foto by path (abaikan bila kosong / error).
export async function deleteProductImage(path) {
  if (!path) return
  try { await supabase.storage.from(BUCKET).remove([path]) }
  catch (e) { console.error('Gagal hapus foto:', e) }
}
