// ── BEHAVIORAL — SHARED ───────────────────────────────────────────────────────
import { state } from '../state.js'
import { t } from '../i18n.js'

export function getBh() {
  if (!state.S.behavioral) state.S.behavioral = { resumes: [], stories: [], bqStore: [], resumeTemplates: [] }
  if (!state.S.behavioral.bqStore) state.S.behavioral.bqStore = []
  if (!state.S.behavioral.resumeTemplates) state.S.behavioral.resumeTemplates = []
  return state.S.behavioral
}

export function resumeHeader() {
  return `
    <div class="bh-header">
      <div class="bh-title">
        <span class="bh-icon">📄</span>
        <div>
          <div class="bh-h1">${t('简历分析器', 'Resume Analyzer')}</div>
          <div class="bh-sub">${t('提取经历要点，生成主管深度追问，润色回答', 'Extract bullets, generate HM deep-dive questions, polish answers')}</div>
        </div>
      </div>
    </div>`
}

export function bqHeader() {
  return `
    <div class="bh-header">
      <div class="bh-title">
        <span class="bh-icon">🎯</span>
        <div>
          <div class="bh-h1">${t('BQ 备考', 'BQ Prep')}</div>
          <div class="bh-sub">${t('Google L5 高频行为题库 + STAR 故事库', 'Google L5 BQ bank + STAR story builder')}</div>
        </div>
      </div>
      <div class="bh-tabs">
        <button class="bh-tab${state.bqTab === 'bqstore' ? ' active' : ''}" onclick="setBqTab('bqstore')">📋 ${t('BQ 题库', 'BQ Store')}</button>
        <button class="bh-tab${state.bqTab === 'storystore' ? ' active' : ''}" onclick="setBqTab('storystore')">📖 ${t('故事库', 'Story Store')}</button>
      </div>
    </div>`
}
