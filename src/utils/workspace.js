const WS_KEY = 'quadrant_workspaces_v1'
const CURRENT_KEY = 'quadrant_current_workspace_v1'

export const PRESET_COLORS = [
  '#f97316', // orange
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6b7280', // gray
]

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)) }
  catch { return fallback }
}

export function getWorkspaces() {
  const list = read(WS_KEY, [])
  if (list.length === 0) {
    // Bootstrap a default workspace, migrating any legacy sessions into it
    const def = {
      id: crypto.randomUUID(),
      name: 'Toko Utama',
      color: PRESET_COLORS[0],
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem(WS_KEY, JSON.stringify([def]))
    localStorage.setItem(CURRENT_KEY, def.id)
    migrateLegacySessions(def.id)
    return [def]
  }
  return list
}

export function getCurrentWorkspaceId() {
  const id = localStorage.getItem(CURRENT_KEY)
  const list = getWorkspaces()
  if (id && list.some(w => w.id === id)) return id
  // Fallback to first
  const first = list[0]?.id
  if (first) localStorage.setItem(CURRENT_KEY, first)
  return first
}

export function getCurrentWorkspace() {
  const id = getCurrentWorkspaceId()
  return getWorkspaces().find(w => w.id === id) || null
}

export function setCurrentWorkspace(id) {
  localStorage.setItem(CURRENT_KEY, id)
}

export function createWorkspace({ name, color }) {
  const list = getWorkspaces()
  const ws = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Workspace Baru',
    color: color || PRESET_COLORS[0],
    createdAt: new Date().toISOString(),
  }
  localStorage.setItem(WS_KEY, JSON.stringify([...list, ws]))
  localStorage.setItem(CURRENT_KEY, ws.id)
  return ws
}

export function updateWorkspace(id, patch) {
  const list = getWorkspaces().map(w => w.id === id ? { ...w, ...patch } : w)
  localStorage.setItem(WS_KEY, JSON.stringify(list))
}

export function deleteWorkspace(id) {
  const list = getWorkspaces().filter(w => w.id !== id)
  // Don't allow deleting the last workspace
  if (list.length === 0) return false
  localStorage.setItem(WS_KEY, JSON.stringify(list))
  // Clean its sessions
  localStorage.removeItem(sessionsKeyFor(id))
  // If current was deleted, switch to first remaining
  if (getCurrentWorkspaceId() === id) {
    localStorage.setItem(CURRENT_KEY, list[0].id)
  }
  return true
}

// ─── Session key scoping ──────────────────────────────────────────
export function sessionsKeyFor(workspaceId) {
  return `quadrant_sessions_v1::${workspaceId}`
}

// Migrate old global sessions (pre-workspace) into the given workspace
function migrateLegacySessions(workspaceId) {
  const legacy = localStorage.getItem('quadrant_sessions_v1')
  if (legacy) {
    localStorage.setItem(sessionsKeyFor(workspaceId), legacy)
    localStorage.removeItem('quadrant_sessions_v1')
  }
}
