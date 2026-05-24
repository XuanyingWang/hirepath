// ── LEETCODE PATTERNS ─────────────────────────────────────────────────────────
import { state, save, uid } from './state.js'
import { t } from './i18n.js'
import { esc, md2h, showErr } from './util.js'
import { claudeStream } from './api.js'

// ── Module state ──────────────────────────────────────────────────────────────
let _currentId = null  // null = list view, string = pattern id
let _streaming = false
let _patRefineOpen = false
let _patRefining = false

function _patterns() {
  if (!state.S.patterns) state.S.patterns = []
  return state.S.patterns
}

// Post-process md2h output to activate markdown links [text](url)
function _renderMd(md) {
  let html = md2h(md)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="pattern-lc-link">$1</a>')
  return html
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderPatterns() {
  const main = document.getElementById('mainContent')
  if (!main) return
  if (_currentId) _renderDetail(main)
  else _renderList(main)
}

function _renderList(main) {
  const pts = _patterns()
  main.innerHTML = `
    <div class="ood-wrap">
      <div class="ood-list-hd" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <h2 style="font-size:19px;font-weight:700;margin:0 0 4px">🧩 ${t('LeetCode 模式', 'LeetCode Patterns')}</h2>
          <p style="font-size:13px;color:var(--muted);margin:0">${t('创建算法模式，AI 生成解题模板和相关题目', 'Create algorithm patterns with AI-generated templates and related problems')}</p>
        </div>
        <button class="btn-primary" onclick="patternNew()">＋ ${t('新建模式', 'New Pattern')}</button>
      </div>
      ${pts.length === 0 ? `
        <div class="empty-state" style="padding:64px 20px">
          <div style="font-size:44px;margin-bottom:14px">🧩</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:8px">${t('还没有模式', 'No patterns yet')}</div>
          <div style="font-size:13px;color:var(--muted);max-width:400px;line-height:1.65;margin-bottom:20px">${t(
            '创建如「拓扑排序」「滑动窗口」「回溯算法」「DAG」等模式，AI 将生成详细的学习指南和相关题目',
            'Add patterns like Topological Sort, Sliding Window, Backtracking, or DAG — AI generates a full guide with related LeetCode problems'
          )}</div>
          <button class="btn-primary" onclick="patternNew()">＋ ${t('新建模式', 'New Pattern')}</button>
        </div>
      ` : `
        <div class="pattern-grid">
          ${pts.map(p => `
            <div class="pattern-card" onclick="patternOpen('${p.id}')">
              <div class="pattern-card-hd">
                <span class="pattern-card-name">${esc(p.name || t('未命名模式', 'Unnamed Pattern'))}</span>
                ${p.generatedAt ? `<span class="pattern-card-badge">✓ AI</span>` : ''}
              </div>
              ${p.userDesc ? `<p class="pattern-card-desc">${esc(p.userDesc)}</p>` : ''}
              <div class="pattern-card-footer">
                <span class="pattern-card-date">${new Date(p.createdAt).toLocaleDateString()}</span>
                <button class="btn-sec btn-sm" onclick="event.stopPropagation();patternDelete('${p.id}')">${t('删除', 'Delete')}</button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `
}

function _renderDetail(main) {
  const p = _patterns().find(x => x.id === _currentId)
  if (!p) { _currentId = null; renderPatterns(); return }

  main.innerHTML = `
    <div class="ood-wrap">
      <div class="ood-q-hd">
        <button class="btn-sec btn-sm ood-back-btn" onclick="patternBackToList()">← ${t('返回', 'Back')}</button>
        <div style="flex:1"></div>
        <button class="btn-sec btn-sm" style="color:var(--red)" onclick="patternDelete('${p.id}')">${t('删除', 'Delete')}</button>
      </div>

      <div class="pattern-detail-form">
        <div class="pattern-field">
          <label class="pattern-label">${t('模式名称', 'Pattern Name')}</label>
          <input class="modal-input" id="pat-name"
            value="${esc(p.name)}"
            placeholder="${t('例如：拓扑排序 / 滑动窗口 / DAG / 单调栈', 'e.g. Topological Sort / Sliding Window / DAG / Monotonic Stack')}"
            oninput="patternSaveMeta()">
        </div>
        <div class="pattern-field">
          <label class="pattern-label">${t('描述 / 笔记（可选）', 'Description / Notes (optional)')}</label>
          <textarea class="modal-input" id="pat-desc" rows="3"
            placeholder="${t('描述核心思路、想重点了解的变体、常见误区等…', 'Describe the core idea, variations to focus on, common pitfalls, etc…')}"
            oninput="patternSaveMeta()">${esc(p.userDesc || '')}</textarea>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn-primary" id="pat-gen-btn" onclick="patternGenerate()" ${_streaming || _patRefining ? 'disabled' : ''}>
            ${_streaming
              ? `⏳ ${t('生成中…', 'Generating…')}`
              : p.generatedAt
                ? `🔄 ${t('重新生成', 'Regenerate')}`
                : `✨ ${t('生成学习指南', 'Generate Learning Guide')}`
            }
          </button>
          ${p.generated ? `<button class="btn-refine${_patRefineOpen ? ' active' : ''}" onclick="togglePatternRefine()" ${_streaming || _patRefining ? 'disabled' : ''}>✏️ ${t('精调', 'Refine')}</button>` : ''}
        </div>
        ${_patRefineOpen && p.generated ? `
          <div class="refine-panel" id="pat-refine-panel" style="margin-top:12px">
            <div class="refine-panel-hd">✏️ ${t('精调内容', 'Refine Content')}</div>
            <div class="refine-panel-hint">${t('描述你希望如何修改或补充现有内容，AI 将保留原有结构进行更新。', 'Describe how you want to update the existing guide. AI will revise it while preserving the structure.')}</div>
            <textarea class="refine-textarea" id="pat-refine-input" rows="3"
              placeholder="${t('例如：增加 Java 实现；补充更难的题目；详细解释何时使用双端队列…', 'e.g. Add Java implementation; add harder problems; explain when to use deque in detail…')}"
              oninput="this.style.height=\'auto\';this.style.height=this.scrollHeight+\'px\'"></textarea>
            <div class="refine-actions">
              <button class="btn-primary btn-sm" onclick="patternRefine('${p.id}')" ${_patRefining ? 'disabled' : ''}>
                ${_patRefining ? `⏳ ${t('更新中…', 'Updating…')}` : `✨ ${t('应用修改', 'Apply Changes')}`}
              </button>
              <button class="btn-ghost btn-sm" onclick="togglePatternRefine()">${t('取消', 'Cancel')}</button>
            </div>
          </div>` : ''}
      </div>

      <div id="pat-output" class="pattern-output rb">
        ${p.generated ? _renderMd(p.generated) : `
          <div class="pattern-output-placeholder">
            <div style="font-size:40px;margin-bottom:12px">✨</div>
            <p style="font-size:15px;font-weight:600;color:var(--text2);margin-bottom:8px">${t('点击「生成学习指南」', 'Click "Generate Learning Guide"')}</p>
            <p style="font-size:13px;color:var(--muted);max-width:400px;line-height:1.65">${t(
              'AI 将为你生成：模式概述 · 何时使用 · Python 实现模板 · 关键变体 · 相关 LeetCode 题目（含链接）· 常见错误与面试技巧',
              'AI will generate: overview · when to use · Python template · key variations · related LeetCode problems with links · common mistakes & interview tips'
            )}</p>
          </div>
        `}
      </div>
    </div>
  `
}

// ── Actions ───────────────────────────────────────────────────────────────────

export function patternOpen(id) {
  _currentId = id
  _patRefineOpen = false
  renderPatterns()
}

export function patternBackToList() {
  _currentId = null
  renderPatterns()
}

export function patternNew() {
  const id = uid()
  _patterns().push({
    id,
    name: '',
    userDesc: '',
    generated: '',
    generatedAt: null,
    createdAt: new Date().toISOString(),
  })
  save()
  _currentId = id
  renderPatterns()
  setTimeout(() => document.getElementById('pat-name')?.focus(), 80)
}

export function patternSaveMeta() {
  const p = _patterns().find(x => x.id === _currentId)
  if (!p) return
  p.name = document.getElementById('pat-name')?.value?.trim() || ''
  p.userDesc = document.getElementById('pat-desc')?.value || ''
  save()
}

export function patternDelete(id) {
  if (!confirm(t('确定删除此模式？', 'Delete this pattern?'))) return
  const idx = _patterns().findIndex(x => x.id === id)
  if (idx >= 0) { _patterns().splice(idx, 1); save() }
  if (_currentId === id) _currentId = null
  renderPatterns()
}

export async function patternGenerate() {
  if (_streaming) return
  patternSaveMeta()
  const p = _patterns().find(x => x.id === _currentId)
  if (!p) return
  if (!p.name.trim()) {
    alert(t('请先输入模式名称', 'Please enter a pattern name first'))
    return
  }

  _streaming = true
  const btn = document.getElementById('pat-gen-btn')
  if (btn) { btn.disabled = true; btn.textContent = `⏳ ${t('生成中…', 'Generating…')}` }

  const out = document.getElementById('pat-output')
  if (out) out.innerHTML = `<div class="pat-streaming"><div class="spinner" style="margin:0 auto 14px"></div>${t('AI 正在生成学习指南…', 'AI is generating your learning guide…')}</div>`

  const system = `你是一位专注于大厂（Google/Meta/Amazon 等）面试备考的算法竞赛教练。请用**中文**撰写学习指南，内容精准、实用、面向面试。LeetCode 题目标题保留英文原名，链接使用真实的小写连字符 slug（如 course-schedule、sliding-window-maximum）。`

  const userMsg = `请为「**${p.name}**」算法模式生成一份完整的中文学习指南。${p.userDesc ? `\n\n用户备注/重点关注：${p.userDesc}` : ''}

请按以下结构输出，所有说明文字均用中文：

## 模式概述
2-3 句话：解释这个模式是什么，以及它的核心思路（让人一下子"顿悟"的点）。

## 何时使用
列出 5-6 个题目中出现的具体信号，说明这些关键词、约束或数据结构特征意味着应该使用此模式。

## Python 实现模板
提供一个清晰、有中文注释的 Python 骨架代码，体现该模式的核心结构。

\`\`\`python
# 在此写模板
\`\`\`

## 关键变体
3-4 个重要变体或扩展，简要说明每种变体的特点和适用场景。

## 相关 LeetCode 题目
列出恰好 10 道题，难度从简单到困难。每道题格式如下：
**[题目英文原名](https://leetcode.com/problems/exact-slug/)** · Easy/Medium/Hard · 一句话说明该题为何体现此模式（中文）

请使用真实准确的 slug（如 "course-schedule"、"number-of-islands"、"sliding-window-maximum"）。

## 常见错误与面试技巧
2-3 个常见实现误区，以及 1-2 条在面试中清晰表达此模式的技巧。`

  try {
    let finalText = ''
    finalText = await claudeStream(system, userMsg, 3500, (text) => {
      if (out) out.innerHTML = `<div class="rb">${_renderMd(text)}</div>`
      finalText = text
    })
    const p2 = _patterns().find(x => x.id === _currentId)
    if (p2) {
      p2.generated = finalText
      p2.generatedAt = new Date().toISOString()
      save()
    }
  } catch (err) {
    showErr(err?.message || String(err))
  }

  _streaming = false
  renderPatterns()
}

export function togglePatternRefine() {
  _patRefineOpen = !_patRefineOpen
  renderPatterns()
  if (_patRefineOpen) setTimeout(() => document.getElementById('pat-refine-input')?.focus(), 80)
}

export async function patternRefine(id) {
  if (_patRefining || _streaming) return
  const p = _patterns().find(x => x.id === id)
  if (!p?.generated) return
  const ta = document.getElementById('pat-refine-input')
  const comment = ta?.value?.trim()
  if (!comment) { ta?.focus(); return }

  _patRefining = true
  renderPatterns()

  const out = document.getElementById('pat-output')
  if (out) out.innerHTML = `<div class="pat-streaming"><div class="spinner" style="margin:0 auto 14px"></div>${t('AI 正在更新学习指南…', 'AI is updating your learning guide…')}</div>`

  const system = `你是一位算法面试教练。用户有一份现有的算法模式学习指南，并提出了修改意见。请根据用户的指令更新内容，保留原有的 Markdown 结构和格式。只输出更新后的完整 Markdown 内容，不要有任何前言或解释。`
  const userMsg = `现有内容：\n${p.generated}\n\n用户修改指令：\n${comment}`

  let finalText = ''
  try {
    await claudeStream(system, userMsg, 3500, (text) => {
      finalText = text
      if (out) out.innerHTML = `<div class="rb">${_renderMd(text)}</div>`
    })
    const p2 = _patterns().find(x => x.id === id)
    if (p2 && finalText) {
      p2.generated = finalText
      p2.generatedAt = new Date().toISOString()
      save()
    }
  } catch (err) {
    showErr(err?.message || String(err))
  }

  _patRefining = false
  _patRefineOpen = false
  renderPatterns()
}
