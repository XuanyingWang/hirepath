// ── FLASHCARD MODE ────────────────────────────────────────────────────────────
import { state, gch, save, uid } from './state.js'
import { t } from './i18n.js'
import { esc, showLoading, showErr } from './util.js'
import { claude } from './api.js'

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderFlashcards() {
  const c = gch(); if (!c) return
  if (!c.flashcards || c.flashcards.length === 0) {
    renderFcSetup(c); return
  }
  // Start a fresh session when switching to a new chapter
  if (state.fcSessionCid !== state.activeCid || state.fcSession.length === 0) {
    _startSession(c.flashcards)
  }
  if (state.fcIdx >= state.fcSession.length) {
    renderFcSummary(c); return
  }
  renderFcCard(c)
}

// ── Setup (no flashcards yet) ─────────────────────────────────────────────────

function renderFcSetup(c) {
  document.getElementById('mainContent').innerHTML = `
    <div class="fc-wrap">
      <div class="fc-setup">
        <div class="fc-setup-icon">🃏</div>
        <h2>${t('Flashcard 模式', 'Flashcard Mode')}</h2>
        <p>${t(
          'AI 从该章节的学习框架中生成 12 张闪卡。<br>每张卡正面是概念/问题，背面是解析。',
          'AI generates 12 flashcards from this chapter\'s knowledge framework.<br>Each card has a concept or question on the front and an explanation on the back.'
        )}</p>
        <button class="btn-primary" onclick="generateFlashcards()" style="margin-top:8px">
          ✨ ${t('生成 Flashcards', 'Generate Flashcards')}
        </button>
        ${(c.analysis || c.rawContent) ? '' : `<p class="fc-warn">${t('请先在知识框架标签页生成学习内容。', 'Generate the knowledge framework first.')}</p>`}
      </div>
    </div>`
}

// ── Generate cards via Claude ─────────────────────────────────────────────────

export async function generateFlashcards() {
  const c = gch(); if (!c) return
  if (!c.analysis && !c.rawContent) { alert(t('请先生成知识框架。', 'Please generate the knowledge framework first.')); return }
  showLoading(t('正在生成 Flashcards…', 'Generating flashcards…'), `Claude ${t('正在为', 'is creating cards for')} 「${c.name}」`)
  try {
    const digest = c.analysis
      ? c.analysis.slice(0, 3000)
      : (c.rawContent || '').slice(0, 5000)
    const sys = `You are creating SDE II interview prep flashcards. Generate exactly 12 flashcards.
Mix: key term definitions (4), architectural/design concepts (4), and tradeoff or "why" questions (4).
Return ONLY a valid JSON array — no markdown, no preamble:
[{"front":"concise question or term (≤15 words)","back":"clear answer, 2-4 sentences with specifics"}]`
    const raw = await claude(sys, `Chapter: ${c.name}\n\nContent:\n${digest}`, 3000, 'fast')
    let s = raw.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim()
    const start = s.indexOf('['); if (start > 0) s = s.slice(start)
    const cards = JSON.parse(s)
    c.flashcards = cards.map(card => ({ id: uid(), front: card.front || '', back: card.back || '' }))
    c.flashcardProgress = {}
    save()
    _startSession(c.flashcards)
    renderFcCard(c)
  } catch (err) {
    showErr(err?.message || String(err))
  }
}

// ── Card render ───────────────────────────────────────────────────────────────

function renderFcCard(c) {
  const card = state.fcSession[state.fcIdx]
  if (!card) { renderFcSummary(c); return }
  const prog = c.flashcardProgress || {}
  const known = Object.values(prog).filter(v => v === 'known').length
  const total = state.fcSession.length
  const pct = (state.fcIdx / total) * 100

  document.getElementById('mainContent').innerHTML = `
    <div class="fc-wrap">
      <div class="fc-progress-hd">
        <span class="fc-prog-label">${t(`第 ${state.fcIdx + 1} / ${total} 张`, `Card ${state.fcIdx + 1} / ${total}`)}</span>
        <span class="fc-known-badge">✓ ${known} ${t('已掌握', 'known')}</span>
      </div>
      <div class="fc-prog-bar"><div class="fc-prog-fill" style="width:${pct}%"></div></div>

      <div class="fc-scene" onclick="flipCard()">
        <div class="fc-card${state.fcFlipped ? ' flipped' : ''}" id="fc-card">
          <div class="fc-face fc-front">
            <div class="fc-face-label">${t('概念 / 问题', 'CONCEPT / QUESTION')}</div>
            <div class="fc-front-text">${esc(card.front)}</div>
            <div class="fc-tap-hint">↓ ${t('点击翻转查看解析', 'Click to reveal answer')}</div>
          </div>
          <div class="fc-face fc-back">
            <div class="fc-face-label">${t('解析', 'ANSWER')}</div>
            <div class="fc-back-text">${esc(card.back)}</div>
          </div>
        </div>
      </div>

      <div class="fc-actions" id="fc-actions" style="display:${state.fcFlipped ? 'flex' : 'none'}">
        <button class="fc-btn fc-btn-learning" onclick="markCard('learning')">
          ✗ ${t('还需学习', 'Still Learning')}
        </button>
        <button class="fc-btn fc-btn-known" onclick="markCard('known')">
          ✓ ${t('已掌握', 'Got It')}
        </button>
      </div>
      ${!state.fcFlipped ? `
        <div style="text-align:center;margin-top:12px">
          <button class="btn-sec" onclick="skipCard()" style="font-size:12px">
            ${t('跳过 →', 'Skip →')}
          </button>
        </div>` : ''}

      <div class="fc-nav-row">
        <button class="btn-sec" onclick="regenerateFlashcards()">↺ ${t('重新生成', 'Regenerate')}</button>
        <button class="btn-sec" onclick="restartFcSession('all')">${t('↩ 重新开始', '↩ Restart')}</button>
      </div>
    </div>`
}

// ── Card interactions (DOM-only updates for performance) ──────────────────────

export function flipCard() {
  state.fcFlipped = !state.fcFlipped
  const card = document.getElementById('fc-card')
  if (card) card.classList.toggle('flipped', state.fcFlipped)
  const actions = document.getElementById('fc-actions')
  if (actions) actions.style.display = state.fcFlipped ? 'flex' : 'none'
  // Re-render to show/hide skip button properly
  const c = gch(); if (c) renderFcCard(c)
}

export function markCard(status) {
  const c = gch(); if (!c) return
  const card = state.fcSession[state.fcIdx]
  if (!card) return
  if (!c.flashcardProgress) c.flashcardProgress = {}
  c.flashcardProgress[card.id] = status
  save()
  state.fcIdx++
  state.fcFlipped = false
  if (state.fcIdx >= state.fcSession.length) { renderFcSummary(c); return }
  renderFcCard(c)
}

export function skipCard() {
  state.fcIdx++
  state.fcFlipped = false
  const c = gch()
  if (!c) return
  if (state.fcIdx >= state.fcSession.length) { renderFcSummary(c); return }
  renderFcCard(c)
}

// ── Summary ───────────────────────────────────────────────────────────────────

function renderFcSummary(c) {
  const prog = c.flashcardProgress || {}
  const total = c.flashcards?.length || 0
  const known = Object.values(prog).filter(v => v === 'known').length
  const learning = Object.values(prog).filter(v => v === 'learning').length
  const pct = total > 0 ? Math.round(known / total * 100) : 0
  const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚'

  document.getElementById('mainContent').innerHTML = `
    <div class="fc-wrap">
      <div class="fc-summary">
        <div class="fc-summary-emoji">${emoji}</div>
        <h2>${t('本轮完成！', 'Round Complete!')}</h2>
        <div class="fc-summary-stats">
          <div class="fc-stat fc-stat-known">
            <div class="fc-stat-n">${known}</div>
            <div class="fc-stat-l">✓ ${t('已掌握', 'Known')}</div>
          </div>
          <div class="fc-stat fc-stat-learning">
            <div class="fc-stat-n">${learning}</div>
            <div class="fc-stat-l">✗ ${t('还需学习', 'Learning')}</div>
          </div>
          <div class="fc-stat">
            <div class="fc-stat-n">${pct}%</div>
            <div class="fc-stat-l">${t('掌握率', 'Mastery')}</div>
          </div>
        </div>
        <div class="fc-summary-actions">
          ${learning > 0 ? `
            <button class="btn-primary" onclick="restartFcSession('learning')">
              🔁 ${t(`复习 ${learning} 张未掌握的卡片`, `Review ${learning} learning cards`)}
            </button>` : ''}
          <button class="btn-sec" onclick="restartFcSession('all')">
            ↩ ${t('重新开始全部', 'Restart All Cards')}
          </button>
          <button class="btn-sec" onclick="regenerateFlashcards()">
            ↺ ${t('重新生成', 'Regenerate')}
          </button>
        </div>
      </div>
    </div>`
}

// ── Session helpers ───────────────────────────────────────────────────────────

function _startSession(cards) {
  state.fcSession = [...cards].sort(() => Math.random() - 0.5) // shuffle
  state.fcIdx = 0
  state.fcFlipped = false
  state.fcSessionCid = state.activeCid
}

export function restartFcSession(filter = 'all') {
  const c = gch(); if (!c || !c.flashcards) return
  const prog = c.flashcardProgress || {}
  const cards = filter === 'learning'
    ? c.flashcards.filter(card => prog[card.id] !== 'known')
    : c.flashcards
  if (cards.length === 0) { renderFcSummary(c); return }
  _startSession(cards)
  state.fcFlipped = false
  renderFcCard(c)
}

export async function regenerateFlashcards() {
  const c = gch(); if (!c) return
  if (!confirm(t('重新生成会清除当前卡片和进度，确认继续？', 'Regenerate will clear current cards and progress. Continue?'))) return
  c.flashcards = null; c.flashcardProgress = {}
  state.fcSession = []; state.fcIdx = 0; state.fcFlipped = false; state.fcSessionCid = null
  save()
  generateFlashcards()
}
