// ── QUIZ ──────────────────────────────────────────────────────────────────────
import { state, gch, save, uid } from './state.js'
import { t } from './i18n.js'
import { esc, showLoading, showErr } from './util.js'
import { claude, claudeQuiz } from './api.js'

export function renderQuizSetup() {
  const c = gch(); if (!c) return
  const selectedMode = state.setupModes[state.activeCid] || 'concept'
  const history = c.quizHistory || []

  const histHtml = history.length === 0 ? '' : `
    <div class="qh-section">
      <div class="qh-hd">${t('历史记录', 'History')} <span class="qh-cnt">${history.length} ${t('次', 'sessions')}</span></div>
      ${history.map((h, i) => {
        const pct = Math.round(h.score / h.total * 100)
        const grade = pct >= 80 ? 'good' : pct >= 60 ? 'ok' : 'bad'
        const d = new Date(h.date)
        const locale = state.lang === 'en' ? 'en-US' : 'zh-CN'
        const dateStr = d.toLocaleDateString(locale) + ' ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
        return `<div class="qh-card">
          <div class="qh-info">
            <span class="qh-date">${dateStr}</span>
            <span class="q-mode-badge" style="font-size:10px">${h.mode === 'concept' ? `💡 ${t('概念题', 'Concept')}` : `🔧 ${t('场景题', 'Scenario')}`}</span>
          </div>
          <div class="qh-right">
            <span class="qh-score ${grade}">${h.score}/${h.total} · ${pct}%</span>
            <button class="btn-review" onclick="reviewSession(${i})">${t('回顾 →', 'Review →')}</button>
          </div>
        </div>`
      }).join('')}
    </div>`

  document.getElementById('mainContent').innerHTML = `
    <div class="quiz-setup">
      <h2>Quiz · ${esc(c.name)}</h2>
      <p>${t('选择题型，AI 生成 10 道定制的 L5 面试题目，每题含提示和解析。', 'Choose a question type. AI generates 10 custom L5 interview questions, each with a hint and explanation.')}</p>
      <div class="mode-grid">
        <div class="mode-card${selectedMode === 'concept' ? ' selected' : ''}" onclick="pickMode(this,'concept')">
          <div class="mi">💡</div><div class="mt">${t('概念题', 'Concept')}</div>
          <div class="md">${t('定义·原理·对比分析，考查基础理解的深度与广度', 'Definitions, principles, and comparisons — tests depth of foundational understanding')}</div>
        </div>
        <div class="mode-card${selectedMode === 'scenario' ? ' selected' : ''}" onclick="pickMode(this,'scenario')">
          <div class="mi">🔧</div><div class="mt">${t('场景题', 'Scenario')}</div>
          <div class="md">${t('系统设计决策·故障排查·性能优化等实战场景', 'System design decisions, debugging, performance optimization, and real-world scenarios')}</div>
        </div>
      </div>
      <button class="btn-primary" onclick="startQuiz()">${t('开始 10 题 →', 'Start 10 Questions →')}</button>
      ${histHtml}
    </div>`
}

export function pickMode(el, m) {
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'))
  el.classList.add('selected'); state.setupModes[state.activeCid] = m
}

export async function startQuiz() {
  const c = gch(); const mode = state.setupModes[state.activeCid] || 'concept'
  showLoading(t('正在生成题目…', 'Generating questions…'), t(`生成 10 道 L5 级别${mode === 'concept' ? '概念' : '场景'}题`, `Generating 10 L5-level ${mode === 'concept' ? 'concept' : 'scenario'} questions`))
  try {
    const qs = await genQuiz(c, mode)
    state.quizState = { cid: state.activeCid, mode, questions: qs, current: 0, answers: [], score: 0 }
    renderQ()
  } catch (err) { showErr(err?.message || String(err)) }
}

async function genQuiz(c, mode) {
  const mDesc = mode === 'concept'
    ? '概念理解题（定义、原理、权衡对比、方案比较）'
    : '场景实战题（系统设计决策、故障排查、性能优化、容量规划）'
  const digest = c.analysis
    ? c.analysis.slice(0, 3000)
    : (c.rawContent || '').slice(0, 5000)
  const sys = '只返回一个合法的 JSON 数组，不要包含任何 markdown 标记、解释或文字说明代码块。直接输出 [ 开头的 JSON。'

  const makePrompt = (batch, start, angleHint) =>
    `请为 Google L5 SDE 面试出第 ${start + 1}-${start + batch} 道关于「${c.name}」的${mDesc}，共出 ${batch} 道。${angleHint}

知识摘要：
${digest}

要求：
- 所有题目、选项、提示、解析必须用中文（代码/API名称除外）
- L5 难度：需要深度理解，不能死记硬背
- 每题恰好 4 个选项，只有一个正确答案（correct 为 0-3 的索引）
- hint：一句话提示，不直接透露答案
- explanation：2-3 句话解释正确答案的原因，以及其他选项为什么错误
- 每题 explanation 不超过 60 字，hint 不超过 30 字

返回格式（仅 JSON 数组，无其他内容）：
[{"q":"题目","options":["A","B","C","D"],"correct":0,"hint":"提示","explanation":"解析"}]`

  // Claude supports parallel calls; Gemini/OpenAI have strict RPM limits so run sequentially.
  let raw1, raw2
  if (state.provider === 'claude') {
    ;[raw1, raw2] = await Promise.all([
      claudeQuiz(sys, makePrompt(5, 0, '\n侧重：核心概念、基本原理、定义对比。')),
      claudeQuiz(sys, makePrompt(5, 5, '\n侧重：边界情况、权衡取舍、综合应用和实战场景，与第1-5题知识点不重复。'))
    ])
  } else {
    raw1 = await claudeQuiz(sys, makePrompt(5, 0, '\n侧重：核心概念、基本原理、定义对比。'))
    raw2 = await claudeQuiz(sys, makePrompt(5, 5, '\n侧重：边界情况、权衡取舍、综合应用和实战场景，与第1-5题知识点不重复。'))
  }

  const qs = [...parseQuizJSON(raw1), ...parseQuizJSON(raw2)]
  if (qs.length === 0) throw new Error('题目生成失败，请重试')
  return qs.slice(0, 10)
}

function parseQuizJSON(raw) {
  let s = raw.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim()
  const start = s.indexOf('[')
  if (start > -1) s = s.slice(start)
  try { return JSON.parse(s) } catch (e) {
    const matches = [...s.matchAll(/\{[^{}]*"q"[^{}]*"options"[^{}]*"correct"[^{}]*"hint"[^{}]*"explanation"[^{}]*\}/g)]
    if (matches.length > 0) {
      try { return JSON.parse('[' + matches.map(m => m[0]).join(',') + ']') } catch (_) {}
    }
    const lastClose = s.lastIndexOf('}')
    if (lastClose > -1) {
      try { return JSON.parse(s.slice(0, lastClose + 1) + ']') } catch (_) {}
    }
    return []
  }
}

export function renderQ() {
  const { questions, current, mode } = state.quizState
  const q = questions[current]
  const pct = (current / questions.length) * 100
  const L = ['A', 'B', 'C', 'D']
  document.getElementById('mainContent').innerHTML = `
    <div class="quiz-active">
      <div class="q-prog-bar"><div class="q-prog-fill" style="width:${pct}%"></div></div>
      <div class="q-meta">
        <span>${t(`第 ${current + 1} / ${questions.length} 题`, `Question ${current + 1} / ${questions.length}`)}</span>
        <span class="q-mode-badge">${mode === 'concept' ? `💡 ${t('概念题', 'Concept')}` : `🔧 ${t('场景题', 'Scenario')}`}</span>
      </div>
      <div class="q-card">
        <div class="q-text">${esc(q.q)}</div>
        <div class="options">
          ${q.options.map((o, i) => `
            <div class="option" data-i="${i}" onclick="pickAns(${i})">
              <span class="opt-key">${L[i]}</span><span>${esc(o)}</span>
            </div>`).join('')}
        </div>
        <div id="hintBox"></div>
        <div id="explBox"></div>
      </div>
      <div class="q-actions">
        <button class="btn-hint" onclick="toggleHint()">💡 ${t('提示', 'Hint')}</button>
        <button class="btn-primary" id="nextBtn" style="display:none;margin-left:auto" onclick="nextQ()">
          ${current + 1 < questions.length ? t('下一题 →', 'Next →') : t('查看结果', 'Results')}
        </button>
      </div>
    </div>`
}

export function toggleHint() {
  const b = document.getElementById('hintBox'); if (b.innerHTML) { b.innerHTML = ''; return }
  const q = state.quizState.questions[state.quizState.current]
  b.innerHTML = `<div class="hint-box"><span class="hint-lbl">${t('提示', 'HINT')}</span>${esc(q.hint)}</div>`
}

export function pickAns(idx) {
  const q = state.quizState.questions[state.quizState.current]
  const opts = document.querySelectorAll('.option')
  opts.forEach(o => o.classList.add('disabled'))
  if (idx === q.correct) { opts[idx].classList.add('correct'); state.quizState.score++ }
  else { opts[idx].classList.add('wrong'); opts[q.correct].classList.add('correct') }
  state.quizState.answers.push({ qi: state.quizState.current, sel: idx, cor: q.correct })
  document.getElementById('explBox').innerHTML = `
    <div class="expl-box"><span class="expl-lbl">${t('解析', 'EXPLANATION')}</span>${esc(q.explanation)}</div>`
  document.getElementById('nextBtn').style.display = 'block'
}

export function nextQ() {
  state.quizState.current++
  state.quizState.current >= state.quizState.questions.length ? renderResults() : renderQ()
}

export function renderResults() {
  const { score, questions, answers, mode } = state.quizState
  const pct = Math.round(score / questions.length * 100)
  const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '😊' : '😅'
  const msg = pct >= 80 ? t('准备充分！', 'Well prepared!') : pct >= 60 ? t('继续加油', 'Keep going') : t('需深入备学', 'Needs more study')

  const c = gch()
  if (c) {
    if (!c.quizHistory) c.quizHistory = []
    c.quizHistory.unshift({
      id: uid(),
      mode,
      date: new Date().toISOString(),
      score,
      total: questions.length,
      questions,
      answers
    })
    if (c.quizHistory.length > 20) c.quizHistory.length = 20
    save()
  }

  document.getElementById('mainContent').innerHTML = `
    <div class="results-wrap">
      <div class="results-card">
        <div class="score-ring">
          <div class="score-n">${score}</div><div class="score-d">/ ${questions.length}</div>
        </div>
        <div class="res-title">${emoji} ${msg}</div>
        <div class="res-sub">${pct}% ${t('正确率', 'accuracy')} · ${mode === 'concept' ? t('概念题', 'Concept') : t('场景题', 'Scenario')}</div>
        <div class="res-list">
          ${answers.map((a, i) => {
            const ok = a.sel === a.cor
            return `<div class="res-row ${ok ? 'ok' : 'fail'}">
              <span class="rq">Q${i + 1}</span>
              <span class="rt">${esc(questions[i].q.slice(0, 55))}${questions[i].q.length > 55 ? '…' : ''}</span>
              <span>${ok ? '✓' : '✗'}</span>
            </div>`
          }).join('')}
        </div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="btn-sec" onclick="renderQuizSetup()">${t('再来一次', 'Try Again')}</button>
          <button class="btn-primary" onclick="selCh('${state.activeCid}')">${t('复习框架', 'Review Notes')}</button>
        </div>
      </div>
    </div>`
}

export function reviewSession(idx) {
  const c = gch(); if (!c) return
  const h = (c.quizHistory || [])[idx]; if (!h) return
  const L = ['A', 'B', 'C', 'D']
  const pct = Math.round(h.score / h.total * 100)
  const locale = state.lang === 'en' ? 'en-US' : 'zh-CN'
  const d = new Date(h.date)
  const dateStr = d.toLocaleDateString(locale) + ' ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  document.getElementById('mainContent').innerHTML = `
    <div class="quiz-active">
      <div class="qr-hd">
        <button class="btn-sec" onclick="renderQuizSetup()">← ${t('返回', 'Back')}</button>
        <span class="qr-meta">
          ${dateStr} &nbsp;·&nbsp;
          ${h.mode === 'concept' ? `💡 ${t('概念题', 'Concept')}` : `🔧 ${t('场景题', 'Scenario')}`} &nbsp;·&nbsp;
          <strong>${h.score}/${h.total}</strong> &nbsp;(${pct}%)
        </span>
      </div>
      ${h.questions.map((q, i) => {
        const a = h.answers[i]
        const ok = a && a.sel === a.cor
        return `<div class="q-card" style="margin-bottom:16px">
          <div class="qr-qnum ${ok ? 'ok' : 'fail'}">Q${i + 1} &nbsp; ${ok ? `✓ ${t('正确', 'Correct')}` : `✗ ${t('错误', 'Wrong')}`}</div>
          <div class="q-text">${esc(q.q)}</div>
          <div class="options">
            ${q.options.map((o, oi) => {
              let cls = 'option disabled'
              if (oi === q.correct) cls += ' correct'
              else if (a && oi === a.sel) cls += ' wrong'
              return `<div class="${cls}">
                <span class="opt-key">${L[oi]}</span><span>${esc(o)}</span>
              </div>`
            }).join('')}
          </div>
          <div class="expl-box" style="margin-top:10px">
            <span class="expl-lbl">${t('解析', 'EXPLANATION')}</span>${esc(q.explanation)}
          </div>
        </div>`
      }).join('')}
    </div>`
}
