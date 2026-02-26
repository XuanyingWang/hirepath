// ── KNOWLEDGE ─────────────────────────────────────────────────────────────────
import { state, gch, save } from './state.js'
import { t } from './i18n.js'
import { esc, md2h, showLoading, showErr } from './util.js'
import { buildAnalysis } from './analysis.js'

export function renderKnowledge() {
  const c = gch(); if (!c) return

  // Source header — local file chapters have a placeholder URL, not a real link
  const isLocal = c.url?.startsWith('[local:')
  const localName = isLocal ? c.url.replace(/^\[local:\s*/, '').replace(/\]$/, '') : ''
  const srcHtml = isLocal
    ? `<span class="meta-chip-file">📄 ${esc(localName)}</span>`
    : `<a href="${esc(c.url)}" target="_blank">↗ ${t('原始文档', 'Source')}</a>`

  // Body content
  let bodyHtml
  if (c.analysis) {
    // Normal case — AI-generated notes exist
    bodyHtml = `<div class="rb">${md2h(c.analysis)}</div>`
  } else if (c.rawContent) {
    // File-imported chapter, no AI notes yet
    const preview = c.rawContent.slice(0, 5000)
    const trimmed = c.rawContent.length > 5000
    bodyHtml = `
      <div class="raw-import-banner">
        <div class="raw-import-icon">📄</div>
        <div class="raw-import-body">
          <strong>${t('本地文件已导入', 'Local file imported')}</strong>
          <span>${t(
            'Quiz 和 Flashcard 可直接使用。如需结构化学习笔记，点击「生成 AI 笔记」。',
            'Quiz and Flashcard work directly from this file. Click "Generate AI Notes" for structured study notes.'
          )}</span>
        </div>
        <button class="btn-primary" onclick="rebuildKnowledge()">
          ✨ ${t('生成 AI 笔记', 'Generate AI Notes')}
        </button>
      </div>
      <details class="raw-file-details">
        <summary class="raw-file-summary">${t('查看原始文件内容', 'View raw file content')}</summary>
        <pre class="raw-file-pre">${esc(preview)}${trimmed ? '\n…' : ''}</pre>
      </details>`
  } else {
    bodyHtml = `<div class="rb" style="color:var(--muted);padding:24px 0">${t('暂无内容。', 'No content yet.')}</div>`
  }

  document.getElementById('mainContent').innerHTML = `
    <div class="readme-view">
      <div class="readme-hd">
        <h1>${esc(c.name)}</h1>
        <div class="readme-meta">
          ${srcHtml}
          <span>·</span>
          <span>${new Date(c.createdAt).toLocaleDateString(state.lang === 'en' ? 'en-US' : 'zh-CN')}</span>
          <span class="meta-chip">L5</span>
          ${c.analysis ? `<button class="btn-rebuild" onclick="rebuildKnowledge()" title="${t('重新生成学习框架', 'Regenerate knowledge framework')}">↺ ${t('重新生成', 'Regenerate')}</button>` : ''}
        </div>
      </div>
      ${bodyHtml}
    </div>`
}

export async function rebuildKnowledge() {
  const c = gch(); if (!c) return
  if (!confirm(t(`重新生成「${c.name}」的学习框架？当前内容将被覆盖。`, `Regenerate the knowledge framework for "${c.name}"? Current content will be overwritten.`))) return
  showLoading(t('正在重新生成…', 'Regenerating…'), `${t('正在获取并分析', 'Fetching and analyzing')}「${c.name}」`)
  try {
    // For file-imported chapters, pass rawContent as pasteContent to skip URL fetch
    c.analysis = await buildAnalysis(c.name, c.url, c.rawContent || '')
    save()
    renderKnowledge()
  } catch (err) { showErr(err?.message || String(err)) }
}
