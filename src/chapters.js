// ── CHAPTER OPS ───────────────────────────────────────────────────────────────
import { state, save } from './state.js'
import { t } from './i18n.js'
import { modal, closeModal, esc } from './util.js'
import { renderSB } from './sidebar.js'

export function renameCh(id) {
  const c = state.S.chapters.find(c => c.id === id); if (!c) return
  modal(t('重命名章节', 'Rename Chapter'), [{ id: 'cn', ph: t('章节名称', 'Chapter name'), val: c.name }], v => {
    if (!v.cn.trim()) return; c.name = v.cn.trim(); save(); renderSB()
    if (id === state.activeCid) document.getElementById('topbarTitle').textContent = c.name
  })
}

export function moveCh(id) {
  const c = state.S.chapters.find(c => c.id === id); if (!c) return
  const opts = state.S.folders.map(f =>
    `<option value="${f.id}"${c.folderId === f.id ? ' selected' : ''}>${esc(f.name)}</option>`
  ).join('')
  modal('', [], () => {}, `
    <div class="modal-title">${t('移动', 'Move')} 「${esc(c.name)}」${t('到…', 'to…')}</div>
    <select class="modal-select" id="mv_tgt">
      <option value="">${t('未分类', 'Uncategorized')}</option>${opts}
    </select>
    <div class="modal-actions">
      <button class="btn-sec" onclick="closeModal()">${t('取消', 'Cancel')}</button>
      <button class="btn-primary" onclick="doMove('${id}')">${t('移动', 'Move')}</button>
    </div>
  `)
}

export function doMove(id) {
  const c = state.S.chapters.find(c => c.id === id)
  const sel = document.getElementById('mv_tgt')
  if (c) { c.folderId = sel.value || null; save(); renderSB() }
  closeModal()
}

export function delCh(id) {
  if (!confirm(t('删除此章节？', 'Delete this chapter?'))) return
  state.S.chapters = state.S.chapters.filter(c => c.id !== id)
  if (state.activeCid === id) {
    state.activeCid = null
    document.getElementById('topbar').style.display = 'none'
    window.renderWelcome()
  }
  save(); renderSB()
}
