// ── KNOWLEDGE ─────────────────────────────────────────────────────────────────
import { state, gch, save, uid } from './state.js'
import { t } from './i18n.js'
import { esc, md2h, showLoading, showErr } from './util.js'
import { buildAnalysis } from './analysis.js'
import { claudeStream } from './api.js'
import { getBh } from './behavioral/shared.js'
import { indexChapter, retrieveContext } from './rag.js'

// ── Module-level ephemeral state ───────────────────────────────────────────────
let _qaOpen = false          // Q&A panel visible?
let _qaActiveCid = null      // which chapter the panel belongs to (reset on chapter change)
let _notesEditing = false    // notes section in edit mode?
let _refineOpen = false      // refine panel visible?
let _refining = false        // refine AI call in progress?

const _CH_QA_PRESETS = [
  { key: 'relevance',  label: () => t('我的经历相关性？',  'My experience relevance?') },
  { key: 'gaps',       label: () => t('我的知识缺口？',    'My knowledge gaps?') },
  { key: 'l5angle',   label: () => t('SDE II 面试角度？',     'SDE II interview angle?') },
  { key: 'highlight', label: () => t('应该重点展示什么？', 'What to highlight?') },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function _buildProfileCtx() {
  const bh = getBh()
  if (!bh.resumes || bh.resumes.length === 0) return t('（无简历数据）', '(No resume data)')
  return bh.resumes.map(r => {
    const bullets = (r.bullets || []).map(b =>
      `  [${b.role || ''}] ${b.text || ''}`
    ).join('\n')
    return `# ${r.name}\n${bullets}`
  }).join('\n\n')
}

function _chQaPanel(c) {
  const history = c.qaHistory || []
  const hasHistory = history.length > 0
  const presetHtml = _CH_QA_PRESETS.map(p =>
    `<button class="tp-qa-preset-btn" onclick="sendChQaPreset('${c.id}','${p.key}')">${p.label()}</button>`
  ).join('')

  const historyHtml = hasHistory
    ? `<div class="tp-qa-history">
        ${history.map(e => `
          <div class="tp-qa-entry">
            <div class="tp-qa-q">Q: ${esc(e.q)}</div>
            <div class="tp-qa-a">${md2h(e.a)}</div>
          </div>`).join('')}
        <div class="tp-qa-controls">
          <button class="tp-qa-clear-btn" onclick="clearChQa('${c.id}')">🗑 ${t('清除记录', 'Clear history')}</button>
        </div>
      </div>`
    : ''

  return `
    <div class="ch-qa-panel" id="ch-qa-panel-${c.id}">
      <div class="ch-qa-hd">
        <span>💬 ${t('快速问答', 'Quick Q&A')}</span>
        <button class="ch-qa-close" onclick="toggleChQa()">✕</button>
      </div>
      ${historyHtml}
      <div id="ch-qa-answers-${c.id}" class="tp-qa-answers"></div>
      <div class="tp-qa-presets">${presetHtml}</div>
      <div class="tp-qa-input-row">
        <input class="tp-qa-input" id="ch-qa-input-${c.id}" type="text"
          placeholder="${t('输入问题…', 'Ask something…')}"
          onkeydown="if(event.key==='Enter')sendChQuestion('${c.id}')">
        <button class="btn-xs" onclick="sendChQuestion('${c.id}')">${t('发送', 'Send')}</button>
      </div>
    </div>`
}

function _chNotesSection(c) {
  if (_notesEditing) {
    return `
      <div class="ch-notes-section">
        <div class="ch-notes-hd">📝 ${t('笔记', 'Notes')}</div>
        <textarea class="ch-notes-textarea" id="ch-notes-ta-${c.id}"
          placeholder="${t('在这里添加学习笔记…', 'Add study notes here…')}"
          oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
        >${esc(c.notes || '')}</textarea>
        <div class="ch-notes-actions">
          <button class="btn-primary btn-sm" onclick="saveChNotes('${c.id}')">${t('保存', 'Save')}</button>
          <button class="btn-ghost btn-sm" onclick="cancelChNotes()">${t('取消', 'Cancel')}</button>
        </div>
      </div>`
  }

  if (c.notes) {
    return `
      <div class="ch-notes-section">
        <div class="ch-notes-hd">
          📝 ${t('笔记', 'Notes')}
          <button class="ch-notes-edit-btn" onclick="editChNotes()">${t('编辑', 'Edit')}</button>
        </div>
        <div class="ch-notes-text">${esc(c.notes)}</div>
      </div>`
  }

  return `
    <div class="ch-notes-section ch-notes-empty">
      <button class="ch-notes-add-btn" onclick="editChNotes()">
        ✎ ${t('添加笔记', 'Add Notes')}
      </button>
    </div>`
}

// ── Main render ────────────────────────────────────────────────────────────────

export function renderKnowledge() {
  const c = gch(); if (!c) return

  // Reset panels if chapter changed
  if (_qaActiveCid !== c.id) {
    _qaOpen = false
    _notesEditing = false
    _refineOpen = false
    _qaActiveCid = c.id
  }

  // Source header — local file chapters have a placeholder URL, not a real link
  const isLocal = c.url?.startsWith('[local:')
  const localName = isLocal ? c.url.replace(/^\[local:\s*/, '').replace(/\]$/, '') : ''
  const srcHtml = isLocal
    ? `<span class="meta-chip-file">📄 ${esc(localName)}</span>`
    : `<a href="${esc(c.url)}" target="_blank">↗ ${t('原始文档', 'Source')}</a>`

  // Q&A toggle button — goes in meta row
  const qaBtn = `<button class="btn-qa-toggle${_qaOpen ? ' active' : ''}" onclick="toggleChQa()" title="${t('快速问答', 'Quick Q&A')}">💬 ${t('问答', 'Q&A')}</button>`

  // Body content
  let bodyHtml
  if (c.analysis) {
    bodyHtml = `<div class="rb">${md2h(c.analysis)}</div>`
  } else if (c.rawContent) {
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
          <span class="meta-chip">SDE II</span>
          ${qaBtn}
          ${c.analysis ? `<button class="btn-rebuild" onclick="rebuildKnowledge()" title="${t('重新生成学习框架', 'Regenerate knowledge framework')}">↺ ${t('重新生成', 'Regenerate')}</button>` : ''}
          ${c.analysis ? `<button class="btn-refine${_refineOpen ? ' active' : ''}" onclick="toggleRefineKnowledge()" title="${t('根据批注更新内容', 'Update content with comments')}">✏️ ${t('精调', 'Refine')}</button>` : ''}
        </div>
      </div>
      ${_qaOpen ? _chQaPanel(c) : ''}
      ${_refineOpen && c.analysis ? `
        <div class="refine-panel" id="ch-refine-panel">
          <div class="refine-panel-hd">✏️ ${t('精调内容', 'Refine Content')}</div>
          <div class="refine-panel-hint">${t('描述你希望如何修改或补充现有内容，AI 将在保留原有结构的基础上更新。', 'Describe how you want to update or augment the existing content. AI will revise it while preserving the structure.')}</div>
          <textarea class="refine-textarea" id="ch-refine-input" rows="3"
            placeholder="${t('例如：增加更多关于缓存一致性的内容；简化第二节；补充实际应用案例…', 'e.g. Add more on cache consistency; simplify section 2; add real-world examples…')}"
            oninput="this.style.height=\'auto\';this.style.height=this.scrollHeight+\'px\'"></textarea>
          <div class="refine-actions">
            <button class="btn-primary btn-sm" onclick="applyRefineKnowledge('${c.id}')" ${_refining ? 'disabled' : ''}>
              ${_refining ? `⏳ ${t('更新中…', 'Updating…')}` : `✨ ${t('应用修改', 'Apply Changes')}`}
            </button>
            <button class="btn-ghost btn-sm" onclick="toggleRefineKnowledge()">${t('取消', 'Cancel')}</button>
          </div>
        </div>` : ''}
      ${bodyHtml}
      ${_chNotesSection(c)}
    </div>`

  // Auto-size notes textarea if in edit mode
  if (_notesEditing) {
    const ta = document.getElementById(`ch-notes-ta-${c.id}`)
    if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.focus() }
  }
  // Focus refine textarea if open
  if (_refineOpen) {
    const ta = document.getElementById('ch-refine-input')
    if (ta) ta.focus()
  }
}

// ── Knowledge rebuild ──────────────────────────────────────────────────────────

export async function rebuildKnowledge() {
  const c = gch(); if (!c) return
  if (!confirm(t(`重新生成「${c.name}」的学习框架？当前内容将被覆盖。`, `Regenerate the knowledge framework for "${c.name}"? Current content will be overwritten.`))) return
  showLoading(t('正在重新生成…', 'Regenerating…'), `${t('正在获取并分析', 'Fetching and analyzing')}「${c.name}」`)
  try {
    c.analysis = await buildAnalysis(c.name, c.url, c.rawContent || '')
    save()
    indexChapter(c.id, c.analysis)
    renderKnowledge()
  } catch (err) { showErr(err?.message || String(err)) }
}

// ── Refine ─────────────────────────────────────────────────────────────────────

export function toggleRefineKnowledge() {
  _refineOpen = !_refineOpen
  renderKnowledge()
}

export async function applyRefineKnowledge(cid) {
  const c = state.S.chapters?.find(ch => ch.id === cid)
  if (!c?.analysis || _refining) return
  const ta = document.getElementById('ch-refine-input')
  const comment = ta?.value?.trim()
  if (!comment) { ta?.focus(); return }

  _refining = true
  renderKnowledge()

  const bodyEl = document.getElementById('mainContent')?.querySelector('.rb')
  if (bodyEl) bodyEl.innerHTML = `<div style="color:var(--muted);padding:16px 0">⏳ ${t('AI 正在更新内容…', 'AI is updating content…')}</div>`

  const sys = `You are a technical content editor. The user has an existing knowledge framework document and wants to refine it based on their instructions. Update the document according to the user's comments while preserving the overall structure and format. Return ONLY the full updated markdown document — no preamble, no explanation.`
  const userMsg = `Existing content:\n${c.analysis}\n\nUser's refinement instructions:\n${comment}`

  let full = ''
  try {
    await claudeStream(sys, userMsg, 4000, chunk => {
      full = chunk
      if (bodyEl) bodyEl.innerHTML = md2h(full)
    })
    c.analysis = full
    save()
  } catch (err) {
    showErr(err?.message || String(err))
  }

  _refining = false
  _refineOpen = false
  renderKnowledge()
}

// ── Q&A ────────────────────────────────────────────────────────────────────────

export function toggleChQa() {
  _qaOpen = !_qaOpen
  renderKnowledge()
}

export function sendChQaPreset(cid, key) {
  const presetMap = {
    relevance: t('根据我的经历背景，这个主题与我的相关性如何？我有哪些匹配的经验？', 'Based on my background, how relevant is this topic to me? What matching experience do I have?'),
    gaps:      t('对比这个主题的核心要点，我的知识或经验有哪些缺口？', 'Comparing against the key points of this topic, what are my knowledge or experience gaps?'),
    l5angle:  t('在 SDE II 系统设计或行为面试中，这个主题通常如何考察？我应该准备哪些角度？', 'In SDE II system design or behavioral interviews, how is this topic typically assessed? What angles should I prepare?'),
    highlight: t('基于我的经历，面试时我应该重点展示哪些内容来匹配这个主题？', 'Based on my experience, what should I highlight in an interview to best match this topic?'),
  }
  const q = presetMap[key]
  if (!q) return
  _doChQuestion(cid, q)
}

export function sendChQuestion(cid) {
  const input = document.getElementById(`ch-qa-input-${cid}`)
  const q = input?.value?.trim()
  if (!q) return
  input.value = ''
  _doChQuestion(cid, q)
}

async function _doChQuestion(cid, q) {
  const c = state.S.chapters?.find(ch => ch.id === cid)
  if (!c) return

  const profileCtx = _buildProfileCtx().slice(0, 1500)
  const topicCtx = (c.analysis || c.rawContent || '').slice(0, 2000)
  const history = c.qaHistory || []
  const convHistory = history.slice(-6).map(e => `User: ${e.q}\nAssistant: ${e.a}`).join('\n\n')

  const ragCtx = await retrieveContext(q)

  const sys = `You are an SDE II interview coach. The candidate will ask you a question. Synthesize their overall experience holistically and answer directly in 3-5 concise bullet points. Never iterate through individual bullets or repeat context.

Candidate's overall experience:
${profileCtx}

Topic being studied — "${c.name}":
${topicCtx}${ragCtx ? `\n\nRelevant notes retrieved from knowledge base:\n${ragCtx}` : ''}`

  const userMsg = convHistory
    ? `Conversation so far:\n${convHistory}\n\nFollow-up question: ${q}`
    : q

  // Show streaming answer in panel
  const answersEl = document.getElementById(`ch-qa-answers-${cid}`)
  if (!answersEl) return
  const streamId = `ch-qa-stream-${uid()}`
  answersEl.insertAdjacentHTML('beforeend', `
    <div class="tp-qa-entry" id="${streamId}">
      <div class="tp-qa-q">Q: ${esc(q)}</div>
      <div class="tp-qa-a tp-qa-streaming" id="${streamId}-a">…</div>
    </div>`)
  answersEl.scrollTop = answersEl.scrollHeight

  let full = ''
  const aEl = document.getElementById(`${streamId}-a`)
  try {
    await claudeStream(sys, userMsg, 600, chunk => {
      full = chunk   // claudeStream passes cumulative text, not deltas
      if (aEl) aEl.textContent = full
    })
    if (aEl) { aEl.innerHTML = md2h(full); aEl.classList.remove('tp-qa-streaming') }
  } catch (err) {
    if (aEl) aEl.textContent = `[Error: ${err?.message || err}]`
    return
  }

  // Persist to qaHistory
  if (!c.qaHistory) c.qaHistory = []
  c.qaHistory.push({ q, a: full, ts: new Date().toISOString() })
  save()
}

export function clearChQa(cid) {
  const c = state.S.chapters?.find(ch => ch.id === cid)
  if (!c) return
  if (!confirm(t('清除所有问答记录？', 'Clear all Q&A history?'))) return
  delete c.qaHistory
  save()
  renderKnowledge()
}

// ── Notes ──────────────────────────────────────────────────────────────────────

export function editChNotes() {
  _notesEditing = true
  renderKnowledge()
}

export function cancelChNotes() {
  _notesEditing = false
  renderKnowledge()
}

export function saveChNotes(cid) {
  const c = state.S.chapters?.find(ch => ch.id === cid)
  if (!c) return
  const ta = document.getElementById(`ch-notes-ta-${cid}`)
  c.notes = ta?.value?.trim() || ''
  _notesEditing = false
  save()
  renderKnowledge()
}
