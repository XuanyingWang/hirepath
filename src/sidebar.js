// ── SIDEBAR ───────────────────────────────────────────────────────────────────
import { state, save } from './state.js'
import { t } from './i18n.js'
import { esc } from './util.js'
import { getUser } from './auth.js'
import { getSyncStatus } from './sync.js'
import { supabaseConfigured } from './supabase.js'

export function renderSB() {
  let h = `<div class="dir-hd"><span>${t('目录', 'Folders')}</span><button onclick="addFolder()" title="${t('新建目录', 'New folder')}">＋</button></div>`
  state.S.folders.forEach(f => {
    const chs = state.S.chapters.filter(c => c.folderId === f.id)
    h += `<div class="folder${f.open ? ' open' : ''}" id="fd-${f.id}">
      <div class="folder-hd" data-fid="${f.id}" onclick="toggleF('${f.id}')">
        <span class="farrow">▶</span>
        <span class="ficon">${f.icon || '📁'}</span>
        <span class="fname">${esc(f.name)}</span>
        <span class="fcnt">${chs.length}</span>
        <div class="factions">
          <button onclick="event.stopPropagation();renameF('${f.id}')" title="${t('重命名', 'Rename')}">✏️</button>
          <button onclick="event.stopPropagation();delF('${f.id}')" title="${t('删除', 'Delete')}">🗑️</button>
        </div>
      </div>
      <div class="fchildren">
        ${chs.map(c => chItem(c)).join('')}
        ${chs.length === 0 ? `<div style="padding:4px 32px;font-size:11.5px;color:var(--muted2)">${t('暂无章节', 'No chapters yet')}</div>` : ''}
      </div>
    </div>`
  })
  const orphans = state.S.chapters.filter(c => !state.S.folders.find(f => f.id === c.folderId))
  if (orphans.length) {
    h += `<div class="dir-hd" style="margin-top:8px"><span>${t('未分类', 'Uncategorized')}</span></div>`
    orphans.forEach(c => { h += chItem(c, true) })
  }
  h += `
    <div class="dir-hd" style="margin-top:8px"><span>${t('面试备考', 'Interview Prep')}</span></div>
    <div class="ch-item${state.activeCid === '__jobprep__' ? ' active' : ''}" data-cid="__jobprep__" onclick="selJobPrep()">
      <span class="ch-dot" style="background:#6366f1"></span>
      <span class="ch-label">💼 ${t('求职备考', 'Job Prep')}</span>
    </div>
    <div class="ch-item${state.activeCid === '__resume__' || state.activeCid === '__behavioral__' ? ' active' : ''}" data-cid="__resume__" onclick="selResume()">
      <span class="ch-dot" style="background:var(--accent)"></span>
      <span class="ch-label">📄 ${t('简历分析器', 'Resume Analyzer')}</span>
    </div>
    <div class="ch-item${state.activeCid === '__bqprep__' ? ' active' : ''}" data-cid="__bqprep__" onclick="selBqPrep()">
      <span class="ch-dot" style="background:var(--green)"></span>
      <span class="ch-label">🎯 ${t('BQ 备考', 'BQ Prep')}</span>
    </div>
    <div class="ch-item${state.activeCid === '__aggregator__' ? ' active' : ''}" data-cid="__aggregator__" onclick="selAggregator()">
      <span class="ch-dot" style="background:#a855f7"></span>
      <span class="ch-label">🖼️ ${t('知识聚合器', 'Knowledge Aggregator')}</span>
    </div>
    <div class="dir-hd" style="margin-top:8px"><span>${t('练习区', 'Practice Area')}</span></div>
    <div class="ch-item${state.activeCid === '__ood__' ? ' active' : ''}" data-cid="__ood__" onclick="selOod()">
      <span class="ch-dot" style="background:#22d3ee"></span>
      <span class="ch-label">🏗️ ${t('OOD 设计', 'OOD Design')}</span>
    </div>
    <div class="ch-item ch-item-soon" data-cid="__sysdesign__">
      <span class="ch-dot" style="background:#444"></span>
      <span class="ch-label">🖥️ ${t('系统设计', 'System Design')} <span class="ch-soon-badge">${t('即将推出', 'Soon')}</span></span>
    </div>
    <div class="dir-hd" style="margin-top:8px"><span>${t('总览', 'Overview')}</span></div>
    <div class="ch-item${state.activeCid === '__dashboard__' ? ' active' : ''}" data-cid="__dashboard__" onclick="selDashboard()">
      <span class="ch-dot" style="background:var(--yellow)"></span>
      <span class="ch-label">${t('📊 备考进度', '📊 Progress Dashboard')}</span>
    </div>`
  document.getElementById('sbBody').innerHTML = h
  _renderSBFooter()
  initSBDrag()
}

function _renderSBFooter() {
  const footer = document.getElementById('sb-footer')
  if (!footer) return
  const user = getUser()
  const { status } = getSyncStatus()

  if (!supabaseConfigured) {
    footer.innerHTML = ''
    return
  }

  if (user) {
    footer.innerHTML = `
      <div class="sb-auth-row">
        <span class="sb-auth-email" title="${esc(user.email)}">${esc(user.email)}</span>
        <span id="sync-badge" class="sync-badge" title=""></span>
      </div>`
    // Re-apply current status icon after re-render
    const badge = document.getElementById('sync-badge')
    if (badge) {
      const MAP = {
        idle:'', syncing:'⟳', synced:'✓', pending:'●', offline:'☁', error:'✕'
      }
      const COLORS = {
        idle:'', syncing:'var(--accent)', synced:'var(--green)',
        pending:'var(--yellow)', offline:'var(--muted2)', error:'var(--red)'
      }
      badge.textContent = MAP[status] || ''
      badge.style.color = COLORS[status] || ''
      badge.classList.toggle('sync-spinning', status === 'syncing')
    }
  } else {
    footer.innerHTML = `
      <div class="sb-signin-banner" onclick="showSettings()">
        <span class="sb-signin-icon">☁</span>
        <span class="sb-signin-text">${t('登录以同步数据', 'Sign in to sync data')}</span>
        <span class="sb-signin-arrow">→</span>
      </div>`
  }
}

export function chItem(c, orphan = false) {
  return `<div class="ch-item${c.id === state.activeCid ? ' active' : ''}"
    data-cid="${c.id}"
    style="${orphan ? 'padding-left:14px' : ''}"
    onclick="selCh('${c.id}')">
    <span class="ch-dot"></span>
    <span class="ch-label">${esc(c.name)}</span>
    <div class="ch-actions">
      <button onclick="event.stopPropagation();renameCh('${c.id}')" title="${t('重命名', 'Rename')}">✎</button>
      <button onclick="event.stopPropagation();moveCh('${c.id}')" title="${t('移动', 'Move')}">⇄</button>
      <button onclick="event.stopPropagation();delCh('${c.id}')" title="${t('删除', 'Delete')}">✕</button>
    </div>
  </div>`
}

export function toggleF(id) {
  const f = state.S.folders.find(f => f.id === id)
  if (f) { f.open = !f.open; save(); renderSB() }
}

export function initSBDrag() {
  const sb = document.getElementById('sbBody')
  if (!sb) return
  sb.onpointerdown = e => {
    if (e.target.closest('.ch-actions')) return
    const item = e.target.closest('.ch-item')
    if (!item) return
    const cid = item.dataset.cid
    if (!cid || cid === '__behavioral__' || cid === '__resume__' || cid === '__bqprep__' || cid === '__jobprep__' || cid === '__dashboard__' || cid === '__aggregator__' || cid === '__ood__' || cid === '__sysdesign__') return
    state.dragState = { cid, startX: e.clientX, startY: e.clientY, active: false, ghost: null, item }
    document.addEventListener('pointermove', sbDragMove, { passive: false })
    document.addEventListener('pointerup', sbDragEnd)
    document.addEventListener('pointercancel', sbDragEnd)
  }
}

export function sbDragMove(e) {
  if (!state.dragState) return
  const dx = e.clientX - state.dragState.startX, dy = e.clientY - state.dragState.startY
  if (!state.dragState.active) {
    if (Math.sqrt(dx * dx + dy * dy) < 6) return
    state.dragState.active = true
    state.dragState.item.classList.add('dragging')
    const g = document.createElement('div')
    g.className = 'drag-ghost'
    g.textContent = state.dragState.item.querySelector('.ch-label')?.textContent || ''
    document.body.appendChild(g)
    state.dragState.ghost = g
  }
  e.preventDefault()
  state.dragState.ghost.style.left = (e.clientX + 14) + 'px'
  state.dragState.ghost.style.top = (e.clientY - 10) + 'px'
  document.querySelectorAll('.drop-above,.drop-below,.drop-target').forEach(el =>
    el.classList.remove('drop-above', 'drop-below', 'drop-target'))
  for (const t of document.querySelectorAll('.ch-item:not(.dragging)')) {
    const r = t.getBoundingClientRect()
    if (e.clientY >= r.top && e.clientY <= r.bottom) {
      t.classList.toggle('drop-above', e.clientY < r.top + r.height / 2)
      t.classList.toggle('drop-below', e.clientY >= r.top + r.height / 2)
      return
    }
  }
  for (const fh of document.querySelectorAll('.folder-hd')) {
    const r = fh.getBoundingClientRect()
    if (e.clientY >= r.top && e.clientY <= r.bottom) { fh.classList.add('drop-target'); return }
  }
}

export function sbDragEnd() {
  document.removeEventListener('pointermove', sbDragMove)
  document.removeEventListener('pointerup', sbDragEnd)
  document.removeEventListener('pointercancel', sbDragEnd)
  if (!state.dragState) return
  const ds = state.dragState
  state.dragState = null
  const dropEl = document.querySelector('.ch-item.drop-above,.ch-item.drop-below')
  const dropFh = document.querySelector('.folder-hd.drop-target')
  const isAfter = dropEl?.classList.contains('drop-below')
  const targetId = dropEl?.dataset.cid
  const targetFid = dropFh?.dataset.fid
  ds.ghost?.remove()
  ds.item?.classList.remove('dragging')
  document.querySelectorAll('.drop-above,.drop-below,.drop-target').forEach(el =>
    el.classList.remove('drop-above', 'drop-below', 'drop-target'))
  if (!ds.active) return
  if (targetId && targetId !== ds.cid && !['__behavioral__', '__resume__', '__bqprep__', '__jobprep__', '__dashboard__', '__aggregator__', '__ood__', '__sysdesign__'].includes(targetId)) {
    const srcIdx = state.S.chapters.findIndex(c => c.id === ds.cid)
    const [src] = state.S.chapters.splice(srcIdx, 1)
    const tgtIdx = state.S.chapters.findIndex(c => c.id === targetId)
    state.S.chapters.splice(isAfter ? tgtIdx + 1 : tgtIdx, 0, src)
    save(); renderSB()
  } else if (targetFid) {
    const src = state.S.chapters.find(c => c.id === ds.cid)
    if (src && src.folderId !== targetFid) { src.folderId = targetFid; save(); renderSB() }
  }
}
