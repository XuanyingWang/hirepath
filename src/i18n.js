// ── I18N ──────────────────────────────────────────────────────────────────────
import { state } from './state.js'

export function t(zh, en) { return state.lang === 'en' ? en : zh }

export function applyLangStatics() {
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'zh-CN'
  const lsub = document.querySelector('.lsub')
  if (lsub) lsub.textContent = t('Google SDE 面试备考', 'Google SDE Interview Prep')
  const addBtn = document.getElementById('addChBtn')
  if (addBtn) addBtn.textContent = t('+ 添加章节', '+ Add Chapter')
  const tabK = document.getElementById('tabKnowledge')
  if (tabK) tabK.textContent = t('知识框架', 'Knowledge')
  const tabQ = document.getElementById('tabQuiz')
  if (tabQ) tabQ.textContent = t('Quiz 练习', 'Quiz')
  const tabF = document.getElementById('tabFlashcard')
  if (tabF) tabF.textContent = t('🃏 闪卡', '🃏 Flashcards')
}
