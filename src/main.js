// ── ENTRY POINT (composition root) ────────────────────────────────────────────
import { state, save, gch, uid, setSyncCallback } from './state.js'
import { t, applyLangStatics } from './i18n.js'
import { modal, confirmModal, closeModal, showLoading, showErr } from './util.js'
import { initApiKey, showSettings, saveApiKey, switchProvider, doSignIn, doSignOut } from './api.js'
import { initAuth, onAuthChange, getUser } from './auth.js'
import { initSync, schedulePush, pullOnStart } from './sync.js'
import { toggleSpeech, stopSpeech } from './speech.js'
import { exportStory, exportAllStories, exportBqAnswer, exportAllBqAnswers, exportBackup, importBackup } from './export.js'
import { renderSB, toggleF } from './sidebar.js'
import { addFolder, renameF, delF } from './folders.js'
import { renameCh, moveCh, doMove, delCh } from './chapters.js'
import { renderWelcome, resetWelcomeState, getChSource, getChFileName, getChFileContent, chSwitchSource, chPickFile, chHandleFile, chHandleDrop } from './welcome.js'
import { buildAnalysis } from './analysis.js'
import { renderKnowledge, rebuildKnowledge } from './knowledge.js'
import { renderQuizSetup, pickMode, startQuiz, renderQ, toggleHint, pickAns, nextQ, reviewSession } from './quiz.js'
import { renderFlashcards, generateFlashcards, flipCard, markCard, skipCard, restartFcSession, regenerateFlashcards } from './flashcards.js'
import { renderDashboard } from './dashboard.js'
import { renderBhResume, renderBulletDetail, startAddResume, cancelAddResume, submitResume, handleResumeFile, handleResumeDrop, openResume, deleteResume, backToResumeList, openBullet, backToBulletList, generateBulletQs, saveAnswer, polishAnswer, analyzeAnswer, overridePolished, savePolished, clearResumeFile } from './behavioral/resume.js'
import { renderBhStories, newStory, editStory, cancelEditStory, deleteStory, saveStory, polishStory, extractStar, openBulletPicker, closeBulletPicker, pickResume, selectBulletRef, unlinkBulletRef } from './behavioral/stories.js'
import { renderBqPrep, openBqDetail, closeBqDetail, addBq, saveBq, deleteBq, linkStory, unlinkStory, showStoryPicker, tuneBqAnswer } from './behavioral/bqstore.js'
import { renderJobPrep, openCompanyView, closeCompanyView, openPostingDetail, addJobPosting, submitJobPosting, deletePosting, connectResume, disconnectResume, showResumePicker, matchBullets } from './jobprep.js'
import { renderAggregator, aggrPickFolder, aggrPickFiles, aggrCancel, aggrClear, aggrExportPdf } from './aggregator.js'
import { renderOod, openOodQ, oodBackToList, oodSwitchLang, oodCodeInput, oodAnalyze } from './ood.js'

// ── NAVIGATION ────────────────────────────────────────────────────────────────

function selCh(id, tab = 'knowledge') {
  state.activeCid = id; state.activeTab = tab
  // Reset flashcard session when switching chapters
  state.fcSession = []; state.fcIdx = 0; state.fcFlipped = false; state.fcSessionCid = null
  renderSB()
  const c = gch()
  document.getElementById('topbar').style.display = 'flex'
  document.getElementById('topbarTitle').textContent = c.name
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
  if (tab === 'knowledge') renderKnowledge()
  else if (tab === 'flashcard') renderFlashcards()
  else renderQuizSetup()
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

function selAggregator() {
  state.activeCid = '__aggregator__'
  renderSB()
  document.getElementById('topbar').style.display = 'none'
  renderAggregator()
}

function selOod() {
  state.activeCid = '__ood__'
  renderSB()
  document.getElementById('topbar').style.display = 'none'
  renderOod()
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
  } else if (state.activeCid === '__aggregator__') {
    document.getElementById('topbar').style.display = 'none'
    renderAggregator()
  } else if (state.activeCid === '__ood__') {
    document.getElementById('topbar').style.display = 'none'
    renderOod()
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
  const fid = document.getElementById('chFolder')?.value || null
  if (!name) { alert(t('请填写章节名称', 'Please enter a chapter name')); return }

  if (getChSource() === 'file') {
    // Local file: skip AI analysis — store raw content, go straight to quiz tab
    const rawContent = getChFileContent()
    if (!rawContent) { alert(t('请先选择文件', 'Please select a file first')); return }
    const url = `[local: ${getChFileName()}]`
    const id = uid()
    state.S.chapters.push({ id, name, url, folderId: fid, analysis: '', rawContent, createdAt: new Date().toISOString() })
    save(); renderSB(); selCh(id, 'quiz')
    return
  }

  const url = (document.getElementById('chUrl')?.value || '').trim()
  const pasteContent = (document.getElementById('chContent')?.value || '').trim()
  if (!url && !pasteContent) { alert(t('请填写文档 URL 或粘贴内容', 'Please enter a doc URL or paste content')); return }

  const effectiveUrl = url || '[pasted content]'
  showLoading(t('正在准备…', 'Preparing…'), pasteContent && !url
    ? t('使用粘贴内容分析…', 'Analyzing pasted content…')
    : pasteContent
      ? t('使用粘贴内容，跳过网络获取', 'Using pasted content, skipping URL fetch')
      : `${t('正在获取：', 'Fetching: ')}${url}`)
  try {
    const analysis = await buildAnalysis(name, effectiveUrl, pasteContent)
    const id = uid()
    state.S.chapters.push({ id, name, url: effectiveUrl, folderId: fid, analysis, createdAt: new Date().toISOString() })
    save(); renderSB(); selCh(id)
  } catch (err) { showErr(err?.message || String(err)) }
}

// ── EVENT LISTENERS ───────────────────────────────────────────────────────────

document.getElementById('addChBtn').addEventListener('click', () => {
  state.activeCid = null; renderSB()
  document.getElementById('topbar').style.display = 'none'
  resetWelcomeState()
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
  chSwitchSource, chPickFile, chHandleFile, chHandleDrop,
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
  showSettings, saveApiKey, switchProvider,
  setLang, renderCurrent,
  // Auth
  doSignIn, doSignOut,
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
  // PDF export + data backup
  exportStory, exportAllStories, exportBqAnswer, exportAllBqAnswers,
  exportBackup, importBackup,
  // BQ Prep
  renderBqPrep, openBqDetail, closeBqDetail,
  addBq, saveBq, deleteBq,
  linkStory, unlinkStory, showStoryPicker, tuneBqAnswer,
  // Aggregator
  selAggregator, renderAggregator,
  aggrPickFolder, aggrPickFiles, aggrCancel, aggrClear, aggrExportPdf,
  // OOD Practice
  selOod, renderOod, openOodQ, oodBackToList, oodSwitchLang, oodCodeInput, oodAnalyze,
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

// Wire sync callback (avoids circular dep between state.js and sync.js)
setSyncCallback(schedulePush)
initSync()

// Auth: register callback BEFORE initAuth so SIGNED_IN/INITIAL_SESSION are not missed
onAuthChange((event, user) => {
  renderSB()   // update footer (sign-in banner ↔ email + sync badge)
  if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && user) {
    pullOnStart()
  }
})
// initAuth fires auth events during its execution (magic link redirect, cached session);
// after it resolves, catch any state that may have been set before the callback registered
initAuth().then(() => {
  renderSB()
  if (getUser()) pullOnStart()
})
