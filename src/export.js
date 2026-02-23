// ── PDF EXPORT ────────────────────────────────────────────────────────────────
// Uses window.print() + @media print CSS to hide the app shell and show a
// dedicated print frame. The OS "Save as PDF" dialog handles the rest.
import { state } from './state.js'
import { getBh } from './behavioral/shared.js'
import { t } from './i18n.js'
import { esc } from './util.js'

const CATEGORY_ORDER = ['Ambiguity', 'Leadership', 'Technical Depth', 'Conflict', 'Failure', 'Execution', 'Cross-functional', 'Mentorship']

// ── Core print helper ─────────────────────────────────────────────────────────

function _dateStr() {
  return new Date().toLocaleDateString(state.lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function _printDoc(subtitle, bodyHtml) {
  document.getElementById('print-frame')?.remove()
  const frame = document.createElement('div')
  frame.id = 'print-frame'
  frame.innerHTML =
    '<div class="print-doc">'
    + '<header class="print-header">'
    + '<div class="print-brand">L5 Interview Prep</div>'
    + '<div class="print-meta">' + esc(subtitle) + ' · ' + _dateStr() + '</div>'
    + '</header>'
    + bodyHtml
    + '</div>'
  document.body.appendChild(frame)
  window.addEventListener('afterprint', () => {
    document.getElementById('print-frame')?.remove()
  }, { once: true })
  window.print()
}

// ── Story helpers ─────────────────────────────────────────────────────────────

function _storyHtml(story) {
  let html = '<div class="print-story">'
  html += '<h2 class="print-story-title">' + esc(story.title || t('未命名故事', 'Untitled Story')) + '</h2>'

  if (story.competencies?.length) {
    html += '<div class="print-competencies">'
      + story.competencies.map(c => '<span class="print-comp-tag">' + esc(c) + '</span>').join('')
      + '</div>'
  }

  const sections = [
    { key: 'situation', label: 'Situation' },
    { key: 'task',      label: 'Task' },
    { key: 'action',    label: 'Action' },
    { key: 'result',    label: 'Result' },
  ]
  sections.forEach(({ key, label }) => {
    if (story[key]) {
      html += '<div class="print-star-section">'
        + '<div class="print-star-label">' + label + '</div>'
        + '<div class="print-star-text">' + esc(story[key]) + '</div>'
        + '</div>'
    }
  })

  if (story.polished) {
    html += '<div class="print-polished-box">'
      + '<div class="print-polished-label">✨ ' + t('AI 润色版本', 'AI-Polished Version') + '</div>'
      + '<div class="print-star-text">' + esc(story.polished) + '</div>'
      + '</div>'
  }
  html += '</div>'
  return html
}

// ── BQ helpers ────────────────────────────────────────────────────────────────

function _bqHtml(bq, story) {
  let html = '<div class="print-bq">'
  html += '<div class="print-bq-category">' + esc(bq.category) + '</div>'
  html += '<div class="print-bq-question">' + esc(bq.question) + '</div>'

  if (bq.tunedAnswer) {
    html += '<div class="print-star-section">'
      + '<div class="print-star-label">✨ ' + t('专项润色回答', 'Fine-tuned Answer') + '</div>'
      + '<div class="print-star-text">' + esc(bq.tunedAnswer) + '</div>'
      + '</div>'
  }

  if (story) {
    html += '<div class="print-source-story">'
      + '<div class="print-polished-label">📖 '
      + t('源故事', 'Source Story') + ': ' + esc(story.title || t('未命名', 'Untitled'))
      + '</div>'
    const sections = [
      { key: 'situation', label: 'Situation' },
      { key: 'task',      label: 'Task' },
      { key: 'action',    label: 'Action' },
      { key: 'result',    label: 'Result' },
    ]
    sections.forEach(({ key, label }) => {
      if (story[key]) {
        html += '<div class="print-source-row">'
          + '<span class="print-source-key">' + label + '</span>'
          + '<span class="print-star-text">' + esc(story[key]) + '</span>'
          + '</div>'
      }
    })
    html += '</div>'
  }

  html += '</div>'
  return html
}

// ── Public API ────────────────────────────────────────────────────────────────

export function exportStory(storyId) {
  const bh = getBh()
  const story = bh.stories.find(s => s.id === storyId)
  if (!story) return
  _printDoc(story.title || t('STAR 故事', 'STAR Story'), _storyHtml(story))
}

export function exportAllStories() {
  const bh = getBh()
  if (!bh.stories.length) {
    alert(t('暂无故事可导出。', 'No stories to export.')); return
  }
  const bodyHtml = bh.stories.map((s, i) =>
    (i > 0 ? '<div class="print-page-break"></div>' : '') + _storyHtml(s)
  ).join('')
  _printDoc(t('全部 STAR 故事', 'All STAR Stories'), bodyHtml)
}

export function exportBqAnswer(bqId) {
  const bh = getBh()
  const bq = bh.bqStore.find(b => b.id === bqId)
  if (!bq) return
  const story = bq.linkedStoryId ? bh.stories.find(s => s.id === bq.linkedStoryId) : null
  _printDoc(bq.category + ' — BQ', _bqHtml(bq, story))
}

export function exportAllBqAnswers() {
  const bh = getBh()
  const answered = bh.bqStore.filter(b => b.tunedAnswer)
  if (!answered.length) {
    alert(t('暂无已润色的 BQ 回答可导出。', 'No fine-tuned BQ answers to export yet.')); return
  }
  const groups = {}
  CATEGORY_ORDER.forEach(c => { groups[c] = [] })
  answered.forEach(bq => {
    if (!groups[bq.category]) groups[bq.category] = []
    groups[bq.category].push(bq)
  })

  let bodyHtml = ''
  let first = true
  CATEGORY_ORDER.forEach(cat => {
    ;(groups[cat] || []).forEach(bq => {
      const story = bq.linkedStoryId ? bh.stories.find(s => s.id === bq.linkedStoryId) : null
      if (!first) bodyHtml += '<div class="print-page-break"></div>'
      bodyHtml += _bqHtml(bq, story)
      first = false
    })
  })
  _printDoc(t('全部 BQ 回答', 'All BQ Answers') + ' (' + answered.length + ')', bodyHtml)
}
