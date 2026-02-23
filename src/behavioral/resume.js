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
  if (state.bhAddingResume)  { renderAddResume();    return }
  if (state.bhBulletId)      { renderBulletDetail(); return }
  if (state.bhResumeId)      { renderResumeDetail(); return }
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
            <input class="modal-input" id="rn_name" placeholder="${t('例：Google L5 简历 2024', 'e.g. Google L5 Resume 2024')}" style="width:100%;margin-bottom:0">
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
    const sys = `Extract experience bullet points from this resume, grouped by role/company/project. Return ONLY a valid JSON array: [{"role":"Senior SWE at Company (2021-2024)","bullets":["bullet 1","bullet 2"]}]. Include all experience bullets; skip education and skills sections.`
    const raw = await claudeJSON(sys, `Resume:\n\n${text}`, 3000, '[')
    JSON.parse(raw).forEach(g => {
      ;(g.bullets || []).forEach(txt => {
        bullets.push({ id: uid(), text: txt, role: g.role || 'Experience', hmQuestions: [], questionsGenerated: false })
      })
    })
  } catch (_) {
    bullets = text.split('\n').map(l => l.trim())
      .filter(l => /^[•\-*▸]/.test(l) || l.length > 40).slice(0, 40)
      .map(l => ({ id: uid(), text: l.replace(/^[•\-*▸]\s*/, ''), role: 'Experience', hmQuestions: [], questionsGenerated: false }))
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
        </div>
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
        ${!bullet.questionsGenerated ? `
          <button class="btn-primary" style="margin-top:20px"
            onclick="generateBulletQs('${resume.id}','${bullet.id}')">
            💼 ${t('生成主管深度追问', 'Generate HM Deep-Dive Questions')}
          </button>
          <p style="margin-top:10px;font-size:12px;color:var(--muted)">
            ${t('Claude 将生成 5 个工程主管会针对该经历问到的深度问题。', 'Claude will generate 5 questions an engineering manager would ask about this specific experience.')}
          </p>` : `
          <div class="bh-section-label" style="margin-top:20px">
            💼 ${t('主管深度追问', 'HM Deep-Dive Questions')}
            <span class="qh-cnt">${bullet.hmQuestions.filter(q => q.answer?.trim()).length}/${bullet.hmQuestions.length} ${t('已回答', 'answered')}</span>
          </div>
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
                <button class="btn-ans-action btn-ans-analyze" onclick="analyzeAnswer('${resume.id}','${bullet.id}','${q.id}')">📊 ${t('L5 评估', 'L5 Analysis')}</button>
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
                    <div class="ans-result-label">📊 ${t('L5 评估', 'L5 Analysis')}</div>
                    <button class="ans-result-btn" onclick="var b=this.closest('.ans-result-box');b.classList.toggle('collapsed');this.textContent=b.classList.contains('collapsed')?'▸':'▾'">▾</button>
                  </div>
                  <div class="ans-result-text">${esc(q.feedback)}</div>
                </div>` : ''}
            </div>`).join('')}`}
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
    const sys = `You are a senior engineering manager at Google conducting an L5 SWE hiring manager interview. Generate exactly 5 deep-dive questions about this specific experience bullet. Each question must probe a different dimension: (1) technical depth & decision rationale, (2) scope of impact & cross-functional influence, (3) handling ambiguity or tradeoffs, (4) leadership or influence without authority, (5) reflection — what they would do differently and what they learned. Return ONLY a JSON array of 5 question strings.`
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
    const sys = `You are a senior Google L5 SWE interview coach helping a candidate nail a hiring manager interview. Polish the candidate's answer to be crisp, first-person, impact-forward, and L5-appropriate. Rules: use "I" not "we"; lead with the most impactful point; be specific and include any metrics mentioned; cut filler words; keep it under 150 words. Return ONLY the polished answer text with no preamble.`
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
      + '<div class="ans-result-hd"><div class="ans-result-label">📊 ' + t('L5 评估', 'L5 Analysis') + '</div></div>'
      + '<div class="ans-result-text stream-active" id="stream-text-analysis-' + questionId + '"></div>'
      + '</div>')
  }
  try {
    const sys = `You are a Google L5 SWE hiring manager evaluating a candidate's answer against the L5 bar. Give honest, actionable feedback in exactly 3 labeled bullet points:
• Strengths: what works well (specificity, impact, leadership signal)
• Gaps: what's missing or weak (push for more depth, metrics, ownership, cross-team influence)
• Verdict: one sentence — does this clear the L5 bar, and what's the biggest thing to fix?
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
