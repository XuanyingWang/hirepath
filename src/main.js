// ── ENTRY POINT (composition root) ────────────────────────────────────────────
import { state, save, gch, uid } from './state.js'
import { t, applyLangStatics } from './i18n.js'
import { modal, confirmModal, closeModal, showLoading, showErr } from './util.js'
import { initApiKey, showSettings, saveApiKey } from './api.js'
import { toggleSpeech, stopSpeech } from './speech.js'
import { exportStory, exportAllStories, exportBqAnswer, exportAllBqAnswers } from './export.js'
import { renderSB, toggleF } from './sidebar.js'
import { addFolder, renameF, delF } from './folders.js'
import { renameCh, moveCh, doMove, delCh } from './chapters.js'
import { renderWelcome } from './welcome.js'
import { buildAnalysis } from './analysis.js'
import { renderKnowledge, rebuildKnowledge } from './knowledge.js'
import { renderQuizSetup, pickMode, startQuiz, renderQ, toggleHint, pickAns, nextQ, reviewSession } from './quiz.js'
import { renderFlashcards, generateFlashcards, flipCard, markCard, skipCard, restartFcSession, regenerateFlashcards } from './flashcards.js'
import { renderDashboard } from './dashboard.js'
import { renderBhResume, renderBulletDetail, startAddResume, cancelAddResume, submitResume, handleResumeFile, handleResumeDrop, openResume, deleteResume, backToResumeList, openBullet, backToBulletList, generateBulletQs, saveAnswer, polishAnswer, analyzeAnswer, overridePolished, savePolished, clearResumeFile } from './behavioral/resume.js'
import { renderBhStories, newStory, editStory, cancelEditStory, deleteStory, saveStory, polishStory, extractStar, openBulletPicker, closeBulletPicker, pickResume, selectBulletRef, unlinkBulletRef } from './behavioral/stories.js'
import { renderBqPrep, openBqDetail, closeBqDetail, addBq, saveBq, deleteBq, linkStory, unlinkStory, showStoryPicker, tuneBqAnswer } from './behavioral/bqstore.js'
import { renderJobPrep, openCompanyView, closeCompanyView, openPostingDetail, addJobPosting, submitJobPosting, deletePosting, connectResume, disconnectResume, showResumePicker, matchBullets } from './jobprep.js'

// ── NAVIGATION ────────────────────────────────────────────────────────────────

function selCh(id) {
  state.activeCid = id; state.activeTab = 'knowledge'
  // Reset flashcard session when switching chapters
  state.fcSession = []; state.fcIdx = 0; state.fcFlipped = false; state.fcSessionCid = null
  renderSB()
  const c = gch()
  document.getElementById('topbar').style.display = 'flex'
  document.getElementById('topbarTitle').textContent = c.name
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'knowledge'))
  renderKnowledge()
}

function selResume() {
  state.activeCid = '__resume__'
  renderSB()
  document.getElementById('topbar').style.display = 'none'
  window.renderBhResume()
}

function selBqPrep() {
  state.activeCid = '__bqprep__'
  renderSB()
  document.getElementById('topbar').style.display = 'none'
  renderBqPrep()
}

function selJobPrep() {
  state.activeCid = '__jobprep__'
  renderSB()
  document.getElementById('topbar').style.display = 'none'
  renderJobPrep()
}

function setBqTab(tab) { state.bqTab = tab; state.bqDetailId = null; renderBqPrep() }

function selDashboard() {
  state.activeCid = '__dashboard__'
  renderSB()
  document.getElementById('topbar').style.display = 'none'
  renderDashboard()
}


function setLang(l) {
  state.lang = l; localStorage.setItem('l5lang', l)
  applyLangStatics()
  closeModal()
  renderCurrent()
}

function renderCurrent() {
  renderSB()
  if (state.activeCid === '__dashboard__') {
    document.getElementById('topbar').style.display = 'none'
    renderDashboard()
  } else if (state.activeCid === '__resume__' || state.activeCid === '__behavioral__') {
    document.getElementById('topbar').style.display = 'none'
    window.renderBhResume()
  } else if (state.activeCid === '__bqprep__') {
    document.getElementById('topbar').style.display = 'none'
    renderBqPrep()
  } else if (state.activeCid === '__jobprep__') {
    document.getElementById('topbar').style.display = 'none'
    renderJobPrep()
  } else if (state.activeCid && gch()) {
    document.getElementById('topbar').style.display = 'flex'
    document.getElementById('topbarTitle').textContent = gch().name
    const inProgress = state.quizState?.cid === state.activeCid && state.quizState?.questions?.length > 0
      && typeof state.quizState.current === 'number' && state.quizState.current < state.quizState.questions.length
    if (state.activeTab === 'knowledge') renderKnowledge()
    else if (state.activeTab === 'flashcard') renderFlashcards()
    else inProgress ? renderQ() : renderQuizSetup()
  } else {
    document.getElementById('topbar').style.display = 'none'
    renderWelcome()
  }
}

// ── ANALYSIS (reads DOM, calls buildAnalysis, then navigates) ─────────────────

async function doAnalyze() {
  const name = (document.getElementById('chName')?.value || '').trim()
  const url = (document.getElementById('chUrl')?.value || '').trim()
  const fid = document.getElementById('chFolder')?.value || null
  const pasteContent = (document.getElementById('chContent')?.value || '').trim()
  if (!name) { alert(t('请填写章节名称', 'Please enter a chapter name')); return }
  if (!url) { alert(t('请填写文档 URL', 'Please enter a doc URL')); return }
  showLoading(t('正在准备…', 'Preparing…'), pasteContent ? t('使用粘贴内容，跳过网络获取', 'Using pasted content, skipping URL fetch') : `${t('正在获取：', 'Fetching: ')}${url}`)
  try {
    const analysis = await buildAnalysis(name, url, pasteContent)
    const id = uid()
    state.S.chapters.push({ id, name, url, folderId: fid, analysis, createdAt: new Date().toISOString() })
    save(); renderSB(); selCh(id)
  } catch (err) { showErr(err?.message || String(err)) }
}

// ── EVENT LISTENERS ───────────────────────────────────────────────────────────

document.getElementById('addChBtn').addEventListener('click', () => {
  state.activeCid = null; renderSB()
  document.getElementById('topbar').style.display = 'none'
  renderWelcome()
})

document.getElementById('settingsBtn').addEventListener('click', () => showSettings())

document.getElementById('topbar').addEventListener('click', e => {
  const tab = e.target.dataset?.tab; if (!tab) return
  state.activeTab = tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
  if (tab === 'knowledge') {
    renderKnowledge()
  } else if (tab === 'flashcard') {
    renderFlashcards()
  } else {
    const inProgress = state.quizState?.cid === state.activeCid &&
      state.quizState?.questions?.length > 0 &&
      typeof state.quizState.current === 'number' &&
      state.quizState.current < state.quizState.questions.length
    inProgress ? renderQ() : renderQuizSetup()
  }
})

// ── WINDOW EXPORTS (required for inline onclick handlers) ─────────────────────
Object.assign(window, {
  // Folders
  toggleF, addFolder, renameF, delF,
  // Chapters
  selCh, renameCh, moveCh, doMove, delCh,
  // Analysis + welcome
  doAnalyze, renderWelcome,
  // Knowledge
  renderKnowledge, rebuildKnowledge,
  // Quiz
  pickMode, startQuiz, pickAns, nextQ,
  toggleHint, renderQuizSetup, reviewSession,
  // Flashcards
  generateFlashcards, flipCard, markCard, skipCard, restartFcSession, regenerateFlashcards,
  // Dashboard
  selDashboard, renderDashboard,
  // Modal
  modal, confirmModal, closeModal,
  // Settings + lang
  showSettings, saveApiKey,
  setLang, renderCurrent,
  // Behavioral nav
  selResume, selBqPrep, setBqTab,
  renderBhResume, renderBhStories,
  // Resume pages
  startAddResume, cancelAddResume, submitResume,
  handleResumeFile, handleResumeDrop,
  openResume, deleteResume,
  backToResumeList, openBullet,
  backToBulletList, generateBulletQs, saveAnswer, polishAnswer, analyzeAnswer,
  renderBulletDetail, overridePolished, savePolished, clearResumeFile,
  // STAR stories
  newStory, editStory, cancelEditStory, deleteStory,
  saveStory, polishStory, extractStar,
  openBulletPicker, closeBulletPicker, pickResume, selectBulletRef, unlinkBulletRef,
  // Speech recognition
  toggleSpeech, stopSpeech,
  // PDF export
  exportStory, exportAllStories, exportBqAnswer, exportAllBqAnswers,
  // BQ Prep
  renderBqPrep, openBqDetail, closeBqDetail,
  addBq, saveBq, deleteBq,
  linkStory, unlinkStory, showStoryPicker, tuneBqAnswer,
  // Job Prep
  selJobPrep, renderJobPrep,
  openCompanyView, closeCompanyView, openPostingDetail,
  addJobPosting, submitJobPosting, deletePosting,
  connectResume, disconnectResume, showResumePicker, matchBullets,
})

// ── INIT ──────────────────────────────────────────────────────────────────────
applyLangStatics()
renderSB()
renderWelcome()
initApiKey()
