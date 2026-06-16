// Penyimpanan produk — di-scope per workspace (sama pola dengan sessions).
import { getCurrentWorkspaceId } from './workspace'

function keyFor(wsId) { return `quadrant_products_v1::${wsId}` }
function currentKey() { return keyFor(getCurrentWorkspaceId()) }

export function getProducts() {
  try { return JSON.parse(localStorage.getItem(currentKey()) || '[]') }
  catch { return [] }
}

function writeAll(list) {
  localStorage.setItem(currentKey(), JSON.stringify(list))
}

// Tambah produk baru atau update bila id sudah ada
export function saveProduct(product) {
  const list = getProducts()
  const now = new Date().toISOString()
  const idx = product.id ? list.findIndex(p => p.id === product.id) : -1
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...product, updatedAt: now }
  } else {
    // id terakhir + fallback agar tidak tertimpa undefined dari spread
    list.unshift({ createdAt: now, updatedAt: now, ...product, id: product.id || crypto.randomUUID() })
  }
  writeAll(list)
  return list
}

export function deleteProduct(id) {
  writeAll(getProducts().filter(p => p.id !== id))
}

export function duplicateProduct(id) {
  const list = getProducts()
  const src = list.find(p => p.id === id)
  if (!src) return list
  const now = new Date().toISOString()
  const copy = {
    ...src,
    id: crypto.randomUUID(),
    name: `${src.name} (Salinan)`,
    createdAt: now,
    updatedAt: now,
  }
  const idx = list.findIndex(p => p.id === id)
  list.splice(idx + 1, 0, copy)
  writeAll(list)
  return copy
}
