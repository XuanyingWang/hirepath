// ── JOB APPLICATION PREP ──────────────────────────────────────────────────────
import { invoke } from '@tauri-apps/api/core'
import { state, save, uid } from './state.js'
import { t } from './i18n.js'
import { esc, modal, closeModal } from './util.js'
import { claudeJSON } from './api.js'

// ── State helpers ─────────────────────────────────────────────────────────────

function getJP() {
  if (!state.S.jobPrep) state.S.jobPrep = { companies: [] }
  return state.S.jobPrep
}

function findPosting(postingId) {
  const jp = getJP()
  for (const c of jp.companies) {
    const p = c.postings.find(p => p.id === postingId)
    if (p) return { company: c, posting: p }
  }
  return null
}

function getResumes() {
  return state.S.behavioral?.resumes || []
}

// ── Header ────────────────────────────────────────────────────────────────────

function jpHeader() {
  return '<div class="bh-header">'
    + '<div class="bh-title">'
    + '<span class="bh-icon">💼</span>'
    + '<div>'
    + '<div class="bh-h1">' + t('求职备考', 'Job Prep') + '</div>'
    + '<div class="bh-sub">' + t('职位分析 · 简历匹配 · 精准备考', 'Job Analysis · Resume Match · Targeted Prep') + '</div>'
    + '</div>'
    + '</div>'
    + '</div>'
}

// ── Company card HTML ─────────────────────────────────────────────────────────

function _companyInitials(name) {
  return name.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase()
}

function _companyCardHtml(c) {
  const lastPosting = c.postings[c.postings.length - 1]
  const dateStr = lastPosting ? new Date(lastPosting.createdAt).toLocaleDateString() : ''
  const count = c.postings.length
  const countLabel = count + ' ' + t(count === 1 ? '个职位' : '个职位', count === 1 ? 'posting' : 'postings')
  return '<div class="jp-company-card" onclick="openCompanyView(' + esc(JSON.stringify(c.name)) + ')">'
    + '<div class="jp-company-icon">' + esc(_companyInitials(c.name)) + '</div>'
    + '<div class="jp-company-info">'
    + '<div class="jp-company-name">' + esc(c.name) + '</div>'
    + '<div class="jp-company-meta">' + countLabel + (dateStr ? ' · ' + dateStr : '') + '</div>'
    + '</div>'
    + '<div class="jp-company-arrow">›</div>'
    + '</div>'
}

// ── Posting row HTML ──────────────────────────────────────────────────────────

function _postingRowHtml(p) {
  const analysis = p.analysis || {}
  const badges = []
  if (analysis.level) badges.push('<span class="jp-badge jp-badge-level">' + esc(analysis.level) + '</span>')
  if (p.connectedResumeId) badges.push('<span class="jp-badge jp-badge-linked">📄 ' + t('已关联简历', 'Resume linked') + '</span>')
  if (p.matchedBullets && p.matchedBullets.length) badges.push('<span class="jp-badge jp-badge-matched">✓ ' + t('已匹配', 'Matched') + '</span>')
  const badgesHtml = badges.join('')
  return '<div class="jp-posting-row" onclick="openPostingDetail(\'' + p.id + '\')">'
    + '<div class="jp-posting-title">' + esc(p.title || t('未命名职位', 'Untitled')) + '</div>'
    + '<div class="jp-posting-meta">'
    + badgesHtml
    + '<button class="btn-icon" style="margin-left:auto" onclick="event.stopPropagation();deletePosting(\'' + p.id + '\')" title="' + t('删除', 'Delete') + '">✕</button>'
    + '</div>'
    + '</div>'
}

// ── Resume connect section HTML ───────────────────────────────────────────────

function _resumeConnectHtml(posting, resumes) {
  if (resumes.length === 0) {
    return '<div class="bq-hint">'
      + t('请先在「简历分析器」中添加简历，再进行关联。', 'Add a resume in Resume Analyzer first, then link it here.')
      + '<button class="btn-sec" style="margin-left:10px" onclick="selResume()">'
      + t('前往简历分析器 →', 'Go to Resume Analyzer →')
      + '</button></div>'
  }
  if (posting.connectedResumeId) {
    const r = resumes.find(r => r.id === posting.connectedResumeId)
    return '<div class="jp-resume-linked-box">'
      + '<div class="jp-resume-linked-name">📄 ' + esc(r ? r.name : t('未知简历', 'Unknown resume')) + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:8px">'
      + '<button class="btn-sec" onclick="disconnectResume(\'' + posting.id + '\')">✕ ' + t('取消关联', 'Unlink') + '</button>'
      + '<button class="btn-sec" onclick="showResumePicker(\'' + posting.id + '\')">⇄ ' + t('更换简历', 'Change Resume') + '</button>'
      + '</div></div>'
  }
  const opts = resumes.map(r =>
    '<option value="' + r.id + '">' + esc(r.name || t('未命名简历', 'Unnamed')) + '</option>'
  ).join('')
  return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    + '<select class="modal-input" id="jp-resume-select-' + posting.id + '" style="max-width:320px">'
    + '<option value="">' + t('选择简历…', 'Select a resume…') + '</option>'
    + opts
    + '</select>'
    + '<button class="btn-primary" onclick="connectResume(\'' + posting.id + '\', document.getElementById(\'jp-resume-select-' + posting.id + '\').value)">'
    + t('关联', 'Link')
    + '</button>'
    + '</div>'
}

// ── Match bullets section HTML ────────────────────────────────────────────────

function _matchBulletsHtml(posting) {
  if (!posting.connectedResumeId) {
    return '<div class="bq-hint">' + t('请先关联简历，再进行匹配分析。', 'Link a resume above to run bullet matching.') + '</div>'
  }
  if (!posting.matchedBullets) {
    return '<button class="btn-primary" id="match-btn-' + posting.id + '" onclick="matchBullets(\'' + posting.id + '\')">'
      + '🎯 ' + t('匹配简历亮点', 'Match Resume Bullets')
      + '</button>'
      + '<p style="margin-top:8px;font-size:12px;color:var(--muted)">'
      + t('Claude 将分析您的简历，找出最匹配此职位要求的亮点。', 'Claude will highlight the most relevant resume bullets for this job.')
      + '</p>'
  }
  let bulletsHtml = ''
  posting.matchedBullets.forEach(m => {
    const score = m.score || 0
    const scoreClass = score >= 8 ? 'jp-match-high' : score >= 5 ? 'jp-match-med' : 'jp-match-low'
    bulletsHtml += '<div class="jp-match-row ' + scoreClass + '">'
      + '<div class="jp-match-score">' + score + '/10</div>'
      + '<div class="jp-match-body">'
      + '<div class="jp-match-bullet">' + esc(m.bulletText) + '</div>'
      + '<div class="jp-match-note">' + esc(m.relevanceNote) + '</div>'
      + '</div>'
      + '</div>'
  })
  return '<div class="jp-match-list">' + bulletsHtml + '</div>'
    + '<button class="btn-sec" style="margin-top:10px" id="match-btn-' + posting.id + '" onclick="matchBullets(\'' + posting.id + '\')">↺ ' + t('重新匹配', 'Re-run Match') + '</button>'
}

// ── Skill tags HTML ───────────────────────────────────────────────────────────

function _skillTagsHtml(skills) {
  if (!skills || !skills.length) return '<span style="color:var(--muted);font-size:12px">—</span>'
  return skills.map(s => '<span class="jp-skill-tag">' + esc(s) + '</span>').join('')
}

// ── Page router ───────────────────────────────────────────────────────────────

export function renderJobPrep() {
  const v = state.jobPrepView
  if (!v) { renderJobHome(); return }
  if (v.type === 'company') { renderCompanyView(v.name); return }
  if (v.type === 'posting') { renderPostingDetail(v.id); return }
  renderJobHome()
}

// ── Home: company grid ────────────────────────────────────────────────────────

function renderJobHome() {
  const jp = getJP()
  const totalPostings = jp.companies.reduce((n, c) => n + c.postings.length, 0)
  let bodyHtml
  if (jp.companies.length === 0) {
    bodyHtml = '<div class="empty-state" style="padding:48px 0">'
      + '<div class="empty-icon">💼</div>'
      + '<div class="empty-text">' + t('暂无职位。添加求职岗位开始备考。', 'No jobs yet. Add a job posting to get started.') + '</div>'
      + '</div>'
  } else {
    bodyHtml = '<div class="jp-company-grid">'
      + jp.companies.map(c => _companyCardHtml(c)).join('')
      + '</div>'
  }

  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${jpHeader()}
      <div class="bh-body">
        <div class="bh-page-hd">
          <div class="bh-section-label" style="margin:0">${t('职位库', 'Job Postings')} <span style="font-weight:400;font-size:11px;color:var(--muted)">(${totalPostings})</span></div>
          <button class="btn-primary" onclick="addJobPosting()">＋ ${t('添加职位', 'Add Job')}</button>
        </div>
        ${bodyHtml}
      </div>
    </div>`
}

// ── Company view: posting list ────────────────────────────────────────────────

function renderCompanyView(name) {
  const jp = getJP()
  const company = jp.companies.find(c => c.name === name)
  if (!company) { state.jobPrepView = null; renderJobHome(); return }

  const rowsHtml = company.postings.length
    ? company.postings.map(p => _postingRowHtml(p)).join('')
    : '<div class="bq-hint">' + t('该公司暂无职位。', 'No postings for this company.') + '</div>'

  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${jpHeader()}
      <div class="bh-body">
        <div class="bh-page-hd">
          <button class="btn-sec" onclick="closeCompanyView()">← ${t('职位库', 'Job Postings')}</button>
          <button class="btn-primary" onclick="addJobPosting()">＋ ${t('添加职位', 'Add Job')}</button>
        </div>
        <div class="jp-company-hd">
          <div class="jp-company-icon jp-company-icon-lg">${esc(_companyInitials(name))}</div>
          <div>
            <div class="jp-company-name-lg">${esc(name)}</div>
            <div class="jp-company-meta">${company.postings.length} ${t('个职位', company.postings.length === 1 ? 'posting' : 'postings')}</div>
          </div>
        </div>
        ${rowsHtml}
      </div>
    </div>`
}

// ── Posting detail view ───────────────────────────────────────────────────────

function renderPostingDetail(postingId) {
  const result = findPosting(postingId)
  if (!result) { state.jobPrepView = null; renderJobHome(); return }
  const { company, posting } = result
  const resumes = getResumes()
  const analysis = posting.analysis || {}

  const responsibilitiesHtml = analysis.responsibilities && analysis.responsibilities.length
    ? '<ul class="jp-list">' + analysis.responsibilities.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>'
    : '<span style="color:var(--muted);font-size:12px">—</span>'

  const niceToHaveHtml = analysis.niceToHaveSkills && analysis.niceToHaveSkills.length
    ? '<div class="bh-section-label" style="margin-top:16px">💡 ' + t('加分技能', 'Nice-to-Have Skills') + '</div>'
      + '<div class="jp-skills-row">' + _skillTagsHtml(analysis.niceToHaveSkills) + '</div>'
    : ''

  const levelBadge = analysis.level
    ? '<div class="jp-badge jp-badge-level" style="margin-bottom:8px">' + esc(analysis.level) + '</div>'
    : ''

  const summaryHtml = analysis.summary
    ? '<div class="jp-summary-box">' + esc(analysis.summary) + '</div>'
    : ''

  const urlHtml = posting.url
    ? '<a class="jp-detail-url" href="' + esc(posting.url) + '" target="_blank">' + esc(posting.url) + '</a>'
    : ''

  const resumeConnectHtml = _resumeConnectHtml(posting, resumes)
  const matchHtml = _matchBulletsHtml(posting)

  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${jpHeader()}
      <div class="bh-body">
        <div class="bh-page-hd">
          <button class="btn-sec" onclick="openCompanyView(${esc(JSON.stringify(company.name))})">← ${esc(company.name)}</button>
        </div>
        <div class="jp-detail-card">
          ${levelBadge}
          <div class="jp-detail-title">${esc(posting.title || t('未命名职位', 'Untitled'))}</div>
          ${urlHtml}
        </div>
        ${summaryHtml}
        <div class="bh-section-label" style="margin-top:20px">📋 ${t('核心职责', 'Key Responsibilities')}</div>
        ${responsibilitiesHtml}
        <div class="bh-section-label" style="margin-top:20px">🛠 ${t('必备技能', 'Required Skills')}</div>
        <div class="jp-skills-row">${_skillTagsHtml(analysis.requiredSkills)}</div>
        ${niceToHaveHtml}
        <div class="bh-section-label" style="margin-top:24px">📄 ${t('关联简历', 'Connected Resume')}</div>
        ${resumeConnectHtml}
        <div class="bh-section-label" style="margin-top:24px">🎯 ${t('简历亮点匹配', 'Resume Bullet Match')}</div>
        ${matchHtml}
      </div>
    </div>`
}

// ── Navigation ────────────────────────────────────────────────────────────────

export function openCompanyView(name) { state.jobPrepView = { type: 'company', name }; renderJobPrep() }
export function closeCompanyView() { state.jobPrepView = null; renderJobPrep() }
export function openPostingDetail(id) { state.jobPrepView = { type: 'posting', id }; renderJobPrep() }

// ── Add job posting ───────────────────────────────────────────────────────────

export function addJobPosting() {
  modal('', [], () => {}, `
    <div class="modal-title">💼 ${t('添加求职职位', 'Add Job Posting')}</div>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;color:var(--muted2);display:block;margin-bottom:4px">${t('职位 URL', 'Job Posting URL')}</label>
      <input class="modal-input" id="jp_url" placeholder="https://careers.google.com/jobs/…" style="width:100%">
    </div>
    <p class="modal-note">${t('将自动抓取页面并用 AI 提取公司、职位、职责和技能。', 'The page will be fetched and analyzed with AI to extract company, title, responsibilities, and skills.')}</p>
    <div class="modal-actions">
      <button class="btn-sec" onclick="closeModal()">${t('取消', 'Cancel')}</button>
      <button class="btn-primary" onclick="submitJobPosting()">${t('获取并分析 →', 'Fetch & Analyze →')}</button>
    </div>
  `)
  setTimeout(() => document.getElementById('jp_url')?.focus(), 50)
}

export async function submitJobPosting() {
  const url = document.getElementById('jp_url')?.value?.trim() || ''
  if (!url) { alert(t('请输入职位 URL。', 'Please enter a job posting URL.')); return }
  if (!url.startsWith('http')) { alert(t('请输入有效的 URL（以 http 开头）。', 'Please enter a valid URL starting with http.')); return }
  closeModal()

  document.getElementById('mainContent').innerHTML = `
    <div class="loading-box">
      <div class="spinner"></div>
      <div class="load-label">${t('正在获取职位页面…', 'Fetching job posting…')}</div>
      <div class="load-sub">${esc(url)}</div>
    </div>`

  let rawText
  try {
    rawText = await invoke('fetch_url', { url })
  } catch (err) {
    _showJobErr(t('获取失败：', 'Fetch failed: ') + (err?.message || String(err)), url)
    return
  }

  const lbl = document.querySelector('.load-label')
  const sub = document.querySelector('.load-sub')
  if (lbl) lbl.textContent = t('正在分析职位…', 'Analyzing job posting…')
  if (sub) sub.textContent = t('Claude 正在提取职位信息…', 'Claude is extracting job details…')

  try {
    const sys = 'You are a job analysis assistant. Given the text of a job posting, extract structured information. Return ONLY a valid JSON object with these exact keys: company (string — official company name, e.g. "Google"), title (string — job title), level (string — seniority level, e.g. "L5 / Senior"), teamFocus (string — team or domain area, 1 sentence), summary (string — 1-2 sentence TL;DR of the role), responsibilities (array of strings — top 5-8 key responsibilities, each ≤15 words), requiredSkills (array of strings — must-have skills), niceToHaveSkills (array of strings — preferred but optional skills). If a field is unknown use empty string or empty array.'
    const raw = await claudeJSON(sys, 'Job posting text:\n' + rawText, 2000, '{')
    const parsed = JSON.parse(raw)

    const posting = {
      id: uid(),
      url,
      title: parsed.title || t('未命名职位', 'Untitled'),
      rawText: rawText.slice(0, 5000),
      analysis: {
        summary: parsed.summary || '',
        level: parsed.level || '',
        teamFocus: parsed.teamFocus || '',
        responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [],
        requiredSkills: Array.isArray(parsed.requiredSkills) ? parsed.requiredSkills : [],
        niceToHaveSkills: Array.isArray(parsed.niceToHaveSkills) ? parsed.niceToHaveSkills : [],
      },
      connectedResumeId: null,
      matchedBullets: null,
      createdAt: new Date().toISOString(),
    }

    const jp = getJP()
    const companyName = (parsed.company || t('未知公司', 'Unknown Company')).trim()
    let company = jp.companies.find(c => c.name.toLowerCase() === companyName.toLowerCase())
    if (!company) {
      company = { name: companyName, postings: [] }
      jp.companies.push(company)
    } else {
      company.name = companyName // normalize casing
    }
    company.postings.push(posting)
    save()

    state.jobPrepView = { type: 'posting', id: posting.id }
    renderJobPrep()
  } catch (err) {
    _showJobErr(t('分析失败：', 'Analysis failed: ') + (err?.message || String(err)), url)
  }
}

function _showJobErr(msg, url) {
  document.getElementById('mainContent').innerHTML = `
    <div class="bh-view">
      ${jpHeader()}
      <div class="bh-body">
        <div class="bh-page-hd">
          <button class="btn-sec" onclick="renderJobPrep()">← ${t('职位库', 'Job Postings')}</button>
        </div>
        <div class="empty-state" style="padding:32px 0">
          <div class="empty-icon">⚠️</div>
          <div class="empty-text" style="max-width:500px">
            <strong style="color:var(--red)">${t('发生错误', 'Error')}</strong><br><br>
            <span style="font-size:12px;word-break:break-all;opacity:.8">${esc(msg)}</span><br><br>
            <button class="btn-primary" onclick="addJobPosting()">${t('重试', 'Retry')}</button>
          </div>
        </div>
      </div>
    </div>`
}

// ── Delete posting ────────────────────────────────────────────────────────────

export function deletePosting(postingId) {
  if (!confirm(t('删除此职位？', 'Delete this posting?'))) return
  const jp = getJP()
  for (const c of jp.companies) {
    const idx = c.postings.findIndex(p => p.id === postingId)
    if (idx !== -1) {
      c.postings.splice(idx, 1)
      if (c.postings.length === 0) jp.companies.splice(jp.companies.indexOf(c), 1)
      break
    }
  }
  save()
  state.jobPrepView = null
  renderJobPrep()
}

// ── Resume connection ─────────────────────────────────────────────────────────

export function connectResume(postingId, resumeId) {
  if (!resumeId) { alert(t('请先选择简历。', 'Please select a resume.')); return }
  const result = findPosting(postingId)
  if (!result) return
  result.posting.connectedResumeId = resumeId
  result.posting.matchedBullets = null
  save()
  if (state.jobPrepView?.type === 'posting' && state.jobPrepView.id === postingId) renderJobPrep()
}

export function disconnectResume(postingId) {
  const result = findPosting(postingId)
  if (!result) return
  result.posting.connectedResumeId = null
  result.posting.matchedBullets = null
  save()
  if (state.jobPrepView?.type === 'posting' && state.jobPrepView.id === postingId) renderJobPrep()
}

export function showResumePicker(postingId) {
  const result = findPosting(postingId)
  if (!result) return
  result.posting.connectedResumeId = null
  result.posting.matchedBullets = null
  renderJobPrep()
}

// ── Match bullets ─────────────────────────────────────────────────────────────

export async function matchBullets(postingId) {
  const result = findPosting(postingId)
  if (!result) return
  const { posting } = result
  if (!posting.connectedResumeId) { alert(t('请先关联简历。', 'Please link a resume first.')); return }

  const resumes = getResumes()
  const resume = resumes.find(r => r.id === posting.connectedResumeId)
  if (!resume) { alert(t('关联的简历不存在，请重新关联。', 'Linked resume not found, please re-link.')); return }

  const matchBtn = document.getElementById('match-btn-' + postingId)
  if (matchBtn) { matchBtn.innerHTML = '<span class="spin-icon">⟳</span> ' + t('分析中…', 'Analyzing…'); matchBtn.disabled = true }

  try {
    const bullets = (resume.bullets || []).filter(b => b.text).map(b => ({ id: b.id, text: b.text }))
    if (bullets.length === 0) {
      if (matchBtn) { matchBtn.innerHTML = '🎯 ' + t('匹配简历亮点', 'Match Resume Bullets'); matchBtn.disabled = false }
      alert(t('简历中暂无可用的亮点条目。', 'No bullet points found in this resume.')); return
    }

    const analysis = posting.analysis || {}
    const jobContext = 'Job Title: ' + posting.title + '\n'
      + 'Level: ' + (analysis.level || 'Not specified') + '\n'
      + (analysis.teamFocus ? 'Team Focus: ' + analysis.teamFocus + '\n' : '')
      + (analysis.summary ? 'Summary: ' + analysis.summary + '\n' : '')
      + 'Key Responsibilities:\n' + (analysis.responsibilities || []).map(r => '- ' + r).join('\n') + '\n'
      + 'Required Skills: ' + (analysis.requiredSkills || []).join(', ')
    const bulletsText = bullets.map((b, i) => (i + 1) + '. [ID:' + b.id + '] ' + b.text).join('\n')

    const sys = 'You are a resume-to-job matching expert. Given a job description and a list of resume bullet points, score each bullet by relevance to this specific job on a 0-10 scale. Return ONLY a JSON array of objects with keys: bulletId (string — must match the [ID:...] in input), score (integer 0-10), relevanceNote (string ≤20 words explaining relevance or lack thereof). Sort by score descending. Include ALL bullets.'
    const userMsg = 'JOB:\n' + jobContext + '\n\nRESUME BULLETS:\n' + bulletsText
    const raw = await claudeJSON(sys, userMsg, 2000, '[')
    const parsed = JSON.parse(raw)

    posting.matchedBullets = parsed.map(m => {
      const b = bullets.find(b => b.id === m.bulletId)
      return { bulletId: m.bulletId, bulletText: b ? b.text : m.bulletId, relevanceNote: m.relevanceNote, score: m.score }
    })
    save()
  } catch (err) {
    if (matchBtn) { matchBtn.innerHTML = '🎯 ' + t('匹配简历亮点', 'Match Resume Bullets'); matchBtn.disabled = false }
    alert(t('匹配失败：', 'Match failed: ') + (err?.message || String(err)))
    return
  }

  renderJobPrep()
}
