// ── BEHAVIORAL — BQ STORE ─────────────────────────────────────────────────────
import { state, save, uid } from '../state.js'
import { t } from '../i18n.js'
import { esc, modal, closeModal } from '../util.js'
import { claudeStream } from '../api.js'
import { getBh, bqHeader } from './shared.js'
import { exportBqAnswer, exportAllBqAnswers } from '../export.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function _formatStory(story) {
  const parts = []
  if (story.situation) parts.push('Situation: ' + story.situation)
  if (story.task)      parts.push('Task: ' + story.task)
  if (story.action)    parts.push('Action: ' + story.action)
  if (story.result)    parts.push('Result: ' + story.result)
  return parts.join('\n\n')
}

const CATEGORY_ORDER = ['Ambiguity', 'Leadership', 'Technical Depth', 'Conflict', 'Failure', 'Execution', 'Cross-functional', 'Mentorship']

// ── BQ row HTML (extracted to avoid deep nesting) ─────────────────────────────

function _bqRowHtml(bq, linkedStory) {
  const hasTuned = !!bq.tunedAnswer
  const deleteBtn = bq.isBuiltIn ? '' :
    '<button class="btn-icon" onclick="event.stopPropagation();deleteBq(\'' + bq.id + '\')" title="' + t('删除', 'Delete') + '">✕</button>'

  let meta
  if (linkedStory) {
    const tunedBadge = hasTuned
      ? '<span class="bq-tuned-badge">✨ ' + t('已润色', 'Tuned') + '</span>'
      : ''
    meta = '<span class="bq-linked-indicator">📖 ' + esc(linkedStory.title || t('未命名故事', 'Untitled')) + '</span>'
      + tunedBadge
      + '<button class="btn-sec btn-xs" onclick="event.stopPropagation();openBqDetail(\'' + bq.id + '\')">' + t('查看 ▸', 'View ▸') + '</button>'
      + deleteBtn
  } else {
    meta = '<span class="bq-no-link">' + t('未关联故事', 'No story linked') + '</span>'
      + '<button class="btn-sec btn-xs" onclick="event.stopPropagation();openBqDetail(\'' + bq.id + '\')">' + t('关联 ▸', 'Link ▸') + '</button>'
      + deleteBtn
  }

  return '<div class="bq-row" onclick="openBqDetail(\'' + bq.id + '\')">'
    + '<div class="bq-row-q">' + esc(bq.question) + '</div>'
    + '<div class="bq-row-meta">' + meta + '</div>'
    + '</div>'
}

// ── Linked story section HTML ─────────────────────────────────────────────────

function _linkedStoryHtml(bq, bh) {
  const linkedStory = bq.linkedStoryId ? bh.stories.find(s => s.id === bq.linkedStoryId) : null
  if (linkedStory) {
    const preview = linkedStory.situation
      ? '<div class="bq-linked-preview">' + esc((linkedStory.polished || linkedStory.situation).slice(0, 120)) + '…</div>'
      : ''
    return '<div class="bq-linked-box">'
      + '<div class="bq-linked-story-title">📖 ' + esc(linkedStory.title || t('未命名故事', 'Untitled')) + '</div>'
      + preview
      + '<div style="display:flex;gap:8px;margin-top:10px">'
      + '<button class="btn-sec" onclick="unlinkStory(\'' + bq.id + '\')">✕ ' + t('取消关联', 'Unlink') + '</button>'
      + '<button class="btn-sec" onclick="showStoryPicker(\'' + bq.id + '\')">' + t('⇄ 更换故事', 'Change Story') + '</button>'
      + '</div></div>'
  }

  const hasStories = bh.stories.length > 0
  let pickerContent
  if (!hasStories) {
    pickerContent = '<div class="bq-hint">'
      + t('请先在「故事库」中创建 STAR 故事，再进行关联。', 'Create a STAR story in the Story Store first, then link it here.')
      + '<button class="btn-sec" style="margin-left:10px" onclick="setBqTab(\'storystore\')">'
      + t('前往故事库 →', 'Go to Story Store →')
      + '</button></div>'
  } else {
    const opts = bh.stories.map(s =>
      '<option value="' + s.id + '">' + esc(s.title || t('未命名故事', 'Untitled')) + '</option>'
    ).join('')
    pickerContent = '<select class="modal-input" id="bq-story-select-' + bq.id + '" style="max-width:380px">'
      + '<option value="">' + t('选择故事…', 'Select a story…') + '</option>'
      + opts
      + '</select>'
      + '<button class="btn-primary" style="margin-left:8px"'
      + ' onclick="linkStory(\'' + bq.id + '\', document.getElementById(\'bq-story-select-' + bq.id + '\').value)">'
      + t('关联', 'Link')
      + '</button>'
  }
  return '<div class="bq-story-picker-box" id="story-picker-box-' + bq.id + '">' + pickerContent + '</div>'
}

// ── Fine-tune section HTML ────────────────────────────────────────────────────

function _tuneSectionHtml(bq, linkedStory) {
  let content
  if (!linkedStory) {
    content = '<div class="bq-hint">'
      + t('请先关联一个 STAR 故事，再生成专项润色回答。', 'Link a STAR story above to generate a fine-tuned answer.')
      + '</div>'
  } else if (bq.tunedAnswer) {
    content = '<div class="ans-result-box ans-polished" style="margin-top:8px">'
      + '<div class="ans-result-hd">'
      + '<div class="ans-result-label">✨ ' + t('专项润色答案', 'Fine-tuned Answer') + '</div>'
      + '<button class="ans-result-btn" id="tune-btn-' + bq.id + '" onclick="tuneBqAnswer(\'' + bq.id + '\')">↺ ' + t('重新润色', 'Regenerate') + '</button>'
      + '</div>'
      + '<div class="ans-result-text" id="tuned-text-' + bq.id + '">' + esc(bq.tunedAnswer) + '</div>'
      + '</div>'
  } else {
    content = '<button class="btn-primary" style="margin-top:8px" id="tune-btn-' + bq.id + '"'
      + ' onclick="tuneBqAnswer(\'' + bq.id + '\')">'
      + '✨ ' + t('为此题润色回答', 'Fine-tune for this BQ')
      + '</button>'
      + '<p style="margin-top:8px;font-size:12px;color:var(--muted)">'
      + t('Claude 将根据您的 STAR 故事，生成专门针对此问题的回答。', 'Claude will craft an answer tailored to this specific question using your STAR story.')
      + '</p>'
  }
  return '<div id="tune-section-' + bq.id + '">' + content + '</div>'
}

// ── Page router ───────────────────────────────────────────────────────────────

export function renderBqPrep() {
  if (state.bqDetailId) { renderBqDetail(); return }
  if (state.bqTab === 'storystore') { window.renderBhStories(); return }
  renderBqStore()
}

// ── BQ Store: list view ───────────────────────────────────────────────────────

function renderBqStore() {
  const bh = getBh()
  const bqs = bh.bqStore

  const groups = {}
  CATEGORY_ORDER.forEach(cat => { groups[cat] = [] })
  bqs.forEach(bq => {
    if (!groups[bq.category]) groups[bq.category] = []
    groups[bq.category].push(bq)
  })

  let groupHtml = ''
  Object.entries(groups).forEach(([cat, items]) => {
    if (!items.length) return
    let rowsHtml = ''
    items.forEach(bq => {
      const story = bq.linkedStoryId ? bh.stories.find(s => s.id === bq.linkedStoryId) : null
      rowsHtml += _bqRowHtml(bq, story)
    })
    groupHtml += '<div class="bq-category-section">'
      + '<div class="bq-category-hd">'
      + '<span class="bq-cat-label">' + esc(cat) + '</span>'
      + '<span class="bq-cat-count">' + items.length + '</span>'
      + '</div>'
      + rowsHtml
      + '</div>'
  })

  const emptyHtml = '<div class="empty-state" style="padding:48px 0">'
    + '<div class="empty-icon">📋</div>'
    + '<div class="empty-text">' + t('暂无题目。', 'No questions yet.') + '</div>'
    + '</div>'

  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${bqHeader()}
      <div class="bh-body">
        <div class="bh-page-hd">
          <div class="bh-section-label" style="margin:0">${t('BQ 题库', 'BQ Store')} <span style="font-weight:400;font-size:11px;color:var(--muted)">(${bqs.length})</span></div>
          <div style="display:flex;gap:8px">
            ${bqs.some(b => b.tunedAnswer) ? `<button class="btn-sec" onclick="exportAllBqAnswers()">📄 ${t('导出回答', 'Export Answers')}</button>` : ''}
            <button class="btn-primary" onclick="addBq()">＋ ${t('添加题目', 'Add BQ')}</button>
          </div>
        </div>
        ${bqs.length === 0 ? emptyHtml : groupHtml}
      </div>
    </div>`
}

// ── BQ Detail view ────────────────────────────────────────────────────────────

function renderBqDetail() {
  const bh = getBh()
  const bq = bh.bqStore.find(b => b.id === state.bqDetailId)
  if (!bq) { state.bqDetailId = null; renderBqStore(); return }
  const linkedStory = bq.linkedStoryId ? bh.stories.find(s => s.id === bq.linkedStoryId) : null

  const linkedStoryHtml = _linkedStoryHtml(bq, bh)
  const tuneSectionHtml = _tuneSectionHtml(bq, linkedStory)

  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${bqHeader()}
      <div class="bh-body">
        <div class="bh-page-hd">
          <button class="btn-sec" onclick="closeBqDetail()">← ${t('BQ 列表', 'BQ List')}</button>
          ${bq.tunedAnswer ? `<button class="btn-sec" onclick="exportBqAnswer('${bq.id}')">📄 ${t('导出 PDF', 'Export PDF')}</button>` : ''}
        </div>
        <div class="bq-detail-card">
          <div class="bq-category-badge">${esc(bq.category)}</div>
          <div class="bq-detail-q">${esc(bq.question)}</div>
        </div>
        <div class="bh-section-label" style="margin-top:20px">📖 ${t('关联故事', 'Linked Story')}</div>
        ${linkedStoryHtml}
        <div class="bh-section-label" style="margin-top:24px">✨ ${t('专项润色回答', 'Fine-tuned Answer')}</div>
        ${tuneSectionHtml}
      </div>
    </div>`
}

// ── Navigation ────────────────────────────────────────────────────────────────

export function openBqDetail(id) { state.bqDetailId = id; renderBqPrep() }
export function closeBqDetail() { state.bqDetailId = null; renderBqPrep() }

// ── Add / Delete BQ ───────────────────────────────────────────────────────────

export function addBq() {
  const categoryOptions = CATEGORY_ORDER.map(c =>
    '<option value="' + esc(c) + '">' + esc(c) + '</option>'
  ).join('')

  modal('', [], () => {}, `
    <div class="modal-title">➕ ${t('添加自定义 BQ', 'Add Custom BQ')}</div>
    <div style="margin-bottom:8px">
      <label style="font-size:12px;color:var(--muted2);display:block;margin-bottom:4px">${t('分类', 'Category')}</label>
      <select class="modal-input" id="bq_cat" style="width:100%">${categoryOptions}</select>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;color:var(--muted2);display:block;margin-bottom:4px">${t('题目', 'Question')}</label>
      <textarea class="bh-resume-input" id="bq_q" rows="3"
        placeholder="${t('输入行为面试问题…', 'Enter the behavioral question…')}"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-sec" onclick="closeModal()">${t('取消', 'Cancel')}</button>
      <button class="btn-primary" onclick="saveBq()">${t('保存', 'Save')}</button>
    </div>
  `)
  setTimeout(() => document.getElementById('bq_q')?.focus(), 50)
}

export function saveBq() {
  const question = document.getElementById('bq_q')?.value?.trim() || ''
  const category = document.getElementById('bq_cat')?.value || CATEGORY_ORDER[0]
  if (!question) { alert(t('请输入题目内容。', 'Please enter a question.')); return }
  const bh = getBh()
  bh.bqStore.push({ id: uid(), question, category, isBuiltIn: false, linkedStoryId: null, tunedAnswer: null })
  save()
  closeModal()
  renderBqStore()
}

export function deleteBq(id) {
  if (!confirm(t('删除此题目？', 'Delete this question?'))) return
  const bh = getBh()
  bh.bqStore = bh.bqStore.filter(b => b.id !== id)
  if (state.bqDetailId === id) state.bqDetailId = null
  save(); renderBqPrep()
}

// ── Story linking ─────────────────────────────────────────────────────────────

export function linkStory(bqId, storyId) {
  if (!storyId) { alert(t('请先选择一个故事。', 'Please select a story.')); return }
  const bh = getBh()
  const bq = bh.bqStore.find(b => b.id === bqId)
  if (!bq) return
  bq.linkedStoryId = storyId
  bq.tunedAnswer = null
  save()
  if (state.bqDetailId === bqId) renderBqDetail()
}

export function unlinkStory(bqId) {
  const bh = getBh()
  const bq = bh.bqStore.find(b => b.id === bqId)
  if (!bq) return
  bq.linkedStoryId = null
  bq.tunedAnswer = null
  save()
  if (state.bqDetailId === bqId) renderBqDetail()
}

export function showStoryPicker(bqId) {
  const bh = getBh()
  const bq = bh.bqStore.find(b => b.id === bqId)
  if (!bq) return
  bq.linkedStoryId = null
  bq.tunedAnswer = null
  renderBqDetail()
}

// ── Fine-tune with Claude ─────────────────────────────────────────────────────

export async function tuneBqAnswer(bqId) {
  const bh = getBh()
  const bq = bh.bqStore.find(b => b.id === bqId)
  if (!bq) return
  const story = bq.linkedStoryId ? bh.stories.find(s => s.id === bq.linkedStoryId) : null
  if (!story) { alert(t('请先关联故事。', 'Please link a story first.')); return }

  // Replace the tune section with a streaming placeholder immediately
  const tuneSection = document.getElementById('tune-section-' + bqId)
  if (tuneSection) {
    tuneSection.innerHTML =
      '<div class="ans-result-box ans-polished" style="margin-top:8px">'
      + '<div class="ans-result-hd">'
      + '<div class="ans-result-label">✨ ' + t('专项润色答案', 'Fine-tuned Answer') + '</div>'
      + '</div>'
      + '<div class="ans-result-text stream-active" id="tuned-text-' + bqId + '"></div>'
      + '</div>'
  }

  try {
    const storyText = story.polished || _formatStory(story)
    const sys = 'You are a senior SDE II interview coach. Given a candidate\'s STAR story and a specific behavioral question, craft a concise, polished answer (under 250 words) that directly addresses the question. Use the STAR structure but prioritize the most relevant parts. Always use "I" not "we". Be specific and include metrics if mentioned. Start with a strong opening sentence. Return ONLY the answer text, no preamble.'
    const userMsg = 'Behavioral Question: ' + bq.question + '\n\nCandidate\'s STAR Story:\n' + storyText
    bq.tunedAnswer = await claudeStream(sys, userMsg, 700, (accumulated) => {
      const el = document.getElementById('tuned-text-' + bqId)
      if (el) el.textContent = accumulated
    })
    save()
  } catch (err) {
    // On error re-render restores the fine-tune button
    if (state.bqDetailId === bqId) renderBqDetail()
    alert(t('润色失败：', 'Fine-tune failed: ') + (err?.message || String(err)))
    return
  }

  if (state.bqDetailId === bqId) renderBqDetail()
}
