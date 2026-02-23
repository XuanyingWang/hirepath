// ── FOLDER OPS ────────────────────────────────────────────────────────────────
import { state, save, uid } from './state.js'
import { t } from './i18n.js'
import { modal } from './util.js'
import { renderSB } from './sidebar.js'

export function addFolder() {
  modal(t('新建目录', 'New Folder'), [
    { id: 'fn', ph: t('目录名称（如 Kubernetes）', 'Folder name (e.g. Kubernetes)') },
    { id: 'fi', ph: t('图标 emoji（如 ⚡ 📦 🔧）', 'Icon emoji (e.g. ⚡ 📦 🔧)') }
  ], v => {
    if (!v.fn.trim()) return
    state.S.folders.push({ id: uid(), name: v.fn.trim(), icon: v.fi.trim() || '📁', open: true })
    save(); renderSB()
  })
}

export function renameF(id) {
  const f = state.S.folders.find(f => f.id === id); if (!f) return
  modal(t('重命名目录', 'Rename Folder'), [
    { id: 'fn', ph: t('目录名称', 'Folder name'), val: f.name },
    { id: 'fi', ph: t('图标 emoji', 'Icon emoji'), val: f.icon }
  ], v => {
    if (!v.fn.trim()) return
    f.name = v.fn.trim(); f.icon = v.fi.trim() || f.icon; save(); renderSB()
  })
}

export function delF(id) {
  if (!confirm(t('删除此目录？章节移至未分类。', 'Delete this folder? Chapters will move to Uncategorized.'))) return
  state.S.folders = state.S.folders.filter(f => f.id !== id)
  state.S.chapters.forEach(c => { if (c.folderId === id) c.folderId = null })
  save(); renderSB()
}
