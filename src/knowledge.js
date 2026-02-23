// ── KNOWLEDGE ─────────────────────────────────────────────────────────────────
import { state, gch, save } from './state.js'
import { t } from './i18n.js'
import { esc, md2h, showLoading, showErr } from './util.js'
import { buildAnalysis } from './analysis.js'

export function renderKnowledge() {
  const c = gch(); if (!c) return
  document.getElementById('mainContent').innerHTML = `
    <div class="readme-view">
      <div class="readme-hd">
        <h1>${esc(c.name)}</h1>
        <div class="readme-meta">
          <a href="${esc(c.url)}" target="_blank">↗ ${t('原始文档', 'Source')}</a>
          <span>·</span>
          <span>${new Date(c.createdAt).toLocaleDateString(state.lang === 'en' ? 'en-US' : 'zh-CN')}</span>
          <span class="meta-chip">L5</span>
          <button class="btn-rebuild" onclick="rebuildKnowledge()" title="${t('重新生成学习框架', 'Regenerate knowledge framework')}">↺ ${t('重新生成', 'Regenerate')}</button>
        </div>
      </div>
      <div class="rb">${md2h(c.analysis)}</div>
    </div>`
}

export async function rebuildKnowledge() {
  const c = gch(); if (!c) return
  if (!confirm(t(`重新生成「${c.name}」的学习框架？当前内容将被覆盖。`, `Regenerate the knowledge framework for "${c.name}"? Current content will be overwritten.`))) return
  showLoading(t('正在重新生成…', 'Regenerating…'), `${t('正在获取并分析', 'Fetching and analyzing')}「${c.name}」`)
  try {
    c.analysis = await buildAnalysis(c.name, c.url)
    save()
    renderKnowledge()
  } catch (err) { showErr(err?.message || String(err)) }
}
