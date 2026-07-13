// ── BEHAVIORAL — RESUME ANALYZER ─────────────────────────────────────────────
import { state, save, uid } from '../state.js'
import { t } from '../i18n.js'
import { esc, showLoading } from '../util.js'
import { claudeJSON, claudeStream } from '../api.js'
import { getBh, resumeHeader } from './shared.js'
import { micBtn } from '../speech.js'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'

// ── Upload state ──────────────────────────────────────────────────────────────
let _uploadedContent = null
let _uploadedFileName = null

function _showFileChip(name) {
  const chip = document.getElementById('resumeFileChip')
  if (!chip) return
  chip.style.display = 'flex'
  chip.innerHTML = `<span class="file-chip-icon">📎</span><span class="file-chip-name">${esc(name)}</span><button class="file-chip-rm" onclick="clearResumeFile()" title="${t('移除文件', 'Remove file')}">✕</button>`
}

function _hideFileChip() {
  const chip = document.getElementById('resumeFileChip')
  if (chip) { chip.style.display = 'none'; chip.innerHTML = '' }
}

export function clearResumeFile() {
  _uploadedContent = null
  _uploadedFileName = null
  _hideFileChip()
}

// ── Drag-drop listener lifecycle ──────────────────────────────────────────────
let _resumeDropUnlisten = null

// ── Panel collapsed states (survive re-renders, ephemeral per session) ────────
const _tpQaCollapsed = new Set() // keys: `${bulletId}_${part}`
const _siQaCollapsed = new Set() // keys: `${resumeId}_${part}`
const _hmCollapsed   = new Set() // keys: bulletId
const _skCollapsed   = new Set() // keys: bulletId
const _skTab         = {}        // bulletId → 'quick' | 'deep'

// ── Build Resume view state (ephemeral) ──────────────────────────────────────
let _buildSelectedTemplateId = null   // selected template chip
let _buildShowAddTemplate    = false  // add-template form visible
let _buildExpandedVersionId  = null   // expanded saved version

async function _initResumeDrop() {
  if (_resumeDropUnlisten) { _resumeDropUnlisten(); _resumeDropUnlisten = null }
  try {
    _resumeDropUnlisten = await getCurrentWindow().listen('tauri://drag-drop', async (event) => {
      if (!state.bhAddingResume) return
      const payload = event.payload
      const paths = Array.isArray(payload) ? payload : (payload?.paths || [])
      if (!paths.length) return
      await _handleDroppedPath(paths[0])
    })
  } catch (_) { /* not in Tauri context */ }
}

function _cleanupResumeDrop() {
  if (_resumeDropUnlisten) { _resumeDropUnlisten(); _resumeDropUnlisten = null }
}

async function _handleDroppedPath(path) {
  const ext = path.split('.').pop().toLowerCase()
  const dropZone = document.getElementById('resumeDropZone')
  if (dropZone) dropZone.classList.remove('dz-active')
  const fileName = path.split(/[/\\]/).pop()
  const ni = document.getElementById('rn_name')
  if (ni && !ni.value) ni.value = fileName.replace(/\.[^.]+$/, '')

  if (['txt', 'md'].includes(ext)) {
    try {
      const text = await invoke('read_text_file', { path })
      _uploadedContent = text
      _uploadedFileName = fileName
      _showFileChip(fileName)
    } catch (e) {
      alert(t('读取文件失败：', 'Failed to read file: ') + e)
    }
  } else if (ext === 'pdf') {
    if (dropZone) dropZone.classList.add('dz-loading')
    try {
      const text = await invoke('read_pdf_file', { path })
      _uploadedContent = text
      _uploadedFileName = fileName
      _showFileChip(fileName)
    } catch (e) {
      alert(t('PDF 读取失败：', 'PDF read failed: ') + e)
    } finally {
      if (dropZone) dropZone.classList.remove('dz-loading')
    }
  } else {
    alert(t(
      'Word / RTF 文件无法直接读取，请复制文档内容后粘贴到下方文本框。',
      'Word / RTF files cannot be read directly. Please copy the document text and paste it into the field below.'
    ))
  }
}

// ── Page router ───────────────────────────────────────────────────────────────

export function renderBhResume() {
  if (state.bhAddingResume)                           { renderAddResume();        return }
  if (state.bhBuildResumeView && state.bhResumeId)    { renderBuildResumeView();  return }
  if (state.bhBulletId)                               { renderBulletDetail();     return }
  if (state.bhResumeId)                               { renderResumeDetail();     return }
  renderResumeList()
}

// ── Page 1: Resume list ───────────────────────────────────────────────────────

function renderResumeList() {
  const bh = getBh()
  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${resumeHeader()}
      <div class="bh-body">
        <div class="bh-page-hd">
          <div class="bh-section-label" style="margin:0">${t('已保存的简历', 'Saved Resumes')}</div>
          <button class="btn-primary" onclick="startAddResume()">＋ ${t('添加简历', 'Add Resume')}</button>
        </div>
        ${bh.resumes.length === 0 ? `
          <div class="empty-state" style="padding:48px 0">
            <div class="empty-icon">📄</div>
            <div class="empty-text">${t('暂无简历。<br>添加简历以开始提取经历要点。', 'No resumes yet.<br>Add a resume to start extracting experience bullets.')}</div>
            <button class="btn-primary" style="margin-top:16px" onclick="startAddResume()">${t('添加您的简历 →', 'Add Your Resume →')}</button>
          </div>` : bh.resumes.map(r => {
            const answered = r.bullets.reduce((n, b) => n + (b.hmQuestions || []).filter(q => q.answer?.trim()).length, 0)
            const totalQ = r.bullets.reduce((n, b) => n + (b.hmQuestions || []).length, 0)
            const locale = state.lang === 'en' ? 'en-US' : 'zh-CN'
            return `
          <div class="resume-card" onclick="openResume('${r.id}')">
            <div class="resume-card-body">
              <div class="resume-name">📄 ${esc(r.name)}</div>
              <div class="resume-meta">
                ${new Date(r.createdAt).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                · ${r.bullets.length} ${t('条要点', 'bullets')}
                ${totalQ > 0 ? `· ${answered}/${totalQ} ${t('已回答', 'answers')}` : ''}
              </div>
            </div>
            <button class="btn-icon" onclick="event.stopPropagation();deleteResume('${r.id}')" title="${t('删除', 'Delete')}">✕</button>
          </div>`}).join('')}
      </div>
    </div>`
}

export function startAddResume() {
  _uploadedContent = null; _uploadedFileName = null
  state.bhAddingResume = true; renderBhResume()
}
export function cancelAddResume() { _cleanupResumeDrop(); state.bhAddingResume = false; renderBhResume() }
export function openResume(id) { state.bhResumeId = id; renderBhResume() }

export function deleteResume(id) {
  if (!confirm(t('删除此简历及其所有要点和回答？', 'Delete this resume and all its bullets and answers?'))) return
  const bh = getBh()
  bh.resumes = bh.resumes.filter(r => r.id !== id)
  if (state.bhResumeId === id) { state.bhResumeId = null; state.bhBulletId = null }
  save(); renderBhResume()
}

// ── Page 2: Add resume form ───────────────────────────────────────────────────

function renderAddResume() {
  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${resumeHeader()}
      <div class="bh-body">
        <div class="bh-page-hd">
          <button class="btn-sec" onclick="cancelAddResume()">← ${t('返回', 'Back')}</button>
          <div class="bh-section-label" style="margin:0">${t('添加简历', 'Add Resume')}</div>
        </div>
        <div style="max-width:640px">
          <div class="star-section">
            <div class="star-label">${t('简历名称', 'Resume Name')}</div>
            <input class="modal-input" id="rn_name" placeholder="${t('例：SDE II 简历 2024', 'e.g. SDE II Resume 2024')}" style="width:100%;margin-bottom:0">
          </div>
          <div class="star-section">
            <div class="star-label">${t('上传文件', 'Upload File')}
              <span class="star-hint">.txt · ${t('PDF/Word 请直接复制粘贴文本', 'for PDF/Word, copy-paste the text below')}</span>
            </div>
            <div class="drop-zone" id="resumeDropZone"
              ondragover="event.preventDefault();this.classList.add('dz-active')"
              ondragleave="this.classList.remove('dz-active')"
              ondrop="handleResumeDrop(event)">
              <div class="dz-inner">
                <div class="dz-icon">📎</div>
                <div class="dz-text">${t('将文件拖放到此处（.txt / .pdf），或', 'Drop a file here (.txt / .pdf), or')}</div>
                <button class="btn-sec" onclick="document.getElementById('resumeFileInput').click()">${t('选择文件', 'Choose File')}</button>
              </div>
            </div>
            <input type="file" id="resumeFileInput" accept=".txt,.md,.pdf,.doc,.docx,.rtf" style="display:none"
              onchange="handleResumeFile(event)">
            <div id="resumeFileChip" class="file-chip" style="display:none"></div>
          </div>
          <div class="star-section">
            <div class="star-label">${t('或粘贴文本', 'Or Paste Text')}</div>
            <textarea class="bh-resume-input" id="rn_text" rows="9"
              placeholder="${t('在此粘贴简历内容…', 'Paste your resume content here…')}"></textarea>
          </div>
          <div class="star-actions">
            <button class="btn-sec" onclick="cancelAddResume()">${t('取消', 'Cancel')}</button>
            <button class="btn-primary" onclick="submitResume()">${t('分析并保存 →', 'Analyze & Save →')}</button>
          </div>
        </div>
      </div>
    </div>`
  _initResumeDrop()
}

export async function handleResumeFile(e) {
  const file = e.target.files?.[0]; if (!file) return
  const ext = file.name.split('.').pop().toLowerCase()
  const ni = document.getElementById('rn_name')
  if (ni && !ni.value) ni.value = file.name.replace(/\.[^/.]+$/, '')
  if (ext === 'pdf') {
    const dropZone = document.getElementById('resumeDropZone')
    if (dropZone) dropZone.classList.add('dz-loading')
    try {
      const buffer = await file.arrayBuffer()
      const bytes = Array.from(new Uint8Array(buffer))
      const text = await invoke('extract_pdf_bytes', { bytes })
      _uploadedContent = text
      _uploadedFileName = file.name
      _showFileChip(file.name)
    } catch (e) {
      alert(t('PDF 读取失败：', 'PDF read failed: ') + e)
    } finally {
      if (dropZone) dropZone.classList.remove('dz-loading')
    }
    return
  }
  if (['doc', 'docx', 'rtf'].includes(ext)) {
    alert(t(
      'Word / RTF 文件无法直接读取，请复制文档内容后粘贴到下方文本框。',
      'Word / RTF files cannot be read directly. Please copy the document text and paste it into the field below.'
    ))
    return
  }
  const reader = new FileReader()
  reader.onload = ev => {
    _uploadedContent = ev.target.result
    _uploadedFileName = file.name
    _showFileChip(file.name)
  }
  reader.readAsText(file)
}

export function handleResumeDrop(e) {
  e.preventDefault()
  document.getElementById('resumeDropZone')?.classList.remove('dz-active')
  const file = e.dataTransfer.files?.[0]; if (!file) return
  if (!file.name.match(/\.(txt|md)$/i)) {
    alert('Please drop a .txt or .md file. For PDF/Word, copy-paste the text.'); return
  }
  handleResumeFile({ target: { files: [file] } })
}

export async function submitResume() {
  const name = (document.getElementById('rn_name')?.value?.trim()) || `Resume ${new Date().toLocaleDateString()}`
  const text = _uploadedContent?.trim() || (document.getElementById('rn_text')?.value?.trim()) || ''
  if (text.length < 80) { alert(t('请提供简历文本（粘贴或上传文件）。', 'Please provide resume text (paste or upload a file).')); return }
  state.bhAddingResume = false
  _uploadedContent = null; _uploadedFileName = null
  _cleanupResumeDrop()
  showLoading(t('正在分析简历…', 'Analyzing resume…'), t('Claude 正在提取您的经历要点', 'Claude is extracting your experience bullets'))
  const bh = getBh()
  let bullets = []
  try {
    const sys = `Extract work experience bullet points from this resume, grouped by role/company/project. Return ONLY a valid JSON array: [{"role":"Senior SWE at Company (2021-2024)","bullets":["bullet 1","bullet 2"]}].

Rules:
- Include ONLY action-verb-led bullets from work/internship experience sections (e.g. "Designed...", "Built...", "Led...")
- Each bullet must be a single complete thought describing one accomplishment or responsibility
- If a bullet was wrapped across multiple lines in the source text, join it into one string
- Do NOT include: contact info, summary/objective paragraphs, skills/technologies lists, education, certifications, section headers, or any line that is not a job accomplishment bullet`
    const raw = await claudeJSON(sys, `Resume:\n\n${text}`, 3000, '[')
    JSON.parse(raw).forEach(g => {
      ;(g.bullets || []).forEach(txt => {
        bullets.push({ id: uid(), text: txt, role: g.role || 'Experience', hmQuestions: [], questionsGenerated: false })
      })
    })
  } catch (_) {
    bullets = text.split('\n').map(l => l.trim())
      .filter(l => /^[•\-*▸–—]/.test(l) && l.length > 15 && l.length < 300).slice(0, 40)
      .map(l => ({ id: uid(), text: l.replace(/^[•\-*▸–—]\s*/, ''), role: 'Experience', hmQuestions: [], questionsGenerated: false }))
  }
  const resume = { id: uid(), name, text, bullets, createdAt: new Date().toISOString() }
  bh.resumes.unshift(resume)
  save()
  state.bhResumeId = resume.id
  renderBhResume()
}

// ── Page 3: Resume detail (bullet list) ──────────────────────────────────────

function renderResumeDetail() {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === state.bhResumeId)
  if (!resume) { state.bhResumeId = null; renderBhResume(); return }
  const groups = {}
  resume.bullets.forEach(b => { if (!groups[b.role]) groups[b.role] = []; groups[b.role].push(b) })
  const answeredTotal = resume.bullets.reduce((n, b) => n + (b.hmQuestions || []).filter(q => q.answer?.trim()).length, 0)
  const qTotal = resume.bullets.reduce((n, b) => n + (b.hmQuestions || []).length, 0)
  const locale = state.lang === 'en' ? 'en-US' : 'zh-CN'
  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${resumeHeader()}
      <div class="bh-body">
        <div class="bh-page-hd">
          <button class="btn-sec" onclick="backToResumeList()">← ${t('简历列表', 'Resumes')}</button>
          <div>
            <div style="font-size:15px;font-weight:600">${esc(resume.name)}</div>
            <div style="font-size:11px;color:var(--muted)">
              ${new Date(resume.createdAt).toLocaleDateString(locale)} · ${resume.bullets.length} ${t('条要点', 'bullets')}
              ${qTotal > 0 ? ` · ${answeredTotal}/${qTotal} ${t('已回答', 'answers')}` : ''}
            </div>
          </div>
          <button class="btn-sec" style="white-space:nowrap" onclick="openBuildResume('${resume.id}')">
            📄 ${t('生成新简历', 'Build Updated Resume')} →
          </button>
        </div>
        ${_renderSelfIntroSection(resume)}
        ${Object.entries(groups).map(([role, bullets]) => `
          <div class="bh-role-group">
            <div class="bh-role-name">${esc(role)}</div>
            ${bullets.map(b => {
              const answered = (b.hmQuestions || []).filter(q => q.answer?.trim()).length
              const total = (b.hmQuestions || []).length
              return `
              <div class="bullet-row" onclick="openBullet('${resume.id}','${b.id}')">
                <span class="bullet-dot">▸</span>
                <span class="bullet-row-text">${esc(b.text)}</span>
                ${b.questionsGenerated
                  ? `<span class="bullet-badge ${answered === total && total > 0 ? 'badge-done' : 'badge-partial'}">
                       ${answered}/${total} ${t('已回答', 'answered')}
                     </span>`
                  : `<button class="btn-analyze" onclick="event.stopPropagation();openBullet('${resume.id}','${b.id}')">${t('分析 →', 'Analyze →')}</button>`}
              </div>`
            }).join('')}
          </div>`).join('')}
      </div>
    </div>`
}

export function backToResumeList() { state.bhResumeId = null; state.bhBulletId = null; renderBhResume() }
export function openBullet(resumeId, bulletId) { state.bhResumeId = resumeId; state.bhBulletId = bulletId; renderBhResume() }

// ── Page 4: Bullet detail (questions + answers) ───────────────────────────────

export function renderBulletDetail() {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === state.bhResumeId)
  if (!resume) { state.bhResumeId = null; state.bhBulletId = null; renderBhResume(); return }
  const bullet = resume.bullets.find(b => b.id === state.bhBulletId)
  if (!bullet) { state.bhBulletId = null; renderBhResume(); return }
  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${resumeHeader()}
      <div class="bh-body">
        <div class="bh-page-hd">
          <button class="btn-sec" onclick="backToBulletList()">← ${esc(resume.name)}</button>
        </div>
        <div class="bullet-detail-box">
          <span class="bullet-dot" style="font-size:16px;flex-shrink:0;margin-top:2px">▸</span>
          <span class="bullet-detail-text">${esc(bullet.text)}</span>
        </div>
        ${_renderTalkingPointsSection(resume, bullet)}
        ${_renderSpeechSkeletonSection(resume, bullet)}
        ${!bullet.questionsGenerated ? `
          <button class="btn-primary" style="margin-top:20px"
            onclick="generateBulletQs('${resume.id}','${bullet.id}')">
            💼 ${t('生成主管深度追问', 'Generate HM Deep-Dive Questions')}
          </button>
          <p style="margin-top:10px;font-size:12px;color:var(--muted)">
            ${t('Claude 将生成 5 个工程主管会针对该经历问到的深度问题。', 'Claude will generate 5 questions an engineering manager would ask about this specific experience.')}
          </p>` : `
          <div class="hm-section${_hmCollapsed.has(bullet.id) ? ' hm-collapsed' : ''}" id="hm-section-${bullet.id}">
            <div class="hm-section-hd" onclick="toggleHmSection('${bullet.id}')">
              <div class="bh-section-label" style="margin:0">
                💼 ${t('主管深度追问', 'HM Deep-Dive Questions')}
                <span class="qh-cnt">${bullet.hmQuestions.filter(q => q.answer?.trim()).length}/${bullet.hmQuestions.length} ${t('已回答', 'answered')}</span>
              </div>
              <span class="hm-toggle-icon">${_hmCollapsed.has(bullet.id) ? '▸' : '▾'}</span>
            </div>
            <div class="hm-section-body">
          ${bullet.hmQuestions.map((q, i) => `
            <div class="hm-q-item">
              <div class="hm-question-text">
                <span class="hm-qnum">Q${i + 1}</span>${esc(q.text)}
              </div>
              <div class="speech-field">
                <textarea class="answer-textarea" id="ans_${q.id}" rows="3"
                  placeholder="${t('在此填写您的回答…（点击其他区域自动保存）', 'Write your answer here… (auto-saved when you click away)')}"
                  onblur="saveAnswer('${resume.id}','${bullet.id}','${q.id}',this.value)">${esc(q.answer || '')}</textarea>
                ${micBtn('ans_' + q.id)}
              </div>
              <div class="ans-actions" id="ans-actions-${q.id}">
                <button class="btn-ans-action" onclick="polishAnswer('${resume.id}','${bullet.id}','${q.id}')">✨ ${t('润色回答', 'Polish Answer')}</button>
                <button class="btn-ans-action btn-ans-analyze" onclick="analyzeAnswer('${resume.id}','${bullet.id}','${q.id}')">📊 ${t('SDE II 评估', 'SDE II Analysis')}</button>
              </div>
              ${q.polished ? `
                <div class="ans-result-box ans-polished">
                  <div class="ans-result-hd">
                    <div class="ans-result-label">✨ ${t('AI 润色版', 'AI Polished')}</div>
                    <div style="display:flex;gap:6px">
                      <button class="ans-result-btn" onclick="overridePolished('${resume.id}','${bullet.id}','${q.id}')">✎ ${t('覆写', 'Override')}</button>
                      <button class="ans-result-btn" onclick="var b=this.closest('.ans-result-box');b.classList.toggle('collapsed');this.textContent=b.classList.contains('collapsed')?'▸':'▾'">▾</button>
                    </div>
                  </div>
                  <div class="ans-result-text" id="polished-text-${q.id}">${esc(q.polished)}</div>
                </div>` : ''}
              ${q.feedback ? `
                <div class="ans-result-box ans-feedback">
                  <div class="ans-result-hd">
                    <div class="ans-result-label">📊 ${t('SDE II 评估', 'SDE II Analysis')}</div>
                    <button class="ans-result-btn" onclick="var b=this.closest('.ans-result-box');b.classList.toggle('collapsed');this.textContent=b.classList.contains('collapsed')?'▸':'▾'">▾</button>
                  </div>
                  <div class="ans-result-text">${esc(q.feedback)}</div>
                </div>` : ''}
            </div>`).join('')}
            </div>
          </div>`}
      </div>
    </div>`
}

export function backToBulletList() { state.bhBulletId = null; renderBhResume() }

export async function generateBulletQs(resumeId, bulletId) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  const bullet = resume?.bullets.find(b => b.id === bulletId)
  if (!bullet) return
  showLoading(t('正在生成主管追问…', 'Generating HM questions…'), t('正在准备针对该经历的深度追问', 'Preparing deep-dive questions about this experience'))
  try {
    const sys = `You are a senior engineering manager at Google conducting an SDE II hiring manager interview. Generate exactly 5 deep-dive questions about this specific experience bullet. Each question must probe a different dimension: (1) technical depth & decision rationale, (2) scope of impact & cross-functional influence, (3) handling ambiguity or tradeoffs, (4) leadership or influence without authority, (5) reflection — what they would do differently and what they learned. Return ONLY a JSON array of 5 question strings.`
    const raw = await claudeJSON(sys, `Role: ${bullet.role}\nExperience bullet: "${bullet.text}"`, 800, '[')
    const qs = JSON.parse(raw)
    bullet.hmQuestions = qs.map(q => ({ id: uid(), text: typeof q === 'string' ? q : String(q), answer: '' }))
    bullet.questionsGenerated = true
  } catch (_) {
    bullet.hmQuestions = [{ id: uid(), text: 'Failed to generate questions — please try again.', answer: '' }]
    bullet.questionsGenerated = true
  }
  save()
  if (state.bhBulletId === bulletId) renderBulletDetail()
}

export function saveAnswer(resumeId, bulletId, questionId, answer) {
  const bh = getBh()
  const bullet = bh.resumes.find(r => r.id === resumeId)?.bullets.find(b => b.id === bulletId)
  const q = bullet?.hmQuestions.find(q => q.id === questionId)
  if (q) { q.answer = answer; save() }
}

export async function polishAnswer(resumeId, bulletId, questionId) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  const bullet = resume?.bullets.find(b => b.id === bulletId)
  const q = bullet?.hmQuestions.find(q => q.id === questionId)
  if (!q) return
  const ta = document.getElementById('ans_' + questionId)
  if (ta) { q.answer = ta.value; save() }
  if (!q.answer?.trim()) {
    alert(t('请先填写回答再润色。', 'Please write your answer before polishing.')); return
  }
  const actionsEl = document.getElementById('ans-actions-' + questionId)
  if (actionsEl) actionsEl.innerHTML = `<span class="inline-loading"><span class="spin-icon">⟳</span> ${t('正在润色…', 'Polishing…')}</span>`
  // Pre-create streaming box so text appears immediately
  const qItem = actionsEl?.closest('.hm-q-item')
  if (qItem) {
    qItem.querySelectorAll('.ans-polished').forEach(el => el.remove())
    qItem.insertAdjacentHTML('beforeend',
      '<div class="ans-result-box ans-polished" id="stream-box-polish-' + questionId + '">'
      + '<div class="ans-result-hd"><div class="ans-result-label">✨ ' + t('AI 润色版', 'AI Polished') + '</div></div>'
      + '<div class="ans-result-text stream-active" id="stream-text-polish-' + questionId + '"></div>'
      + '</div>')
  }
  try {
    const sys = `You are a senior SDE II interview coach helping a candidate nail a hiring manager interview. Polish the candidate's answer to be crisp, first-person, impact-forward, and SDE II-appropriate. Rules: use "I" not "we"; lead with the most impactful point; be specific and include any metrics mentioned; cut filler words; keep it under 150 words. Return ONLY the polished answer text with no preamble.`
    q.polished = await claudeStream(
      sys,
      `Experience bullet: "${bullet.text}"\n\nQuestion: ${q.text}\n\nCandidate answer: ${q.answer}`,
      500,
      (accumulated) => {
        const el = document.getElementById('stream-text-polish-' + questionId)
        if (el) el.textContent = accumulated
      }
    )
    save()
  } catch (err) {
    alert(t('润色失败：', 'Polish failed: ') + (err?.message || String(err)))
  }
  if (state.bhBulletId === bulletId) renderBulletDetail()
}

export async function analyzeAnswer(resumeId, bulletId, questionId) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  const bullet = resume?.bullets.find(b => b.id === bulletId)
  const q = bullet?.hmQuestions.find(q => q.id === questionId)
  if (!q) return
  const ta = document.getElementById('ans_' + questionId)
  if (ta) { q.answer = ta.value; save() }
  if (!q.answer?.trim()) {
    alert(t('请先填写回答再评估。', 'Please write your answer before analyzing.')); return
  }
  const actionsEl = document.getElementById('ans-actions-' + questionId)
  if (actionsEl) actionsEl.innerHTML = `<span class="inline-loading"><span class="spin-icon">⟳</span> ${t('正在评估…', 'Analyzing…')}</span>`
  // Pre-create streaming box so text appears immediately
  const qItem2 = actionsEl?.closest('.hm-q-item')
  if (qItem2) {
    qItem2.querySelectorAll('.ans-feedback').forEach(el => el.remove())
    qItem2.insertAdjacentHTML('beforeend',
      '<div class="ans-result-box ans-feedback" id="stream-box-analysis-' + questionId + '">'
      + '<div class="ans-result-hd"><div class="ans-result-label">📊 ' + t('SDE II 评估', 'SDE II Analysis') + '</div></div>'
      + '<div class="ans-result-text stream-active" id="stream-text-analysis-' + questionId + '"></div>'
      + '</div>')
  }
  try {
    const sys = `You are a SDE II hiring manager evaluating a candidate's answer against the SDE II bar. Give honest, actionable feedback in exactly 3 labeled bullet points:
• Strengths: what works well (specificity, impact, leadership signal)
• Gaps: what's missing or weak (push for more depth, metrics, ownership, cross-team influence)
• Verdict: one sentence — does this clear the SDE II bar, and what's the biggest thing to fix?
Be direct. No preamble, no sign-off.`
    q.feedback = await claudeStream(
      sys,
      `Experience bullet: "${bullet.text}"\n\nQuestion: ${q.text}\n\nCandidate answer: ${q.answer}`,
      600,
      (accumulated) => {
        const el = document.getElementById('stream-text-analysis-' + questionId)
        if (el) el.textContent = accumulated
      }
    )
    save()
  } catch (err) {
    alert(t('评估失败：', 'Analysis failed: ') + (err?.message || String(err)))
  }
  if (state.bhBulletId === bulletId) renderBulletDetail()
}

// ── Override polished answer (inline edit) ────────────────────────────────────

export function overridePolished(resumeId, bulletId, questionId) {
  const el = document.getElementById('polished-text-' + questionId)
  if (!el) return
  const bh = getBh()
  const q = bh.resumes.find(r => r.id === resumeId)?.bullets.find(b => b.id === bulletId)?.hmQuestions.find(q => q.id === questionId)
  if (!q) return
  el.outerHTML = `<div id="polished-edit-${questionId}">
    <textarea class="answer-textarea" id="polished-ta-${questionId}" rows="4" style="margin-top:8px">${esc(q.polished || '')}</textarea>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn-sec" onclick="renderBulletDetail()">✕ ${t('取消', 'Cancel')}</button>
      <button class="btn-primary" onclick="savePolished('${resumeId}','${bulletId}','${questionId}')">✓ ${t('保存', 'Save')}</button>
    </div>
  </div>`
  document.getElementById('polished-ta-' + questionId)?.focus()
}

export function savePolished(resumeId, bulletId, questionId) {
  const ta = document.getElementById('polished-ta-' + questionId)
  if (!ta) return
  const bh = getBh()
  const q = bh.resumes.find(r => r.id === resumeId)?.bullets.find(b => b.id === bulletId)?.hmQuestions.find(q => q.id === questionId)
  if (!q) return
  q.polished = ta.value
  save()
  renderBulletDetail()
}

// ── Self Introduction ─────────────────────────────────────────────────────────

const _SI_PRESETS = {
  hook:   [{ key: 'stronger',  label: t('更有冲击力？', 'Make it stronger?') },
           { key: 'tooshort',  label: t('太短了吗？',   'Too brief?') }],
  story:  [{ key: 'moredata',  label: t('加入更多数据？', 'Add more metrics?') },
           { key: 'toolong',   label: t('太冗长？',     'Too long?') }],
  bridge: [{ key: 'generic',   label: t('太泛泛了？',   'Too generic?') },
           { key: 'tailorl5',  label: t('针对 SDE II 调整？', 'Tailor for SDE II?') }],
}
const _SI_PRESET_QS = {
  stronger: t('My HOOK sentence — make it more memorable and impactful. Be specific about what should change and why.', 'My HOOK sentence — make it more memorable and impactful. Be specific about what should change and why.'),
  tooshort: t('Is my HOOK long enough, or does it need more context? How should I expand it within the 20-second limit?', 'Is my HOOK long enough, or does it need more context? How should I expand it within the 20-second limit?'),
  moredata: t('How can I add more quantifiable impact or scale to my STORY? What metrics or proof points are missing?', 'How can I add more quantifiable impact or scale to my STORY? What metrics or proof points are missing?'),
  toolong:  t('Is my STORY over-explaining or losing the interviewer? What should I cut to tighten it to 30 seconds?', 'Is my STORY over-explaining or losing the interviewer? What should I cut to tighten it to 30 seconds?'),
  generic:  t('Does my BRIDGE sound cliché or vague? How do I make it feel genuine and specific to my next challenge?', 'Does my BRIDGE sound cliché or vague? How do I make it feel genuine and specific to my next challenge?'),
  tailorl5: t('How should I tailor my BRIDGE specifically for an SDE II FAANG role to show I understand the bar?', 'How should I tailor my BRIDGE specifically for an SDE II FAANG role to show I understand the bar?'),
}

function _siQaPanel(resume, part) {
  const presets = _SI_PRESETS[part] || []
  const history = resume.siQaHistory?.[part] || []
  const hasHistory = history.length > 0
  const key = `${resume.id}_${part}`
  const isOpen = hasHistory ? !_siQaCollapsed.has(key) : false
  return `<div class="tp-qa-area" id="si-qa-${resume.id}-${part}" style="display:${isOpen ? 'block' : 'none'}">
    ${hasHistory ? `<div class="tp-qa-history">
      ${history.map(e => `<div class="tp-qa-entry">
        <div class="tp-qa-q">${esc(e.q)}</div>
        <div class="tp-qa-a">${esc(e.a)}</div>
      </div>`).join('')}
    </div>` : ''}
    <div id="si-qa-answers-${resume.id}-${part}"></div>
    <div class="tp-qa-presets">
      ${presets.map(p => `<button class="tp-qa-preset-btn"
        onclick="sendSiPreset('${resume.id}','${part}','${p.key}')">${p.label}</button>`).join('')}
    </div>
    <div class="tp-qa-input-row">
      <input class="tp-qa-input" id="si-qa-input-${resume.id}-${part}"
        placeholder="${t('输入问题…', 'Ask a question…')}"
        onkeydown="if(event.key==='Enter')sendSiQuestion('${resume.id}','${part}')">
      <button class="btn-sec" style="font-size:11px;padding:4px 10px"
        onclick="sendSiQuestion('${resume.id}','${part}')">→</button>
    </div>
    ${hasHistory ? `<div class="tp-qa-controls">
      <button class="tp-qa-clear-btn" onclick="clearSiQa('${resume.id}','${part}')">🗑 ${t('清除历史', 'Clear history')}</button>
    </div>` : ''}
  </div>`
}

function _siCue(part) {
  const cues = {
    hook:   t('开场：你是谁？一句话突出你最大的价值，不要从职称开始。', "Opener: Who are you? One sentence — lead with your biggest value, not your job title."),
    story:  t('故事：你的经历弧线？提两个具体成果（含数字）。', "Story: What's your career arc? Name 2+ specific proof points with numbers."),
    bridge: t('展望：为什么是现在？你在寻找什么样的挑战？', "Bridge: Why now? What kind of challenge are you looking for next?"),
  }
  return cues[part] || ''
}

function _renderSelfIntroSection(resume) {
  const si = resume.selfIntro
  if (!si) {
    return `
    <div class="self-intro-section">
      <div class="si-section-hd">
        <div class="bh-section-label" style="margin:0">🎙 ${t('自我介绍', 'Self Introduction')}</div>
      </div>
      <p class="si-hint">${t('根据您的完整简历生成结构化自我介绍（开场白 · 经历故事 · 展望）。', 'Generate a structured self-introduction (Hook · Story · Bridge) from your full resume.')}</p>
      <button class="btn-primary" onclick="generateSelfIntro('${resume.id}')">🎙 ${t('生成自我介绍', 'Generate Self Introduction')}</button>
    </div>`
  }
  const parts = [
    { key: 'hook',   label: t('开场白', 'HOOK'),        time: '~20 sec', text: si.hook },
    { key: 'story',  label: t('经历故事', 'YOUR STORY'), time: '~30 sec', text: si.story },
    { key: 'bridge', label: t('展望',    'WHY HERE'),    time: '~15 sec', text: si.bridge },
  ]
  return `
  <div class="self-intro-section" id="si-section-${resume.id}">
    <div class="si-section-hd">
      <div class="bh-section-label" style="margin:0">🎙 ${t('自我介绍', 'Self Introduction')}</div>
      <div style="display:flex;gap:6px">
        <button class="btn-sec" id="si-prac-btn-${resume.id}"
          onclick="toggleSelfIntroPractice('${resume.id}')">🎭 ${t('练习', 'Practice')}</button>
        <button class="btn-sec" onclick="generateSelfIntro('${resume.id}')">↺ ${t('重新生成', 'Regenerate')}</button>
      </div>
    </div>
    ${parts.map(p => `
    <div class="self-intro-card">
      <div class="si-card-header">
        <span class="si-card-label">${p.label}</span>
        <span class="si-card-time">${p.time}</span>
        <button class="si-edit-btn" onclick="editSelfIntroPart('${resume.id}','${p.key}')">✎ ${t('编辑', 'Edit')}</button>
        <button class="si-edit-btn" onclick="toggleSiQa('${resume.id}','${p.key}')" title="${t('提问', 'Ask')}">💬</button>
      </div>
      <div class="si-card-text" id="si-text-${resume.id}-${p.key}">${esc(p.text || '')}</div>
      <div class="si-practice-cue">${_siCue(p.key)}</div>
      ${_siQaPanel(resume, p.key)}
    </div>`).join('')}
  <div class="tp-eval-area" id="si-eval-area-${resume.id}">
    <button class="btn-ans-action btn-ans-analyze"
      onclick="evaluateSelfIntro('${resume.id}')">
      📊 ${t('评估自我介绍', 'Evaluate Self Introduction')}
    </button>
    <div id="si-eval-result-${resume.id}"></div>
  </div>
  </div>`
}

export async function generateSelfIntro(resumeId) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  if (!resume) return
  showLoading(t('正在生成自我介绍…', 'Generating self introduction…'), t('Claude 正在基于您的完整简历撰写结构化介绍', 'Claude is writing a structured introduction from your full resume'))
  try {
    const sys = `You are a world-class SDE II Google SWE interview coach. Generate a structured self-introduction script in 3 parts based on the candidate's resume.

HOOK (15-20 sec): One strong opening sentence. Lead with biggest impact or expertise area, NOT job title. Make it memorable and specific.
YOUR STORY (25-35 sec): Crisp narrative connecting key roles and showing progression. Include 2+ specific proof points with numbers or scale. Use "I", be concrete and specific.
WHY HERE (10-15 sec): What they are looking for next. Genuine and forward-looking, not generic platitudes.

Return ONLY valid JSON: {"hook":"...","story":"...","bridge":"..."}
Write in conversational first-person prose ready to say out loud. No bullet points.`
    const raw = await claudeJSON(sys, `Resume:\n\n${resume.text}`, 1200, '{')
    const si = JSON.parse(raw)
    resume.selfIntro = { hook: si.hook || '', story: si.story || '', bridge: si.bridge || '' }
  } catch (e) {
    alert(t('生成失败：', 'Generation failed: ') + (e?.message || String(e)))
  }
  save()
  if (state.bhResumeId === resumeId) renderBhResume()
}

export function editSelfIntroPart(resumeId, part) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  if (!resume?.selfIntro) return
  const el = document.getElementById(`si-text-${resumeId}-${part}`)
  if (!el) return
  el.outerHTML = `<div id="si-edit-${resumeId}-${part}">
    <textarea class="answer-textarea" id="si-ta-${resumeId}-${part}"
      style="margin-top:4px;resize:vertical;min-height:80px"
      oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
    >${esc(resume.selfIntro[part] || '')}</textarea>
    <div style="display:flex;gap:6px;margin-top:4px">
      <button class="btn-sec" onclick="renderBhResume()">✕ ${t('取消', 'Cancel')}</button>
      <button class="btn-primary" onclick="saveSelfIntroPart('${resumeId}','${part}')">✓ ${t('保存', 'Save')}</button>
    </div>
  </div>`
  const siTa = document.getElementById(`si-ta-${resumeId}-${part}`)
  if (siTa) { siTa.style.height = 'auto'; siTa.style.height = siTa.scrollHeight + 'px'; siTa.focus() }
}

export function saveSelfIntroPart(resumeId, part) {
  const ta = document.getElementById(`si-ta-${resumeId}-${part}`)
  if (!ta) return
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  if (!resume?.selfIntro) return
  resume.selfIntro[part] = ta.value
  save()
  renderBhResume()
}

export function toggleSelfIntroPractice(resumeId) {
  const section = document.getElementById(`si-section-${resumeId}`)
  const btn = document.getElementById(`si-prac-btn-${resumeId}`)
  if (!section) return
  const active = section.classList.toggle('si-practice-active')
  if (btn) btn.textContent = active
    ? `👁 ${t('显示脚本', 'Show Script')}`
    : `🎭 ${t('练习', 'Practice')}`
}

// ── Self Introduction inline Q&A ─────────────────────────────────────────────

export function toggleSiQa(resumeId, part) {
  const area = document.getElementById(`si-qa-${resumeId}-${part}`)
  if (!area) return
  const key = `${resumeId}_${part}`
  if (area.style.display === 'none') {
    area.style.display = 'block'
    _siQaCollapsed.delete(key)
  } else {
    area.style.display = 'none'
    _siQaCollapsed.add(key)
  }
}

export function sendSiPreset(resumeId, part, presetKey) {
  const question = _SI_PRESET_QS[presetKey]
  if (question) _doSiQuestion(resumeId, part, question)
}

export function sendSiQuestion(resumeId, part) {
  const input = document.getElementById(`si-qa-input-${resumeId}-${part}`)
  if (!input) return
  const question = input.value.trim()
  if (!question) return
  input.value = ''
  _doSiQuestion(resumeId, part, question)
}

async function _doSiQuestion(resumeId, part, question) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  if (!resume?.selfIntro) return
  const answersEl = document.getElementById(`si-qa-answers-${resumeId}-${part}`)
  if (!answersEl) return
  const qId = uid()
  answersEl.insertAdjacentHTML('beforeend', `
    <div class="tp-qa-entry">
      <div class="tp-qa-q">${esc(question)}</div>
      <div class="tp-qa-a stream-active" id="si-qa-a-${qId}"><span class="spin-icon">⟳</span></div>
    </div>`)
  answersEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  const partNames = { hook: 'HOOK', story: 'YOUR STORY', bridge: 'WHY HERE' }
  const sys = `You are an expert SDE II interview coach. Give a short, direct answer (2-4 sentences max) to the candidate's specific question about their self-introduction ${partNames[part] || part} section. Be concrete and actionable. No preamble, no sign-off.`
  const convHistory = _buildConvHistory(resume.siQaHistory?.[part])
  const histLabel = convHistory ? `\n\nConversation so far:\n${convHistory}\n\nFollow-up question` : `\n\nQuestion`
  const userMsg = `Full resume:\n${resume.text}\n\nSelf Introduction:\nHOOK: "${resume.selfIntro.hook}"\nYOUR STORY: "${resume.selfIntro.story}"\nWHY HERE: "${resume.selfIntro.bridge}"${histLabel} about ${partNames[part] || part}: ${question}`
  let finalAnswer = ''
  try {
    await claudeStream(sys, userMsg, 300, (accumulated) => {
      finalAnswer = accumulated
      const el = document.getElementById(`si-qa-a-${qId}`)
      if (el) el.textContent = accumulated
    })
    if (finalAnswer) {
      if (!resume.siQaHistory) resume.siQaHistory = {}
      if (!resume.siQaHistory[part]) resume.siQaHistory[part] = []
      resume.siQaHistory[part].push({ q: question, a: finalAnswer })
      save()
    }
  } catch (_) {
    const el = document.getElementById(`si-qa-a-${qId}`)
    if (el) el.textContent = t('生成失败', 'Failed to generate answer')
  }
}

export function clearSiQa(resumeId, part) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  if (!resume?.siQaHistory?.[part]) return
  delete resume.siQaHistory[part]
  if (Object.keys(resume.siQaHistory).length === 0) delete resume.siQaHistory
  save()
  _siQaCollapsed.add(`${resumeId}_${part}`)
  renderBhResume()
}

export async function evaluateSelfIntro(resumeId) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  if (!resume?.selfIntro) return
  const evalArea = document.getElementById(`si-eval-area-${resumeId}`)
  const btn = evalArea?.querySelector('button')
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin-icon">⟳</span> ${t('评估中…', 'Evaluating…')}` }
  const resultEl = document.getElementById(`si-eval-result-${resumeId}`)
  if (resultEl) resultEl.innerHTML = `<div class="ans-result-box ans-feedback" style="margin-top:10px">
    <div class="ans-result-hd"><div class="ans-result-label">📊 ${t('自我介绍评估', 'Self Introduction Evaluation')}</div></div>
    <div class="ans-result-text stream-active" id="si-eval-text-${resumeId}"></div>
  </div>`
  const si = resume.selfIntro
  const sys = `You are an SDE II interview coach evaluating a candidate's self-introduction for a FAANG senior engineer interview. Give honest, actionable feedback in 3 labeled bullet points:
• Strengths: what works well (memorable hook, specific proof points with numbers, genuine bridge, clear progression arc)
• Gaps: what's weak or missing (generic language, missing metrics, starts with job title, bridge feels vague or cliché, story has no arc)
• Verdict: one sentence — does this sound SDE II-level, and what's the #1 thing to fix?
Be direct and specific. No preamble.`
  const userMsg = `Candidate's resume:\n${resume.text}\n\nSelf Introduction:\nHOOK (~20s): ${si.hook}\nYOUR STORY (~30s): ${si.story}\nWHY HERE (~15s): ${si.bridge}`
  try {
    await claudeStream(sys, userMsg, 400, (accumulated) => {
      const el = document.getElementById(`si-eval-text-${resumeId}`)
      if (el) el.textContent = accumulated
    })
  } catch (_) {
    const el = document.getElementById(`si-eval-text-${resumeId}`)
    if (el) el.textContent = t('评估失败', 'Evaluation failed')
  }
  if (btn) { btn.disabled = false; btn.innerHTML = `📊 ${t('评估自我介绍', 'Evaluate Self Introduction')}` }
}

// ── Bullet Talking Points ─────────────────────────────────────────────────────

function _tpCue(part) {
  const cues = {
    stage:     t('简要背景：公司 + 团队规模 + 项目范围。控制在 5 秒内。', 'Set the scene: company + team size + project scope. Keep it under 5 seconds.'),
    challenge: t('最难的地方是什么？为什么重要？（这是最关键的部分！）', 'What was genuinely hard? Why did it matter? (This is the most important part!)'),
    action:    t('你具体做了什么？用"我"而不是"我们"。说出你的决策。', "What did YOU do? Use 'I' not 'we'. Name your specific decisions."),
    result:    t('结果是什么？给出数字和业务影响。', 'What changed? Give numbers and business impact.'),
  }
  return cues[part] || ''
}

// ── Talking Points preset Q&A ─────────────────────────────────────────────────

const _TP_PRESETS = {
  stage:     [{ key: 'brief',     label: t('该多简短？', 'How brief?') },       { key: 'include',    label: t('包含哪些细节？', 'What to include?') }],
  challenge: [{ key: 'technical', label: t('技术深度？', 'How technical?') },    { key: 'frame',      label: t('如何定性难度？', 'Frame difficulty?') }],
  action:    [{ key: 'senior',    label: t('如何体现高级？', 'Sound senior?') }, { key: 'ownership',  label: t('突出个人贡献？', 'Show ownership?') }],
  result:    [{ key: 'nometrics', label: t('没有精确数字？', 'No metrics?') },   { key: 'impact',     label: t('如何说明业务影响？', 'Frame impact?') }],
}

const _TP_PRESET_QUESTIONS = {
  brief:      "How brief should my SITUATION be? What's the right amount of context to set without over-explaining?",
  include:    "What specific details should I include in my SITUATION? What does the interviewer actually need to know?",
  technical:  "How deep should I go technically in the CHALLENGE section? What level is right for an SDE II HM interview?",
  frame:      "How should I frame this challenge to show it was genuinely hard, without sounding like we failed?",
  senior:     "How can I make my ACTION section sound more senior/SDE II? What signals show high-level ownership?",
  ownership:  "How do I highlight my individual contribution without dismissing the team?",
  nometrics:  "I don't have exact numbers for my RESULT. How should I handle this without sounding vague?",
  impact:     "How should I frame the business impact in my RESULT for an engineering manager audience?",
}

function _tpCtxSection(resume, bullet) {
  // Migrate old single tpContextId → array
  if (bullet.tpContextId && !bullet.tpContextIds) {
    bullet.tpContextIds = [bullet.tpContextId]; delete bullet.tpContextId; save()
  }
  const selectedIds = bullet.tpContextIds || []
  const chapters = state.S.chapters || []
  const folders = state.S.folders || []
  const grouped = {}
  chapters.forEach(ch => { const fid = ch.folderId || '_none'; if (!grouped[fid]) grouped[fid] = []; grouped[fid].push(ch) })
  const pickerContent = chapters.length === 0
    ? `<div class="tp-ctx-empty">${t('没有可用的知识库章节。', 'No knowledge base chapters available.')}</div>`
    : Object.entries(grouped).map(([fid, chs]) => {
        const f = fid === '_none' ? null : folders.find(f => f.id === fid)
        return `<div class="tp-ctx-folder">
          <div class="tp-ctx-folder-name">${f ? `${f.icon} ${esc(f.name)}` : t('未分类', 'Uncategorized')}</div>
          ${chs.map(ch => {
            const sel = selectedIds.includes(ch.id)
            return `<div class="tp-ctx-chapter${sel ? ' tp-ctx-selected' : ''}"
              onclick="selectTpCtx('${resume.id}','${bullet.id}','${ch.id}')">
              <span class="tp-ctx-check">${sel ? '✓' : ''}</span>${esc(ch.name)}
            </div>`
          }).join('')}
        </div>`
      }).join('')
  const chips = selectedIds.map(id => {
    const ch = chapters.find(c => c.id === id); if (!ch) return ''
    const f = folders.find(f => f.id === ch.folderId)
    return `<span class="tp-ctx-chip">${f ? esc(f.name) + ' › ' : ''}${esc(ch.name)}<button onclick="clearTpCtx('${resume.id}','${bullet.id}','${id}')">✕</button></span>`
  }).filter(Boolean)
  return `<div class="tp-ctx-area">
    <div class="tp-ctx-hd">
      <span class="tp-ctx-label">📚 ${t('知识库上下文', 'Knowledge Context')}</span>
      <button class="tp-ctx-toggle-btn" onclick="toggleTpCtxPicker('${bullet.id}')">+ ${t('添加', 'Add')}</button>
      ${selectedIds.length > 0 ? `<button class="tp-ctx-toggle-btn" onclick="clearTpCtx('${resume.id}','${bullet.id}',null)" style="color:var(--muted)">${t('清除全部', 'Clear All')}</button>` : ''}
    </div>
    ${chips.length > 0 ? `<div class="tp-ctx-chips">${chips.join('')}</div>` : ''}
    <div class="tp-ctx-picker" id="tp-ctx-picker-${bullet.id}" style="display:none">
      <div class="tp-ctx-picker-hint">${t('点击选中/取消', 'Click to toggle')}</div>
      ${pickerContent}
    </div>
  </div>`
}

function _buildContextStr(bullet) {
  const ids = bullet.tpContextIds || (bullet.tpContextId ? [bullet.tpContextId] : [])
  if (!ids.length) return ''
  const chapters = state.S.chapters || []
  const parts = ids.map(id => {
    const ch = chapters.find(c => c.id === id)
    return ch?.analysis ? `[${ch.name}]\n${ch.analysis.slice(0, 800)}` : null
  }).filter(Boolean)
  return parts.length ? `\n\nKnowledge base context (use relevant technical details from this):\n${parts.join('\n\n')}` : ''
}

function _buildConvHistory(history, maxTurns = 6) {
  if (!history?.length) return ''
  return history.slice(-maxTurns).map(e => 'User: ' + e.q + '\nAssistant: ' + e.a).join('\n\n')
}

function _tpQaSection(resume, bullet, part) {
  const presets = _TP_PRESETS[part] || []
  const history = bullet.tpQaHistory?.[part] || []
  const hasHistory = history.length > 0
  const key = `${bullet.id}_${part}`
  // Default open if has history AND not explicitly collapsed; default closed if no history
  const isOpen = hasHistory ? !_tpQaCollapsed.has(key) : false
  return `<div class="tp-qa-area" id="tp-qa-${bullet.id}-${part}" style="display:${isOpen ? 'block' : 'none'}">
    ${hasHistory ? `<div class="tp-qa-history">
      ${history.map(e => `<div class="tp-qa-entry">
        <div class="tp-qa-q">${esc(e.q)}</div>
        <div class="tp-qa-a">${esc(e.a)}</div>
      </div>`).join('')}
    </div>` : ''}
    <div id="tp-qa-answers-${bullet.id}-${part}"></div>
    <div class="tp-qa-presets">
      ${presets.map(p => `<button class="tp-qa-preset-btn"
        onclick="sendTpPreset('${resume.id}','${bullet.id}','${part}','${p.key}')">${p.label}</button>`).join('')}
    </div>
    <div class="tp-qa-input-row">
      <input class="tp-qa-input" id="tp-qa-input-${bullet.id}-${part}"
        placeholder="${t('输入问题…', 'Ask a question…')}"
        onkeydown="if(event.key==='Enter')sendTpQuestion('${resume.id}','${bullet.id}','${part}')">
      <button class="btn-sec" style="font-size:11px;padding:4px 10px"
        onclick="sendTpQuestion('${resume.id}','${bullet.id}','${part}')">→</button>
    </div>
    ${hasHistory ? `<div class="tp-qa-controls">
      <button class="tp-qa-clear-btn" onclick="clearTpQa('${resume.id}','${bullet.id}','${part}')">🗑 ${t('清除历史', 'Clear history')}</button>
    </div>` : ''}
  </div>`
}

function _tpEvalSection(resume, bullet) {
  return `<div class="tp-eval-area" id="tp-eval-area-${bullet.id}">
    <button class="btn-ans-action btn-ans-analyze"
      onclick="evaluateTalkingPoints('${resume.id}','${bullet.id}')">
      📊 ${t('评估我的谈话要点', 'Evaluate My Talking Points')}
    </button>
    <div id="tp-eval-result-${bullet.id}"></div>
  </div>`
}

function _renderTalkingPointsSection(resume, bullet) {
  const tp = bullet.talkingPoints
  const ctxSection = _tpCtxSection(resume, bullet)
  if (!tp) {
    return `
    <div class="tp-section">
      <div class="si-section-hd">
        <div class="bh-section-label" style="margin:0">📋 ${t('谈话要点', 'Talking Points')}</div>
      </div>
      ${ctxSection}
      <p class="si-hint">${t('生成 SCAR 结构化谈话框架（背景 · 挑战 · 行动 · 成果），帮助您有条理地介绍这段经历。', 'Generate a SCAR framework (Situation · Challenge · Action · Result) to talk through this experience with structure.')}</p>
      <button class="btn-primary" onclick="generateTalkingPoints('${resume.id}','${bullet.id}')">📋 ${t('生成谈话要点', 'Generate Talking Points')}</button>
    </div>`
  }
  const parts = [
    { key: 'stage',     label: t('背景', 'SITUATION'), time: '~5 sec',  key_badge: false, text: tp.stage },
    { key: 'challenge', label: t('挑战', 'CHALLENGE'), time: '~10 sec', key_badge: true,  text: tp.challenge },
    { key: 'action',    label: t('行动', 'ACTION'),    time: '~20 sec', key_badge: false, text: tp.action },
    { key: 'result',    label: t('成果', 'RESULT'),    time: '~10 sec', key_badge: true,  text: tp.result },
  ]
  return `
  <div class="tp-section" id="tp-section-${bullet.id}">
    <div class="si-section-hd">
      <div class="bh-section-label" style="margin:0">📋 ${t('谈话要点', 'Talking Points')}</div>
      <div style="display:flex;gap:6px">
        <button class="btn-sec" id="tp-prac-btn-${bullet.id}"
          onclick="toggleTalkingPointsPractice('${bullet.id}')">🎭 ${t('练习', 'Practice')}</button>
        <button class="btn-sec" onclick="generateTalkingPoints('${resume.id}','${bullet.id}')">↺ ${t('重新生成', 'Regenerate')}</button>
      </div>
    </div>
    ${ctxSection}
    ${parts.map(p => `
    <div class="tp-card ${p.key_badge ? 'tp-card-key' : ''}">
      <div class="tp-card-header">
        <span class="si-card-label">${p.label}</span>
        ${p.key_badge ? `<span class="tp-key-badge">⭐ ${t('重点', 'KEY')}</span>` : ''}
        <span class="si-card-time">${p.time}</span>
        <button class="si-edit-btn" onclick="editTalkingPoint('${resume.id}','${bullet.id}','${p.key}')">✎</button>
        <button class="si-edit-btn" onclick="toggleTpQa('${bullet.id}','${p.key}')" title="${t('提问', 'Ask')}">💬</button>
      </div>
      <div class="tp-card-text" id="tp-text-${bullet.id}-${p.key}">${esc(p.text || '')}</div>
      <div class="tp-practice-cue">${_tpCue(p.key)}</div>
      ${_tpQaSection(resume, bullet, p.key)}
    </div>`).join('')}
    ${_tpEvalSection(resume, bullet)}
  </div>`
}

export async function generateTalkingPoints(resumeId, bulletId) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  const bullet = resume?.bullets.find(b => b.id === bulletId)
  if (!bullet) return
  showLoading(t('正在生成谈话要点…', 'Generating talking points…'), t('Claude 正在为该经历生成 SCAR 框架', 'Claude is creating a SCAR framework for this experience'))
  try {
    const sys = `You are an SDE II interview coach. Generate 4 SCAR talking points for this specific experience bullet.

SITUATION (5 sec): 1-2 sentences of context — company, team size, project scope. Keep SHORT.
CHALLENGE (10 sec, MOST IMPORTANT): What was genuinely hard, ambiguous, or high-stakes? Go deep. What made it technically or organizationally difficult? Do NOT gloss over — this is what interviewers remember most.
ACTION (20 sec): What did YOU specifically do? Use "I" not "we". Name your decisions, tradeoffs, and approaches. 3-4 sentences.
RESULT (10 sec): Measurable outcomes and business impact. Numbers and scale. Any long-term influence.

Return ONLY valid JSON: {"stage":"...","challenge":"...","action":"...","result":"..."}
Write in conversational first-person prose. Emphasize challenge and individual contribution; minimize team context.`
    const raw = await claudeJSON(sys, `Role: ${bullet.role}\nExperience bullet: "${bullet.text}"${_buildContextStr(bullet)}`, 1000, '{')
    const tp = JSON.parse(raw)
    bullet.talkingPoints = { stage: tp.stage || '', challenge: tp.challenge || '', action: tp.action || '', result: tp.result || '' }
  } catch (e) {
    alert(t('生成失败：', 'Generation failed: ') + (e?.message || String(e)))
  }
  save()
  if (state.bhBulletId === bulletId) renderBulletDetail()
}

export function editTalkingPoint(resumeId, bulletId, part) {
  const bh = getBh()
  const bullet = bh.resumes.find(r => r.id === resumeId)?.bullets.find(b => b.id === bulletId)
  if (!bullet?.talkingPoints) return
  const el = document.getElementById(`tp-text-${bulletId}-${part}`)
  if (!el) return
  el.outerHTML = `<div id="tp-edit-${bulletId}-${part}">
    <textarea class="answer-textarea" id="tp-ta-${bulletId}-${part}"
      style="margin-top:4px;resize:vertical;min-height:80px"
      oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
    >${esc(bullet.talkingPoints[part] || '')}</textarea>
    <div style="display:flex;gap:6px;margin-top:4px">
      <button class="btn-sec" onclick="renderBulletDetail()">✕ ${t('取消', 'Cancel')}</button>
      <button class="btn-primary" onclick="saveTalkingPoint('${resumeId}','${bulletId}','${part}')">✓ ${t('保存', 'Save')}</button>
    </div>
  </div>`
  const ta = document.getElementById(`tp-ta-${bulletId}-${part}`)
  if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.focus() }
}

export function saveTalkingPoint(resumeId, bulletId, part) {
  const ta = document.getElementById(`tp-ta-${bulletId}-${part}`)
  if (!ta) return
  const bh = getBh()
  const bullet = bh.resumes.find(r => r.id === resumeId)?.bullets.find(b => b.id === bulletId)
  if (!bullet?.talkingPoints) return
  bullet.talkingPoints[part] = ta.value
  save()
  renderBulletDetail()
}

export function toggleTalkingPointsPractice(bulletId) {
  const section = document.getElementById(`tp-section-${bulletId}`)
  const btn = document.getElementById(`tp-prac-btn-${bulletId}`)
  if (!section) return
  const active = section.classList.toggle('tp-practice-active')
  if (btn) btn.textContent = active
    ? `👁 ${t('显示脚本', 'Show Script')}`
    : `🎭 ${t('练习', 'Practice')}`
}

// ── Speech Skeleton ───────────────────────────────────────────────────────────

function _renderSkeletonContent(text) {
  if (!text) return ''
  return text.split('\n').map(raw => {
    const line = raw.trimEnd()
    if (!line.trim()) return ''
    // Section header: lines starting with ## (after trim)
    if (line.trimStart().startsWith('## ')) {
      const content = line.trimStart().slice(3)
      const isKey = content.includes('⭐')
      return `<div class="sk-hd${isKey ? ' sk-hd-key' : ''}">${esc(content)}</div>`
    }
    // Arrow bullets — detect nesting by leading spaces
    if (line.trimStart().startsWith('→') || line.trimStart().startsWith('• ')) {
      const indent = line.length - line.trimStart().length
      const content = line.trimStart().replace(/^[→•]\s*/, '')
      const lvl = indent >= 4 ? 2 : indent >= 2 ? 1 : 0
      return `<div class="sk-item sk-item-${lvl}"><span class="sk-arrow">→</span><span>${esc(content)}</span></div>`
    }
    // Fallback: treat as section header
    const isKey = line.trim().includes('⭐')
    return `<div class="sk-hd${isKey ? ' sk-hd-key' : ''}">${esc(line.trim())}</div>`
  }).join('')
}

function _skPane(resume, bullet, mode) {
  const key = mode === 'quick' ? 'speechSkeletonQuick' : 'speechSkeletonDeep'
  // backward compat: old `speechSkeleton` treated as quick
  const content = bullet[key] || (mode === 'quick' ? bullet.speechSkeleton : null)
  const btnId = content ? `sk-regen-${mode}-${bullet.id}` : `sk-gen-${mode}-${bullet.id}`
  const btnLabel = content
    ? `↺ ${t('重新生成', 'Regenerate')}`
    : mode === 'quick'
      ? `⚡ ${t('生成简版', 'Generate Quick (~1-2 min)')}`
      : `🌲 ${t('生成深度版', 'Generate Deep Dive (~10 min)')}`
  return `<div class="sk-tab-pane" id="sk-pane-${mode}-${bullet.id}">
    ${content ? `<div class="sk-content" id="sk-content-${mode}-${bullet.id}">${_renderSkeletonContent(content)}</div>` : ''}
    <div class="sk-actions">
      <button class="btn-sec" style="font-size:11px" id="${btnId}"
        onclick="event.stopPropagation();generateSpeechSkeleton('${resume.id}','${bullet.id}','${mode}')">${btnLabel}</button>
    </div>
  </div>`
}

function _renderSpeechSkeletonSection(resume, bullet) {
  const hasQuick = !!(bullet.speechSkeletonQuick || bullet.speechSkeleton)
  const hasDeep  = !!bullet.speechSkeletonDeep
  const hasAny = hasQuick || hasDeep

  // Set default tab
  if (!_skTab[bullet.id]) _skTab[bullet.id] = hasQuick ? 'quick' : 'deep'
  const activeTab = _skTab[bullet.id]
  const collapsed = _skCollapsed.has(bullet.id)

  if (!hasAny) {
    // Nothing generated yet — show intro + two generate buttons
    return `
    <div class="sk-section hm-section${collapsed ? ' hm-collapsed' : ''}" id="sk-section-${bullet.id}">
      <div class="hm-section-hd" onclick="toggleSkeleton('${bullet.id}')">
        <div class="bh-section-label" style="margin:0">🎤 ${t('口语框架', 'Speech Skeleton')}</div>
        <span class="hm-toggle-icon">${collapsed ? '▸' : '▾'}</span>
      </div>
      <div class="hm-section-body">
        <p class="si-hint" style="margin-bottom:10px">${t(
          '生成口语讲述骨架，帮助您在深度面试中有条理地展开这段经历。',
          'Generate a spoken outline for walking through this experience in a hiring manager deep dive.')}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-sec" id="sk-gen-quick-${bullet.id}"
            onclick="event.stopPropagation();generateSpeechSkeleton('${resume.id}','${bullet.id}','quick')">
            ⚡ ${t('简版 (~1-2 分钟)', 'Quick (~1-2 min)')}
          </button>
          <button class="btn-primary" id="sk-gen-deep-${bullet.id}"
            onclick="event.stopPropagation();generateSpeechSkeleton('${resume.id}','${bullet.id}','deep')">
            🌲 ${t('深度版 (~10 分钟)', 'Deep Dive (~10 min)')}
          </button>
        </div>
      </div>
    </div>`
  }

  return `
  <div class="sk-section hm-section${collapsed ? ' hm-collapsed' : ''}" id="sk-section-${bullet.id}">
    <div class="hm-section-hd" onclick="toggleSkeleton('${bullet.id}')">
      <div class="bh-section-label" style="margin:0">🎤 ${t('口语框架', 'Speech Skeleton')}</div>
      <span class="hm-toggle-icon">${collapsed ? '▸' : '▾'}</span>
    </div>
    <div class="hm-section-body">
      <div class="sk-tabs">
        <button class="sk-tab-btn${activeTab === 'quick' ? ' sk-tab-active' : ''}" data-mode="quick"
          onclick="event.stopPropagation();switchSkTab('${bullet.id}','quick')">⚡ ${t('简版', 'Quick')}</button>
        <button class="sk-tab-btn${activeTab === 'deep' ? ' sk-tab-active' : ''}" data-mode="deep"
          onclick="event.stopPropagation();switchSkTab('${bullet.id}','deep')">🌲 ${t('深度版', 'Deep Dive')}</button>
      </div>
      <div id="sk-tabs-body-${bullet.id}">
        ${_skPane(resume, bullet, activeTab)}
      </div>
    </div>
  </div>`
}

export function switchSkTab(bulletId, mode) {
  _skTab[bulletId] = mode
  // Update tab button active states without full re-render
  const section = document.getElementById(`sk-section-${bulletId}`)
  if (!section) return
  section.querySelectorAll('.sk-tab-btn').forEach(btn => {
    btn.classList.toggle('sk-tab-active', btn.dataset.mode === mode)
  })
  // Re-render just the tab body
  const bh = getBh()
  const resume = bh.resumes.find(r => r.bhBulletId === bulletId || r.bullets?.some(b => b.id === bulletId))
  const bullet = resume?.bullets.find(b => b.id === bulletId)
  if (!bullet) return
  const body = document.getElementById(`sk-tabs-body-${bulletId}`)
  if (body) body.innerHTML = _skPane(resume, bullet, mode)
}

const _SK_QUICK_SYS = `You are an expert SDE II interview coach. Generate a QUICK speech skeleton (1-2 min reference card) for walking through this experience.

Use this EXACT hierarchical format — no other format:
## SECTION TITLE (~Xs)
→ top-level point (one short phrase)
  → sub-point (2 leading spaces then →)

Required sections:
## HOOK (~15s)
→ One sentence: what you built + why it mattered
→ Scale or team context (1 phrase)

## KEY CHALLENGE ⭐ (~30s)
→ What was genuinely hard (name the core difficulty)
  → Why existing approaches didn't work
  → The key insight or choice that solved it

## WHAT I DID (~30s)
→ Your specific ownership (use "I")
→ Most important technical decision you made
  → The tradeoff you navigated

## RESULT ⭐ (~20s)
→ Primary outcome with numbers (before/after if possible)
→ Downstream or organizational impact

## OFFER DEPTH (~5s)
→ "Happy to go deeper on [most interesting part]…"

Be specific to THIS bullet. First-person. Each → point is ONE short phrase or sentence — this is a glance-card, not a script.`

const _SK_DEEP_SYS = `You are an expert SDE II interview coach. Generate a COMPREHENSIVE speech skeleton for a 10-minute hiring manager deep dive on this experience. Think like a directory tree — sections branch into sub-points which branch into specifics.

Use this EXACT hierarchical format (3 levels):
## SECTION TITLE ⭐ (~Xmin)   ← mark ⭐ on the 2 most critical sections
→ top-level point
  → sub-point (2 leading spaces then →)
    → specific detail or example (4 leading spaces then →)

Required sections:

## OVERVIEW (~30s)
→ One-liner: problem + solution + your role
→ Scale/scope (team size, usage, systems affected)

## MOTIVATION & CONTEXT (~1.5min)
→ Business/team reason this was needed
  → What was broken or painful before
  → Why the previous approach hit its limit
→ Technical constraints you were working within

## KEY CHALLENGES ⭐ (~2.5min)
→ Challenge 1: [give it a name]
  → What made it technically hard
  → Approaches you considered
    → Why approach A didn't work
    → What you chose and the core insight
→ Challenge 2: [give it a name]
  → [same depth of analysis]

## ARCHITECTURE & DESIGN DECISIONS ⭐ (~3min)
→ High-level design (name the main components)
  → Component 1: what it does + why you built it this way
  → Component 2: what it does + why
→ Key design decision: [name it]
  → What you chose
  → Why (technical rationale)
  → Tradeoff you consciously accepted
→ What you explicitly decided NOT to do (and why it was right)

## YOUR SPECIFIC CONTRIBUTION (~1.5min)
→ What you personally owned/designed/built (use "I" not "we")
→ Your most complex technical contribution
  → Specific detail that shows depth
→ How you drove alignment or made the hard call

## RESULTS & IMPACT (~45s)
→ Primary metric (with before/after numbers if possible)
→ Secondary metric or adoption data
→ What it unblocked or enabled for the team/org

## FOLLOW-UP HOOKS (~30s)
→ "I can go deeper on [most interesting design decision]"
→ "Worth discussing [a tradeoff or learning] if helpful"
→ "Happy to walk through [likely probe area] in detail"

Fill in REAL, SPECIFIC content from the candidate's experience. Write as coaching notes in first-person, technical, conversational style. Where numbers are unknown, write [add metric here] so candidate knows to fill it in.`

export async function generateSpeechSkeleton(resumeId, bulletId, mode = 'quick') {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  const bullet = resume?.bullets.find(b => b.id === bulletId)
  if (!bullet) return

  _skTab[bulletId] = mode

  // Show loading on the right button
  const btnId = (bullet[mode === 'quick' ? 'speechSkeletonQuick' : 'speechSkeletonDeep'] || (mode === 'quick' && bullet.speechSkeleton))
    ? `sk-regen-${mode}-${bulletId}`
    : `sk-gen-${mode}-${bulletId}`
  const btn = document.getElementById(btnId)
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin-icon">⟳</span> ${t('生成中…', 'Generating…')}` }

  const contentId = `sk-content-${mode}-${bulletId}`
  const existingContent = document.getElementById(contentId)
  if (existingContent) existingContent.innerHTML = `<div class="sk-streaming"><span class="spin-icon">⟳</span></div>`

  const sys = mode === 'deep' ? _SK_DEEP_SYS : _SK_QUICK_SYS
  const tpStr = bullet.talkingPoints
    ? `\n\nSITUATION: ${bullet.talkingPoints.stage}\nCHALLENGE: ${bullet.talkingPoints.challenge}\nACTION: ${bullet.talkingPoints.action}\nRESULT: ${bullet.talkingPoints.result}`
    : ''
  const userMsg = `Role: ${bullet.role}\nExperience bullet: "${bullet.text}"${tpStr}${_buildContextStr(bullet)}`

  let generated = ''
  try {
    generated = await claudeStream(sys, userMsg, mode === 'deep' ? 1200 : 600, (accumulated) => {
      const el = document.getElementById(contentId)
      if (el) el.textContent = accumulated
    })
  } catch (e) {
    alert(t('生成失败：', 'Generation failed: ') + (e?.message || String(e)))
    return
  }

  if (mode === 'quick') {
    bullet.speechSkeletonQuick = generated
    // migrate old field
    if (bullet.speechSkeleton) delete bullet.speechSkeleton
  } else {
    bullet.speechSkeletonDeep = generated
  }
  save()
  if (state.bhBulletId === bulletId) renderBulletDetail()
}

export function toggleSkeleton(bulletId) {
  const section = document.getElementById(`sk-section-${bulletId}`)
  if (!section) return
  const collapsed = section.classList.toggle('hm-collapsed')
  const icon = section.querySelector('.hm-toggle-icon')
  if (icon) icon.textContent = collapsed ? '▸' : '▾'
  if (collapsed) _skCollapsed.add(bulletId); else _skCollapsed.delete(bulletId)
}

// ── Knowledge context picker ──────────────────────────────────────────────────

export function toggleTpCtxPicker(bulletId) {
  const picker = document.getElementById(`tp-ctx-picker-${bulletId}`)
  if (!picker) return
  picker.style.display = picker.style.display === 'none' ? 'block' : 'none'
}

export function selectTpCtx(resumeId, bulletId, chapterId) {
  const bh = getBh()
  const bullet = bh.resumes.find(r => r.id === resumeId)?.bullets.find(b => b.id === bulletId)
  if (!bullet) return
  if (bullet.tpContextId) { bullet.tpContextIds = [bullet.tpContextId]; delete bullet.tpContextId }
  if (!bullet.tpContextIds) bullet.tpContextIds = []
  const idx = bullet.tpContextIds.indexOf(chapterId)
  if (idx === -1) bullet.tpContextIds.push(chapterId)
  else bullet.tpContextIds.splice(idx, 1)
  save()
  renderBulletDetail()
}

export function clearTpCtx(resumeId, bulletId, chapterId) {
  const bh = getBh()
  const bullet = bh.resumes.find(r => r.id === resumeId)?.bullets.find(b => b.id === bulletId)
  if (!bullet) return
  if (chapterId) {
    bullet.tpContextIds = (bullet.tpContextIds || []).filter(id => id !== chapterId)
  } else {
    delete bullet.tpContextIds; delete bullet.tpContextId
  }
  save()
  renderBulletDetail()
}

// ── Talking point inline Q&A ──────────────────────────────────────────────────

export function toggleTpQa(bulletId, part) {
  const area = document.getElementById(`tp-qa-${bulletId}-${part}`)
  if (!area) return
  const key = `${bulletId}_${part}`
  if (area.style.display === 'none') {
    area.style.display = 'block'
    _tpQaCollapsed.delete(key)
  } else {
    area.style.display = 'none'
    _tpQaCollapsed.add(key)
  }
}

export function clearTpQa(resumeId, bulletId, part) {
  const bh = getBh()
  const bullet = bh.resumes.find(r => r.id === resumeId)?.bullets.find(b => b.id === bulletId)
  if (!bullet?.tpQaHistory?.[part]) return
  delete bullet.tpQaHistory[part]
  if (Object.keys(bullet.tpQaHistory).length === 0) delete bullet.tpQaHistory
  save()
  // Close the panel since history is gone
  _tpQaCollapsed.add(`${bulletId}_${part}`)
  renderBulletDetail()
}

export function sendTpPreset(resumeId, bulletId, part, presetKey) {
  const question = _TP_PRESET_QUESTIONS[presetKey]
  if (question) _doTpQuestion(resumeId, bulletId, part, question)
}

export function sendTpQuestion(resumeId, bulletId, part) {
  const input = document.getElementById(`tp-qa-input-${bulletId}-${part}`)
  if (!input) return
  const question = input.value.trim()
  if (!question) return
  input.value = ''
  _doTpQuestion(resumeId, bulletId, part, question)
}

async function _doTpQuestion(resumeId, bulletId, part, question) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  const bullet = resume?.bullets.find(b => b.id === bulletId)
  if (!bullet?.talkingPoints) return
  const answersEl = document.getElementById(`tp-qa-answers-${bulletId}-${part}`)
  if (!answersEl) return
  const qId = uid()
  answersEl.insertAdjacentHTML('beforeend', `
    <div class="tp-qa-entry">
      <div class="tp-qa-q">${esc(question)}</div>
      <div class="tp-qa-a stream-active" id="tp-qa-a-${qId}"><span class="spin-icon">⟳</span></div>
    </div>`)
  answersEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  const contextStr = _buildContextStr(bullet)
  const partNames = { stage: 'SITUATION', challenge: 'CHALLENGE', action: 'ACTION', result: 'RESULT' }
  const sys = `You are an expert SDE II interview coach. Give a short, direct answer (2-4 sentences max) to the candidate's specific question about their ${partNames[part] || part} talking point. Be concrete and actionable. No preamble, no sign-off.`
  const convHistory = _buildConvHistory(bullet.tpQaHistory?.[part])
  const histLabel = convHistory ? `\n\nConversation so far:\n${convHistory}\n\nFollow-up question` : '\nQuestion'
  const userMsg = `Experience bullet: "${bullet.text}"\nRole: ${bullet.role}\n${partNames[part]}: "${bullet.talkingPoints[part]}"${contextStr}${histLabel}: ${question}`
  let finalAnswer = ''
  try {
    await claudeStream(sys, userMsg, 300, (accumulated) => {
      finalAnswer = accumulated
      const el = document.getElementById(`tp-qa-a-${qId}`)
      if (el) el.textContent = accumulated
    })
    // Persist Q&A to state
    if (finalAnswer) {
      if (!bullet.tpQaHistory) bullet.tpQaHistory = {}
      if (!bullet.tpQaHistory[part]) bullet.tpQaHistory[part] = []
      bullet.tpQaHistory[part].push({ q: question, a: finalAnswer })
      save()
    }
  } catch (_) {
    const el = document.getElementById(`tp-qa-a-${qId}`)
    if (el) el.textContent = t('生成失败', 'Failed to generate answer')
  }
}

// ── Evaluate talking points ───────────────────────────────────────────────────

export async function evaluateTalkingPoints(resumeId, bulletId) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  const bullet = resume?.bullets.find(b => b.id === bulletId)
  if (!bullet?.talkingPoints) return
  const evalArea = document.getElementById(`tp-eval-area-${bulletId}`)
  const btn = evalArea?.querySelector('button')
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin-icon">⟳</span> ${t('评估中…', 'Evaluating…')}` }
  const resultEl = document.getElementById(`tp-eval-result-${bulletId}`)
  if (resultEl) resultEl.innerHTML = `<div class="ans-result-box ans-feedback" style="margin-top:10px">
    <div class="ans-result-hd"><div class="ans-result-label">📊 ${t('谈话要点评估', 'Talking Points Evaluation')}</div></div>
    <div class="ans-result-text stream-active" id="tp-eval-text-${bulletId}"></div>
  </div>`
  const tp = bullet.talkingPoints
  const sys = `You are an SDE II interview coach evaluating a candidate's SCAR talking points. Give honest, actionable feedback in 3 labeled bullet points:
• Strengths: what works well (good specificity, strong challenge framing, clear individual contribution, concrete metrics)
• Gaps: what's weak or missing (vague language, weak challenge depth, "we" instead of "I", missing numbers, over-explaining context)
• Verdict: one sentence — does this sound SDE II-level, and what's the #1 thing to fix?
Be direct and specific. No preamble.`
  const userMsg = `Experience bullet: "${bullet.text}"\nRole: ${bullet.role}\n\nSITUATION: ${tp.stage}\nCHALLENGE: ${tp.challenge}\nACTION: ${tp.action}\nRESULT: ${tp.result}`
  try {
    await claudeStream(sys, userMsg, 400, (accumulated) => {
      const el = document.getElementById(`tp-eval-text-${bulletId}`)
      if (el) el.textContent = accumulated
    })
  } catch (_) {
    const el = document.getElementById(`tp-eval-text-${bulletId}`)
    if (el) el.textContent = t('评估失败', 'Evaluation failed')
  }
  if (btn) { btn.disabled = false; btn.innerHTML = `📊 ${t('评估我的谈话要点', 'Evaluate My Talking Points')}` }
}

// ── Collapsible HM section ────────────────────────────────────────────────────

export function toggleHmSection(bulletId) {
  const section = document.getElementById(`hm-section-${bulletId}`)
  if (!section) return
  const collapsed = section.classList.toggle('hm-collapsed')
  const icon = section.querySelector('.hm-toggle-icon')
  if (icon) icon.textContent = collapsed ? '▸' : '▾'
  if (collapsed) _hmCollapsed.add(bulletId); else _hmCollapsed.delete(bulletId)
}

// ── Build Resume from Bullet Points (Page 5) ─────────────────────────────────

function renderBuildResumeView() {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === state.bhResumeId)
  if (!resume) { state.bhBuildResumeView = false; renderBhResume(); return }

  // Group bullets by role
  const groups = {}
  ;(resume.bullets || []).forEach(b => {
    if (!groups[b.role]) groups[b.role] = []
    groups[b.role].push(b)
  })

  const bulletRows = Object.entries(groups).map(([role, bullets]) => `
    <div class="build-role-hd">${esc(role)}</div>
    ${bullets.map(b => `
      <div class="build-bullet-row" id="build-brow-${b.id}">
        <button class="build-edit-btn" onclick="editBuildBullet('${resume.id}','${b.id}')" title="${t('编辑', 'Edit')}">✎</button>
        <div class="build-bullet-text" id="build-btext-${b.id}">${esc(b.text)}</div>
      </div>`).join('')}`).join('')

  // Template chips
  const templates = bh.resumeTemplates || []
  const noTmplActive = !_buildSelectedTemplateId
  const tmplChips = [
    `<button class="build-tmpl-chip${noTmplActive ? ' active' : ''}" onclick="selectBuildTemplate(null)">${t('无模板', 'No Template')}</button>`,
    ...templates.map(tmpl => `
      <button class="build-tmpl-chip${_buildSelectedTemplateId === tmpl.id ? ' active' : ''}"
        onclick="selectBuildTemplate('${tmpl.id}')">${esc(tmpl.name)}
        <span class="build-tmpl-del" onclick="event.stopPropagation();deleteTemplate('${tmpl.id}')" title="${t('删除', 'Delete')}">✕</span>
      </button>`),
    `<button class="build-tmpl-chip build-tmpl-add${_buildShowAddTemplate ? ' active' : ''}"
      onclick="toggleAddTemplate()">+ ${t('新建模板', 'New Template')}</button>`
  ].join('')

  const addTemplateForm = _buildShowAddTemplate ? `
    <div class="build-tmpl-form">
      <input class="build-tmpl-name-input" id="build-tmpl-name" placeholder="${t('模板名称…', 'Template name…')}" style="margin-bottom:8px">
      <textarea class="answer-textarea" id="build-tmpl-content" rows="8"
        placeholder="${t('在此粘贴完整简历（AI 将提取其结构和写作风格）…', 'Paste your full resume here (AI will extract its structure and writing style)…')}"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-sec" onclick="toggleAddTemplate()">✕ ${t('取消', 'Cancel')}</button>
        <button class="btn-primary" onclick="saveNewTemplate()">✓ ${t('保存模板', 'Save Template')}</button>
      </div>
    </div>` : ''

  // Generate button + output
  const hasOutput = !!resume.lastGeneratedResume?.content
  const outputSection = hasOutput ? `
    <div class="build-output-box">
      <div class="build-output-label">
        ${t('已生成简历', 'Generated Resume')}
        ${resume.lastGeneratedResume.templateId
          ? ` · ${esc(templates.find(t => t.id === resume.lastGeneratedResume.templateId)?.name || '')}`
          : ''}
        <span class="build-output-date">${new Date(resume.lastGeneratedResume.generatedAt).toLocaleDateString()}</span>
      </div>
      <pre class="build-output-text" id="build-output-${resume.id}">${esc(resume.lastGeneratedResume.content)}</pre>
      <div class="build-output-actions">
        <button class="btn-sec" onclick="copyBuiltResume('${resume.id}')">📋 ${t('复制', 'Copy')}</button>
        <button class="btn-sec" onclick="saveResumeVersion('${resume.id}')">💾 ${t('保存版本', 'Save Version')}</button>
      </div>
    </div>` : `<div id="build-output-${resume.id}"></div>`

  // Saved versions
  const savedVersions = (resume.savedResumes || []).slice().reverse()
  const versionsSection = savedVersions.length > 0 ? `
    <div class="build-versions-section">
      <div class="bh-section-label" style="margin-bottom:10px">📚 ${t('已保存版本', 'Saved Versions')}</div>
      ${savedVersions.map(v => {
        const tmplName = v.templateId ? (templates.find(tmpl => tmpl.id === v.templateId)?.name || '') : t('无模板', 'No Template')
        const isExpanded = _buildExpandedVersionId === v.id
        return `
        <div class="build-version-item">
          <div class="build-version-hd">
            <span class="build-version-label">${esc(v.name)} · ${tmplName} · ${new Date(v.generatedAt).toLocaleDateString()}</span>
            <div style="display:flex;gap:6px">
              <button class="btn-sec" style="font-size:11px" onclick="toggleResumeVersion('${v.id}')">${isExpanded ? '▾' : '▸'}</button>
              <button class="btn-sec" style="font-size:11px" onclick="copyVersionContent('${resume.id}','${v.id}')">📋</button>
              <button class="btn-sec" style="font-size:11px;color:var(--muted)" onclick="deleteResumeVersion('${resume.id}','${v.id}')">🗑</button>
            </div>
          </div>
          ${isExpanded ? `<pre class="build-version-body">${esc(v.content)}</pre>` : ''}
        </div>`
      }).join('')}
    </div>` : ''

  document.getElementById('mainContent').innerHTML = `
    ${resumeHeader()}
    <div class="build-view">
      <div class="bh-nav-row">
        <button class="bh-back-btn" onclick="backFromBuildResume()">← ${t('返回简历', 'Back to Resume')}</button>
        <span class="bh-breadcrumb">${esc(resume.name)}</span>
      </div>
      <div class="bh-section-label" style="margin-bottom:16px">📄 ${t('生成新简历', 'Build Updated Resume')}</div>

      <div class="build-step">
        <div class="build-step-hd">${t('第一步：审查并编辑经历要点', 'Step 1: Review & Edit Bullets')}</div>
        <p class="si-hint">${t('直接编辑要点内容，修改会同步到面试准备区。', 'Edits sync to your interview prep data.')}</p>
        <div class="build-bullet-list">${bulletRows}</div>
      </div>

      <div class="build-step">
        <div class="build-step-hd">${t('第二步：选择简历模板', 'Step 2: Choose Template')}</div>
        <p class="si-hint">${t('粘贴一份现有简历作为格式模板，AI 将保持相同结构和风格。', 'Paste an existing resume as a format template. AI mirrors its structure and style.')}</p>
        <div class="build-tmpl-chips">${tmplChips}</div>
        ${addTemplateForm}
      </div>

      <div class="build-step">
        <div class="build-step-hd">${t('第三步：生成更新后的简历', 'Step 3: Generate')}</div>
        <button class="btn-primary" id="build-gen-btn-${resume.id}"
          onclick="generateBuiltResume('${resume.id}')">
          🚀 ${t('生成新简历', 'Generate Updated Resume')}
        </button>
        ${outputSection}
      </div>

      ${versionsSection}
    </div>`
}

export function openBuildResume(resumeId) {
  state.bhResumeId = resumeId
  state.bhBuildResumeView = true
  _buildSelectedTemplateId = null
  _buildShowAddTemplate = false
  _buildExpandedVersionId = null
  renderBhResume()
}

export function backFromBuildResume() {
  state.bhBuildResumeView = false
  renderBhResume()
}

export function editBuildBullet(resumeId, bulletId) {
  const bh = getBh()
  const bullet = bh.resumes.find(r => r.id === resumeId)?.bullets.find(b => b.id === bulletId)
  if (!bullet) return
  const row = document.getElementById(`build-brow-${bulletId}`)
  if (!row) return
  row.innerHTML = `
    <div style="width:100%">
      <textarea class="answer-textarea" id="build-bta-${bulletId}"
        style="resize:vertical;min-height:60px"
        oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
      >${esc(bullet.text)}</textarea>
      <div style="display:flex;gap:6px;margin-top:4px">
        <button class="btn-sec" onclick="renderBuildResumeView()">✕ ${t('取消', 'Cancel')}</button>
        <button class="btn-primary" onclick="saveBuildBullet('${resumeId}','${bulletId}')">✓ ${t('保存', 'Save')}</button>
      </div>
    </div>`
  const ta = document.getElementById(`build-bta-${bulletId}`)
  if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.focus() }
}

export function saveBuildBullet(resumeId, bulletId) {
  const ta = document.getElementById(`build-bta-${bulletId}`)
  if (!ta) return
  const bh = getBh()
  const bullet = bh.resumes.find(r => r.id === resumeId)?.bullets.find(b => b.id === bulletId)
  if (!bullet) return
  bullet.text = ta.value
  save()
  renderBuildResumeView()
}

export function selectBuildTemplate(templateId) {
  _buildSelectedTemplateId = templateId
  _buildShowAddTemplate = false
  renderBuildResumeView()
}

export function toggleAddTemplate() {
  _buildShowAddTemplate = !_buildShowAddTemplate
  renderBuildResumeView()
}

export function saveNewTemplate() {
  const name    = document.getElementById('build-tmpl-name')?.value.trim()
  const content = document.getElementById('build-tmpl-content')?.value.trim()
  if (!name || !content) { alert(t('请填写模板名称和内容', 'Please provide a template name and content')); return }
  const bh = getBh()
  const tmpl = { id: uid(), name, content, createdAt: new Date().toISOString() }
  bh.resumeTemplates.push(tmpl)
  _buildSelectedTemplateId = tmpl.id
  _buildShowAddTemplate = false
  save()
  renderBuildResumeView()
}

export function deleteTemplate(templateId) {
  const bh = getBh()
  bh.resumeTemplates = bh.resumeTemplates.filter(t => t.id !== templateId)
  if (_buildSelectedTemplateId === templateId) _buildSelectedTemplateId = null
  save()
  renderBuildResumeView()
}

export async function generateBuiltResume(resumeId) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  if (!resume) return

  const btn = document.getElementById(`build-gen-btn-${resumeId}`)
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin-icon">⟳</span> ${t('生成中…', 'Generating…')}` }

  // Ensure output div exists
  const outputArea = document.getElementById(`build-output-${resumeId}`)
  if (outputArea) {
    outputArea.outerHTML = `<div class="build-output-box">
      <div class="build-output-label">${t('正在生成…', 'Generating…')}</div>
      <pre class="build-output-text stream-active" id="build-output-${resumeId}"></pre>
    </div>`
  }

  // Build bullets-by-role string
  const groups = {}
  ;(resume.bullets || []).forEach(b => {
    if (!groups[b.role]) groups[b.role] = []
    groups[b.role].push(b.text)
  })
  const bulletsByRole = Object.entries(groups)
    .map(([role, bullets]) => `${role}\n${bullets.map(bt => `• ${bt}`).join('\n')}`)
    .join('\n\n')

  const template = bh.resumeTemplates.find(t => t.id === _buildSelectedTemplateId)

  const sys = template
    ? `You are an expert resume writer for SDE II Software Engineer candidates.
Rewrite the candidate's resume to exactly match the FORMAT of the provided template, using their updated experience bullets as content.

TEMPLATE FORMAT (mirror this structure, section order, bullet length, and writing style exactly):
${template.content}

Instructions:
- Mirror the template's sections, ordering, and bullet writing conventions exactly
- Lead each bullet with a strong action verb; preserve all metrics and scale
- Keep all technical vocabulary and specifics; do NOT fabricate information
- Infer Skills/Education sections from the template structure and bullet content
Return the complete, ready-to-use resume text in the same format as the template.`
    : `You are an expert resume writer. Generate a polished, SDE II-optimized SWE resume using these experience bullets.
Use standard FAANG resume format: strong action verbs, metrics-focused, ATS-friendly, reverse-chronological.
Include a Skills section inferred from the bullet content.
Return complete, ready-to-use resume text.`

  const userMsg = `CANDIDATE'S EXPERIENCE (organized by role):\n${bulletsByRole}`

  let generated = ''
  try {
    generated = await claudeStream(sys, userMsg, 3000, (accumulated) => {
      const el = document.getElementById(`build-output-${resumeId}`)
      if (el) el.textContent = accumulated
    })
  } catch (e) {
    const el = document.getElementById(`build-output-${resumeId}`)
    if (el) el.textContent = t('生成失败', 'Generation failed')
    if (btn) { btn.disabled = false; btn.innerHTML = `🚀 ${t('生成新简历', 'Generate Updated Resume')}` }
    return
  }

  resume.lastGeneratedResume = {
    content: generated,
    templateId: _buildSelectedTemplateId || null,
    generatedAt: new Date().toISOString()
  }
  save()
  renderBuildResumeView()
}

export function copyBuiltResume(resumeId) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  if (!resume?.lastGeneratedResume?.content) return
  navigator.clipboard.writeText(resume.lastGeneratedResume.content)
    .then(() => { const btn = event.target; const orig = btn.textContent; btn.textContent = '✓'; setTimeout(() => { btn.textContent = orig }, 1500) })
    .catch(() => alert(t('复制失败', 'Copy failed')))
}

export function copyVersionContent(resumeId, versionId) {
  const bh = getBh()
  const v = bh.resumes.find(r => r.id === resumeId)?.savedResumes?.find(sv => sv.id === versionId)
  if (!v?.content) return
  navigator.clipboard.writeText(v.content)
    .then(() => { const btn = event.target; const orig = btn.textContent; btn.textContent = '✓'; setTimeout(() => { btn.textContent = orig }, 1500) })
    .catch(() => alert(t('复制失败', 'Copy failed')))
}

export function saveResumeVersion(resumeId) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  if (!resume?.lastGeneratedResume?.content) return
  const tmpl = bh.resumeTemplates.find(t => t.id === resume.lastGeneratedResume.templateId)
  const defaultName = tmpl ? tmpl.name : t('自定义', 'Custom')
  const name = window.prompt(t('版本名称（可直接回车使用默认值）：', 'Version name (press Enter for default):'), defaultName)
  if (name === null) return // user cancelled
  if (!resume.savedResumes) resume.savedResumes = []
  resume.savedResumes.push({
    id: uid(),
    name: name || defaultName,
    content: resume.lastGeneratedResume.content,
    templateId: resume.lastGeneratedResume.templateId,
    generatedAt: resume.lastGeneratedResume.generatedAt
  })
  save()
  renderBuildResumeView()
}

export function deleteResumeVersion(resumeId, versionId) {
  const bh = getBh()
  const resume = bh.resumes.find(r => r.id === resumeId)
  if (!resume?.savedResumes) return
  resume.savedResumes = resume.savedResumes.filter(v => v.id !== versionId)
  if (_buildExpandedVersionId === versionId) _buildExpandedVersionId = null
  save()
  renderBuildResumeView()
}

export function toggleResumeVersion(versionId) {
  _buildExpandedVersionId = _buildExpandedVersionId === versionId ? null : versionId
  renderBuildResumeView()
}
