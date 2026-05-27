// ── BEHAVIORAL — STAR STORIES ─────────────────────────────────────────────────
import { state, save, uid, BH_COMPETENCIES } from '../state.js'
import { t } from '../i18n.js'
import { esc, showLoading } from '../util.js'
import { claudeJSON } from '../api.js'
import { getBh, bqHeader } from './shared.js'
import { micBtn } from '../speech.js'
import { exportStory, exportAllStories } from '../export.js'

// ── Source bullet ref state (ephemeral — tracks editor's linked bullet) ────────
let _selectedBulletRef = null   // { resumeId, bulletId } | null
let _pickerResumeId = null      // resume currently browsed in the picker panel

function _resolveBulletRef() {
  if (!_selectedBulletRef) return null
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === _selectedBulletRef.resumeId)
  const bullet = resume?.bullets.find(b => b.id === _selectedBulletRef.bulletId)
  return (resume && bullet) ? { resume, bullet } : null
}

function _renderPickerBullets(pickerResumeId, resume) {
  if (!resume?.bullets.length) {
    return '<div style="color:var(--muted);font-size:12px;padding:8px">'
      + t('此简历暂无经历要点', 'No bullets in this resume') + '</div>'
  }
  return resume.bullets.map(b =>
    '<div class="bullet-picker-item" onclick="selectBulletRef(\''
    + esc(pickerResumeId) + '\',\'' + b.id + '\')">'
    + '<div class="bullet-picker-role">' + esc(b.role) + '</div>'
    + '<div class="bullet-picker-text">▸ ' + esc(b.text) + '</div>'
    + '</div>'
  ).join('')
}

function _sourceExpInner() {
  const bh = getBh()
  const resolved = _resolveBulletRef()
  let inner = ''

  if (resolved) {
    inner += '<div class="source-exp-card">'
    inner += '<div class="source-exp-role">' + esc(resolved.resume.name) + ' · ' + esc(resolved.bullet.role) + '</div>'
    inner += '<div class="source-exp-text">▸ ' + esc(resolved.bullet.text) + '</div>'
    inner += '<div style="display:flex;gap:8px;margin-top:10px">'
    inner += '<button class="btn-sec btn-xs" onclick="openBulletPicker()">' + t('更换', 'Change') + '</button>'
    inner += '<button class="btn-sec btn-xs" onclick="unlinkBulletRef()">✕ ' + t('取消关联', 'Unlink') + '</button>'
    inner += '</div></div>'
  } else {
    inner += '<button class="btn-sec btn-xs" onclick="openBulletPicker()">🔗 '
      + t('关联经历要点', 'Link experience bullet') + '</button>'
  }

  // Picker panel — always in DOM (toggled show/hide with JS)
  const pickerResumeId = _pickerResumeId || bh.resumes[0]?.id
  const pickerResume = bh.resumes.find(r => r.id === pickerResumeId) || bh.resumes[0]
  inner += '<div id="bullet-picker" class="source-exp-picker" style="display:none">'
  if (bh.resumes.length > 1) {
    inner += '<div class="source-exp-picker-resumes">'
    bh.resumes.forEach(r => {
      inner += '<button class="picker-resume-btn' + (r.id === pickerResumeId ? ' active' : '')
        + '" data-rid="' + r.id + '" onclick="pickResume(\'' + r.id + '\')">'
        + esc(r.name) + '</button>'
    })
    inner += '</div>'
  }
  inner += '<div class="source-exp-picker-bullets" id="picker-bullets">'
  inner += _renderPickerBullets(pickerResumeId, pickerResume)
  inner += '</div>'
  inner += '<button class="btn-sec btn-xs" style="margin-top:8px" onclick="closeBulletPicker()">'
    + t('取消', 'Cancel') + '</button>'
  inner += '</div>'
  return inner
}

function _refreshSourceExp() {
  const el = document.getElementById('source-exp-section')
  if (el) el.innerHTML = _sourceExpInner()
}

export function openBulletPicker() {
  _pickerResumeId = _pickerResumeId || getBh().resumes[0]?.id
  _refreshSourceExp()
  const picker = document.getElementById('bullet-picker')
  if (picker) picker.style.display = 'block'
}

export function closeBulletPicker() {
  const picker = document.getElementById('bullet-picker')
  if (picker) picker.style.display = 'none'
}

export function pickResume(resumeId) {
  _pickerResumeId = resumeId
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  const bulletsEl = document.getElementById('picker-bullets')
  if (bulletsEl) bulletsEl.innerHTML = _renderPickerBullets(resumeId, resume)
  document.querySelectorAll('.picker-resume-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.rid === resumeId)
  })
}

export function selectBulletRef(resumeId, bulletId) {
  _selectedBulletRef = { resumeId, bulletId }
  _refreshSourceExp()
}

export function unlinkBulletRef() {
  _selectedBulletRef = null
  _refreshSourceExp()
}

// ── Story list ─────────────────────────────────────────────────────────────────

export function renderBhStories() {
  if (state.editingStoryId !== null) { renderStarEditor(); return }
  const bh = getBh()
  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${bqHeader()}
      <div class="bh-body">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div class="bh-section-label" style="margin:0">${t('您的 STAR 故事', 'Your STAR Stories')}</div>
          <div style="display:flex;gap:8px">
            ${bh.stories.length ? `<button class="btn-sec" onclick="exportAllStories()">📄 ${t('导出全部', 'Export All')}</button>` : ''}
            <button class="btn-primary" onclick="newStory()">＋ ${t('新建故事', 'New Story')}</button>
          </div>
        </div>
        ${bh.stories.length === 0 ? `
          <div class="empty-state" style="padding:48px 0">
            <div class="empty-icon">📖</div>
            <div class="empty-text">${t('暂无故事。<br>创建故事以练习行为面试回答。', 'No stories yet.<br>Create stories to practice your behavioral answers.')}</div>
          </div>` : bh.stories.map(s => `
          <div class="story-card">
            <div class="story-card-hd">
              <div class="story-title">${esc(s.title || t('未命名故事', 'Untitled Story'))}</div>
              <div class="story-actions">
                <button class="btn-sec" onclick="editStory('${s.id}')">${t('编辑', 'Edit')}</button>
                <button class="btn-icon" onclick="exportStory('${s.id}')" title="${t('导出 PDF', 'Export PDF')}">📄</button>
                <button class="btn-icon" onclick="deleteStory('${s.id}')" title="${t('删除', 'Delete')}">✕</button>
              </div>
            </div>
            ${s.competencies?.length ? `<div class="competency-tags">${s.competencies.map(c => `<span class="competency-tag">${esc(c)}</span>`).join('')}</div>` : ''}
            ${s.situation ? `<div class="story-preview">${esc((s.polished || s.situation).slice(0, 140))}…</div>` : ''}
          </div>`).join('')}
      </div>
    </div>`
}

export function newStory() { state.editingStoryId = 'new'; renderBhStories() }
export function editStory(id) { state.editingStoryId = id; renderBhStories() }
export function cancelEditStory() { state.editingStoryId = null; renderBhStories() }

export function deleteStory(id) {
  if (!confirm(t('删除此故事？', 'Delete this story?'))) return
  const bh = getBh()
  bh.stories = bh.stories.filter(s => s.id !== id)
  if (state.editingStoryId === id) state.editingStoryId = null
  save(); renderBhStories()
}

// ── STAR editor ────────────────────────────────────────────────────────────────

function renderStarEditor() {
  const bh = getBh()
  const story = state.editingStoryId === 'new'
    ? { title: '', draft: '', situation: '', task: '', action: '', result: '', competencies: [], polished: '' }
    : (bh.stories.find(s => s.id === state.editingStoryId) || {})

  // Initialise source-bullet state for this editing session
  _selectedBulletRef = story.linkedBulletRef || null
  _pickerResumeId = null

  const hasResumes = bh.resumes.length > 0

  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${bqHeader()}
      <div class="bh-body">
        <div class="star-editor">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
            <button class="btn-sec" onclick="cancelEditStory()">← ${t('返回', 'Back')}</button>
            <div class="bh-section-label" style="margin:0">${state.editingStoryId === 'new' ? t('新建 STAR 故事', 'New STAR Story') : t('编辑故事', 'Edit Story')}</div>
          </div>
          <input class="modal-input" id="se_title" placeholder="${t('故事标题（如：主导新认证系统迁移）', 'Story title (e.g. Led migration to new auth system)')}"
            value="${esc(story.title || '')}">

          ${hasResumes ? `
          <div class="source-exp-wrapper">
            <div class="star-label" style="margin-bottom:8px">🔗 ${t('关联经历（可选）', 'Source Experience (optional)')}
              <span class="star-hint">${t('关联简历要点，AI 提取和润色时将以此为依据', 'Link a resume bullet — AI will use it when extracting & polishing')}</span>
            </div>
            <div id="source-exp-section">${_sourceExpInner()}</div>
          </div>` : ''}

          <div class="star-draft-section">
            <div class="star-label">✏️ ${t('故事草稿', 'Story Draft')}
              <span class="star-hint">${t('用自然语言写下故事，然后一键提取 STAR 结构', 'Write your story naturally, then extract into STAR sections below')}</span>
            </div>
            <div class="speech-field">
              <textarea class="star-textarea" id="se_draft" rows="6"
                placeholder="${t('用段落自由描述您的故事经历，AI 将自动提取并填写下方各部分…', 'Describe your story in free-form paragraphs. AI will extract and fill the S/T/A/R sections below…')}">${esc(story.draft || '')}</textarea>
              ${micBtn('se_draft')}
            </div>
            <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
              <button class="btn-primary" id="star-extract-btn" onclick="extractStar()">⚡ ${t('STAR 提取', 'STAR Extractor')}</button>
              <span style="font-size:12px;color:var(--muted)">${t('自动填入下方各部分，仍可手动修改', 'Auto-fills the sections below — you can still edit them')}</span>
            </div>
          </div>

          <div class="star-divider"><span class="star-divider-label">S · T · A · R</span></div>

          <div class="star-section">
            <div class="star-label"><span class="star-letter">S</span>ituation
              <span class="star-hint">${t('背景与情境 · 2-3 句', 'Context & background · 2-3 sentences')}</span></div>
            <div class="speech-field">
              <textarea class="star-textarea" id="se_situation" rows="3"
                placeholder="${t('设定场景。当时的情况是什么？有什么风险？', 'Set the scene. What was the situation? What was at stake?')}">${esc(story.situation || '')}</textarea>
              ${micBtn('se_situation')}
            </div>
          </div>
          <div class="star-section">
            <div class="star-label"><span class="star-letter">T</span>ask
              <span class="star-hint">${t('您的具体职责 · 1-2 句', 'Your specific responsibility · 1-2 sentences')}</span></div>
            <div class="speech-field">
              <textarea class="star-textarea" id="se_task" rows="2"
                placeholder="${t('您具体承担什么职责？', 'What was YOUR specific role and responsibility?')}">${esc(story.task || '')}</textarea>
              ${micBtn('se_task')}
            </div>
          </div>
          <div class="star-section">
            <div class="star-label"><span class="star-letter">A</span>ction
              <span class="star-hint">${t('您亲自采取的行动 · 3-5 句，用"我"而非"我们"', 'What YOU did, step by step · 3-5 sentences, use "I" not "we"')}</span></div>
            <div class="speech-field">
              <textarea class="star-textarea" id="se_action" rows="5"
                placeholder="${t('您具体采取了哪些行动？请说明您的决策和依据。', 'What specific actions did YOU take? Be specific about your decisions and rationale.')}">${esc(story.action || '')}</textarea>
              ${micBtn('se_action')}
            </div>
          </div>
          <div class="star-section">
            <div class="star-label"><span class="star-letter">R</span>esult
              <span class="star-hint">${t('可量化的成果 + 所学收获 · 2-3 句', 'Measurable outcomes + what you learned · 2-3 sentences')}</span></div>
            <div class="speech-field">
              <textarea class="star-textarea" id="se_result" rows="3"
                placeholder="${t('最终结果如何？包含数据指标。您从中学到了什么？', 'What was the outcome? Include metrics. What did you learn?')}">${esc(story.result || '')}</textarea>
              ${micBtn('se_result')}
            </div>
          </div>
          <div class="star-section">
            <div class="star-label">${t('行为能力标签', 'Competencies')}</div>
            <div class="competency-picker">
              ${BH_COMPETENCIES.map(c => `
                <label class="comp-label">
                  <input type="checkbox" value="${esc(c)}"${story.competencies?.includes(c) ? ' checked' : ''}> ${esc(c)}
                </label>`).join('')}
            </div>
          </div>
          <div class="star-actions">
            <button class="btn-sec" onclick="polishStory()">✨ ${t('AI 润色', 'Polish with AI')}</button>
            <button class="btn-primary" onclick="saveStory()">${t('保存故事', 'Save Story')}</button>
          </div>
          ${story.polished ? `
            <div class="polished-box">
              <div class="bh-section-label">✨ ${t('AI 润色版本', 'AI-Polished Version')}</div>
              <div class="polished-content">${esc(story.polished)}</div>
            </div>` : ''}
        </div>
      </div>
    </div>`
}

function extractStoryForm() {
  return {
    title: document.getElementById('se_title')?.value?.trim() || '',
    draft: document.getElementById('se_draft')?.value?.trim() || '',
    situation: document.getElementById('se_situation')?.value?.trim() || '',
    task: document.getElementById('se_task')?.value?.trim() || '',
    action: document.getElementById('se_action')?.value?.trim() || '',
    result: document.getElementById('se_result')?.value?.trim() || '',
    competencies: [...document.querySelectorAll('.competency-picker input:checked')].map(el => el.value),
    linkedBulletRef: _selectedBulletRef,
  }
}

export function saveStory(navigate = true) {
  const bh = getBh()
  const form = extractStoryForm()
  if (!form.situation && !form.task && !form.action && !form.result) {
    alert(t('请至少填写一个 STAR 部分。', 'Please fill in at least one STAR section.')); return null
  }
  let savedId
  if (state.editingStoryId === 'new') {
    savedId = uid()
    bh.stories.unshift({ id: savedId, ...form, polished: '', createdAt: new Date().toISOString() })
    state.editingStoryId = savedId
  } else {
    savedId = state.editingStoryId
    const s = bh.stories.find(s => s.id === savedId)
    if (s) Object.assign(s, form)
  }
  save()
  if (navigate) { state.editingStoryId = null; renderBhStories() }
  return savedId
}

export async function extractStar() {
  const draft = document.getElementById('se_draft')?.value?.trim() || ''
  if (!draft) { alert(t('请先在草稿框中写下您的故事。', 'Please write your story draft first.')); return }

  const btn = document.getElementById('star-extract-btn')
  if (btn) { btn.innerHTML = '<span class="spin-icon">⟳</span> ' + t('提取中…', 'Extracting…'); btn.disabled = true }

  try {
    const resolved = _resolveBulletRef()
    const bulletCtx = resolved
      ? '\n\nSource experience bullet from resume (incorporate any specific tech, metrics, scope, or outcomes from this to enrich the extraction — do not invent facts not in the draft):\nRole: ' + resolved.bullet.role + '\nBullet: "' + resolved.bullet.text + '"'
      : ''

    const sys = 'You are an SDE II interview coach. Given a candidate\'s free-form story draft, extract the STAR structure. Return ONLY a JSON object with exactly these keys: situation (2-3 sentences: background and context, what was at stake), task (1-2 sentences: the candidate\'s specific responsibility), action (3-5 sentences: what the candidate personally did, step by step — use "I" not "we"), result (2-3 sentences: measurable outcomes and what was learned). Preserve the candidate\'s voice and specific details. Do not invent information not present in the draft.'
    const raw = await claudeJSON(sys, 'Story draft:\n' + draft + bulletCtx, 900, '{')
    const parsed = JSON.parse(raw)
    // Fill textareas directly — no re-render, preserves scroll position
    const fill = (id, val) => { if (val) { const el = document.getElementById(id); if (el) el.value = val } }
    fill('se_situation', parsed.situation)
    fill('se_task', parsed.task)
    fill('se_action', parsed.action)
    fill('se_result', parsed.result)
  } catch (err) {
    alert(t('提取失败：', 'Extraction failed: ') + (err?.message || String(err)))
  } finally {
    if (btn) { btn.innerHTML = '⚡ ' + t('STAR 提取', 'STAR Extractor'); btn.disabled = false }
  }
}

export async function polishStory() {
  const form = extractStoryForm()
  if (!form.situation || !form.action || !form.result) {
    alert(t('请先填写情境、行动和结果后再润色。', 'Please fill in Situation, Action, and Result before polishing.')); return
  }
  const storyId = saveStory(false)
  if (!storyId) return
  showLoading(t('正在润色故事…', 'Polishing story…'), t('Claude 正在将您的 STAR 故事优化为 SDE II 面试水准', 'Claude is enhancing your STAR story for SDE II interviews'))
  try {
    const resolved = _resolveBulletRef()
    const bulletCtx = resolved
      ? '\n\nSource experience bullet (use any specific metrics, tech stack, or scope from this as grounding — do not invent new facts):\nRole: ' + resolved.bullet.role + '\nBullet: "' + resolved.bullet.text + '"'
      : ''

    const sys = `You are a senior SDE II interview coach. Polish this STAR story to be crisp, impact-forward, and SDE II-appropriate. Rules: Always use "I" (not "we"). Lead each section with the most impactful statement. Remove filler. Keep measurable outcomes prominent. Make individual contribution unmistakably clear. Return ONLY a JSON object: {"situation":"...","task":"...","action":"...","result":"..."}`
    const userMsg = 'Situation: ' + form.situation + '\nTask: ' + form.task + '\nAction: ' + form.action + '\nResult: ' + form.result + bulletCtx
    const raw = await claudeJSON(sys, userMsg, 2000, '{')
    const parsed = JSON.parse(raw)
    const bh = getBh()
    const story = bh.stories.find(s => s.id === storyId)
    if (story) {
      story.polished = `Situation: ${parsed.situation}\n\nTask: ${parsed.task}\n\nAction: ${parsed.action}\n\nResult: ${parsed.result}`
      save()
    }
    state.editingStoryId = storyId; renderStarEditor()
  } catch (err) {
    state.editingStoryId = storyId; renderStarEditor()
    alert(t('润色失败：', 'Polish failed: ') + (err?.message || String(err)))
  }
}
