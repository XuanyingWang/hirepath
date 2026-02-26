// ── CLOUD SYNC ────────────────────────────────────────────────────────────────
import { state } from './state.js'
import { supabase, supabaseConfigured } from './supabase.js'
import { getUser } from './auth.js'

const LS_SYNC_KEY = 'l5sync_ts'   // localStorage key for last-synced timestamp

let _pendingPush   = false
let _debounceTimer = null
let _status        = 'idle'       // 'idle'|'syncing'|'synced'|'pending'|'offline'|'error'
let _lastSyncedAt  = localStorage.getItem(LS_SYNC_KEY) || null
const _cbs         = []           // status-change subscribers

// ── Public API ────────────────────────────────────────────────────────────────

export function getSyncStatus() { return { status: _status, lastSyncedAt: _lastSyncedAt } }

export function onSyncChange(cb) { _cbs.push(cb) }

export function initSync() {
  window.addEventListener('online',  () => { if (_pendingPush) _doPush() })
  window.addEventListener('offline', () => _setStatus('offline'))
}

/** Debounced (3 s) push to Supabase. Called by save() via the registered callback. */
export function schedulePush() {
  if (!supabaseConfigured || !getUser()) return
  _pendingPush = true
  _setStatus('pending')
  clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(_doPush, 3000)
}

/** On app start (after auth resolves): pull from cloud if server is newer. */
export async function pullOnStart() {
  if (!supabaseConfigured || !getUser() || !navigator.onLine) return
  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('data, updated_at')
      .eq('user_id', getUser().id)
      .single()

    if (error) {
      // PGRST116 = row not found → first sign-in, push local data up
      if (error.code === 'PGRST116') { await _doPush(); return }
      throw error
    }

    const serverTs = new Date(data.updated_at).getTime()
    const localTs  = new Date(_lastSyncedAt || 0).getTime()

    if (serverTs > localTs) {
      // Cloud is newer (another device was used) → merge and overwrite local
      state.S = _merge(state.S, data.data)
      // Call localStorage save directly to avoid re-triggering schedulePush
      localStorage.setItem('l5v3', JSON.stringify(state.S))
      _lastSyncedAt = data.updated_at
      localStorage.setItem(LS_SYNC_KEY, _lastSyncedAt)
      _setStatus('synced')
    } else {
      _setStatus('synced')
    }
  } catch (e) {
    console.error('Sync pull error:', e)
    _setStatus('error')
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

async function _doPush() {
  if (!supabaseConfigured || !getUser() || !navigator.onLine) return
  _setStatus('syncing')
  try {
    const now = new Date().toISOString()
    const { error } = await supabase.from('user_data').upsert({
      user_id:          getUser().id,
      data:             state.S,
      client_updated_at: now,
    }, { onConflict: 'user_id' })
    if (error) throw error
    _lastSyncedAt = now
    localStorage.setItem(LS_SYNC_KEY, now)
    _pendingPush = false
    _setStatus('synced')
  } catch (e) {
    console.error('Sync push error:', e)
    _setStatus('error')
  }
}

function _setStatus(s) {
  _status = s
  _cbs.forEach(cb => { try { cb(s) } catch (_) {} })
  _updateBadge()
}

function _updateBadge() {
  const badge = document.getElementById('sync-badge')
  if (!badge) return
  const MAP = {
    idle:    { icon: '',  color: '',                  title: '' },
    syncing: { icon: '⟳', color: 'var(--accent)',     title: 'Syncing…' },
    synced:  { icon: '✓', color: 'var(--green)',      title: 'Synced · ' + _timeStr() },
    pending: { icon: '●', color: 'var(--yellow)',     title: 'Sync pending' },
    offline: { icon: '☁', color: 'var(--muted2)',     title: 'Offline' },
    error:   { icon: '✕', color: 'var(--red)',        title: 'Sync error — will retry' },
  }
  const m = MAP[_status] || MAP.idle
  badge.textContent = m.icon
  badge.style.color = m.color
  badge.title = m.title
  badge.classList.toggle('sync-spinning', _status === 'syncing')
}

function _timeStr() {
  return _lastSyncedAt ? new Date(_lastSyncedAt).toLocaleTimeString() : ''
}

// ── Merge: additive union of collections by id ────────────────────────────────

function _merge(local, remote) {
  if (!remote) return local
  const result = structuredClone(local)

  const PATHS = [
    ['chapters'],
    ['folders'],
    ['behavioral', 'stories'],
    ['behavioral', 'resumes'],
    ['behavioral', 'bqStore'],
    ['jobPrep', 'companies'],
  ]
  for (const path of PATHS) {
    const localArr  = _getPath(local, path)  || []
    const remoteArr = _getPath(remote, path) || []
    _setPath(result, path, _mergeById(localArr, remoteArr))
  }
  return result
}

/** Union by id: items only in remote are added; conflicts keep local version. */
function _mergeById(localArr, remoteArr) {
  const map = new Map(localArr.map(item => [item.id, item]))
  for (const item of remoteArr) {
    if (!map.has(item.id)) map.set(item.id, item)
  }
  return [...map.values()]
}

function _getPath(obj, path) {
  return path.reduce((o, k) => o?.[k], obj)
}

function _setPath(obj, path, val) {
  const parent = path.slice(0, -1).reduce((o, k) => {
    if (!o[k]) o[k] = {}
    return o[k]
  }, obj)
  parent[path[path.length - 1]] = val
}
