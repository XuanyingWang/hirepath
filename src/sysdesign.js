// ── SYSTEM DESIGN PRACTICE ────────────────────────────────────────────────────
import { state } from './state.js'
import { t } from './i18n.js'
import { esc, md2h } from './util.js'
import { claudeStream } from './api.js'
import { initPaneDrag } from './panedrag.js'

// ── Module state ──────────────────────────────────────────────────────────────
let _currentQ = null
let _answers = {}   // { 'qid:section_key': string }
let _analysis = {}  // { qid: string }
let _streaming = false

// ── Section template ──────────────────────────────────────────────────────────
const SECTIONS = [
  {
    key: 'requirements',
    zh: '需求分析',
    en: 'Requirements',
    tip_zh: '功能需求 · 非功能需求（延迟 / 可用性 / 一致性）· 规模约束（DAU · QPS · 存储量）',
    tip_en: 'Functional requirements · Non-functional (latency / availability / consistency) · Scale (DAU, QPS, storage)',
  },
  {
    key: 'estimation',
    zh: '容量估算',
    en: 'Capacity Estimation',
    tip_zh: '读写 QPS · 存储量（日 / 年）· 带宽 · 缓存大小',
    tip_en: 'Read/write QPS · Storage (daily / yearly) · Bandwidth · Cache size',
  },
  {
    key: 'api',
    zh: 'API 设计',
    en: 'API Design',
    tip_zh: '核心接口：method · endpoint · 关键参数 · 返回值',
    tip_en: 'Key endpoints: method · path · params · response shape',
  },
  {
    key: 'data_model',
    zh: '数据模型',
    en: 'Data Model',
    tip_zh: '核心表 / 文档结构，字段类型，主键 / 索引，SQL vs NoSQL 理由',
    tip_en: 'Core tables / documents, field types, PK / indexes, SQL vs NoSQL justification',
  },
  {
    key: 'hld',
    zh: '高层架构',
    en: 'High-Level Design',
    tip_zh: '组件图：客户端 → LB → 服务 → 缓存 → 存储；数据流；核心服务职责',
    tip_en: 'Component diagram: client → LB → services → cache → storage; data flow; service responsibilities',
  },
  {
    key: 'deep_dive',
    zh: '深入探讨',
    en: 'Deep Dive',
    tip_zh: '挑 1-2 个核心子问题：热点 · 分库分表 · 消息队列 · 一致性方案',
    tip_en: 'Pick 1-2 critical sub-problems: hot-key, sharding, message queue, consistency model',
  },
  {
    key: 'tradeoffs',
    zh: '权衡与替代方案',
    en: 'Trade-offs & Alternatives',
    tip_zh: '关键决策是什么？有哪些替代方案？各自的利弊？',
    tip_en: 'Key decisions made, alternatives considered, pros/cons of your choices',
  },
]

// ── Question catalogue ────────────────────────────────────────────────────────
const QUESTIONS = [
  {
    id: 'url_shortener',
    icon: '🔗',
    title: 'URL Shortener',
    difficulty: 'medium',
    desc_zh: '设计类似 TinyURL / bit.ly 的短链服务：长链转短码、重定向、点击统计，支持亿级 URL。',
    desc_en: 'Design a URL shortening service like TinyURL — long-to-short conversion, redirect, click analytics, at billion-URL scale.',
    topics: ['Hashing', 'Caching', 'NoSQL', 'Scalability'],
  },
  {
    id: 'chat',
    icon: '💬',
    title: 'Chat System',
    difficulty: 'hard',
    desc_zh: '设计类似 WhatsApp / WeChat 的即时聊天系统，支持单聊、群聊、消息持久化与离线推送。',
    desc_en: 'Design a real-time chat system like WhatsApp — 1:1 and group messaging, message persistence, offline push notifications.',
    topics: ['WebSocket', 'Message Queue', 'Push Notification', 'Storage'],
  },
  {
    id: 'twitter_feed',
    icon: '🐦',
    title: 'Twitter Timeline',
    difficulty: 'hard',
    desc_zh: '设计 Twitter 信息流：tweet 发布、关注关系、主页 Timeline 生成与百万级并发展示。',
    desc_en: 'Design Twitter news feed — tweet publishing, follow graph, home timeline generation and serving at millions of concurrent users.',
    topics: ['Fan-out', 'Caching', 'Graph', 'CDN'],
  },
  {
    id: 'youtube',
    icon: '📺',
    title: 'Video Streaming',
    difficulty: 'hard',
    desc_zh: '设计类 YouTube 视频平台：上传、转码流水线、对象存储与全球低延迟流媒体播放。',
    desc_en: 'Design a video streaming platform like YouTube — upload pipeline, transcoding, object storage, global low-latency playback.',
    topics: ['CDN', 'Object Storage', 'Transcoding', 'Streaming Protocol'],
  },
  {
    id: 'notification',
    icon: '🔔',
    title: 'Notification System',
    difficulty: 'medium',
    desc_zh: '设计多渠道通知系统（Push / Email / SMS），要求高吞吐、可靠投递、用户偏好管理与限流。',
    desc_en: 'Design a multi-channel notification system (push / email / SMS) — high throughput, reliable delivery, user preferences, rate limiting.',
    topics: ['Message Queue', 'Fan-out', 'Retry', 'APNs / FCM'],
  },
  {
    id: 'autocomplete',
    icon: '🔍',
    title: 'Search Autocomplete',
    difficulty: 'medium',
    desc_zh: '设计搜索框实时补全服务：用户每次击键后 <100ms 内返回 Top-K 热门候选词。',
    desc_en: 'Design a search autocomplete service — return Top-K suggestions within 100ms of each keystroke.',
    topics: ['Trie', 'Caching', 'Ranking', 'Data Pipeline'],
  },
  {
    id: 'ride_sharing',
    icon: '🚕',
    title: 'Ride-Sharing (Uber)',
    difficulty: 'hard',
    desc_zh: '设计类 Uber 打车系统：司机实时位置更新、附近司机查询、行程匹配与动态定价。',
    desc_en: 'Design a ride-sharing service like Uber — real-time driver location, nearby driver lookup, trip matching, dynamic pricing.',
    topics: ['Geospatial Index', 'WebSocket', 'Consistent Hashing', 'Location Service'],
  },
  {
    id: 'web_crawler',
    icon: '🕷️',
    title: 'Web Crawler',
    difficulty: 'medium',
    desc_zh: '设计分布式网络爬虫：以千页/秒速度抓取并刷新网页，处理重复、爬虫陷阱与 politeness 策略。',
    desc_en: 'Design a distributed web crawler — fetch and refresh pages at thousands/sec, handling deduplication, crawl traps, and politeness.',
    topics: ['URL Frontier', 'Bloom Filter', 'DNS', 'Distributed Queue'],
  },
  {
    id: 'rate_limiter_dist',
    icon: '🚦',
    title: 'Distributed Rate Limiter',
    difficulty: 'medium',
    desc_zh: '设计跨节点协调的分布式限流系统：per-user / per-API 配额，无单点故障，毫秒级判断。',
    desc_en: 'Design a distributed rate limiter — per-user and per-API quotas coordinated across nodes, no SPOF, sub-millisecond decisions.',
    topics: ['Redis', 'Sliding Window', 'Consistent Hashing', 'Token Bucket'],
  },
  {
    id: 'key_value_store',
    icon: '🗄️',
    title: 'Distributed Key-Value Store',
    difficulty: 'hard',
    desc_zh: '设计类似 DynamoDB / Redis Cluster 的分布式 KV 存储：一致性哈希、副本、故障转移与 CAP 取舍。',
    desc_en: 'Design a distributed key-value store like DynamoDB — consistent hashing, replication, failover, and CAP trade-offs.',
    topics: ['Consistent Hashing', 'Replication', 'Gossip Protocol', 'CAP Theorem'],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getQ(id) { return QUESTIONS.find(q => q.id === id) }

function _answerKey(qid, skey) { return `${qid}:${skey}` }

function _getAnswer(qid, skey) { return _answers[_answerKey(qid, skey)] || '' }

function _setAnswer(qid, skey, val) { _answers[_answerKey(qid, skey)] = val }

function _saveAllAnswers() {
  if (!_currentQ) return
  SECTIONS.forEach(s => {
    const ta = document.getElementById(`sd-${s.key}`)
    if (ta) _setAnswer(_currentQ, s.key, ta.value)
  })
}

// ── Renders ───────────────────────────────────────────────────────────────────

export function renderSysDesign() {
  _currentQ = null
  document.getElementById('mainContent').innerHTML = `
    <div class="ood-wrap">
      <div class="ood-list-hd">
        <h2>🌐 ${t('系统设计练习', 'System Design Practice')}</h2>
        <p>${t('10 道经典题 · 结构化模板答题 · AI 全维度评审', '10 classic problems · Structured template · AI full-dimension review')}</p>
      </div>
      <div class="ood-q-list">
        ${QUESTIONS.map(q => `
          <div class="ood-q-card" onclick="openSysDesignQ('${q.id}')">
            <div class="ood-q-card-left">
              <span class="ood-q-icon">${q.icon}</span>
              <div>
                <div class="ood-q-title">${esc(q.title)}</div>
                <div class="ood-q-desc">${esc(state.lang === 'en' ? q.desc_en : q.desc_zh)}</div>
              </div>
            </div>
            <div class="ood-q-card-right">
              <span class="ood-diff-badge ${q.difficulty}">${q.difficulty[0].toUpperCase() + q.difficulty.slice(1)}</span>
              <span class="ood-arrow">→</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`
}

export function openSysDesignQ(id) {
  _currentQ = id
  _renderQuestion()
}

function _renderQuestion() {
  const q = _getQ(_currentQ)
  if (!q) return

  const desc = state.lang === 'en' ? q.desc_en : q.desc_zh
  const analysis = _analysis[q.id] || ''

  const sectionsHtml = SECTIONS.map((s, i) => {
    const label = state.lang === 'en' ? s.en : s.zh
    const tip   = state.lang === 'en' ? s.tip_en : s.tip_zh
    const saved = _getAnswer(q.id, s.key)
    return `
      <div class="sd-section">
        <div class="sd-section-hd">
          <span class="sd-section-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="sd-section-label">${esc(label)}</span>
          <span class="sd-section-tip">${esc(tip)}</span>
        </div>
        <textarea
          class="sd-textarea"
          id="sd-${s.key}"
          spellcheck="false"
          oninput="sdInput('${s.key}')"
          placeholder="${esc(tip)}"
        >${esc(saved)}</textarea>
      </div>`
  }).join('')

  const topicsHtml = q.topics.map(tp =>
    `<span class="sd-topic-chip">${esc(tp)}</span>`
  ).join('')

  document.getElementById('mainContent').innerHTML = `
    <div class="ood-wrap">
      <div class="ood-q-hd">
        <button class="btn-sec ood-back-btn" onclick="sysDesignBackToList()">← ${t('返回', 'Back')}</button>
        <span class="ood-q-hd-icon">${q.icon}</span>
        <h2>${esc(q.title)}</h2>
        <span class="ood-diff-badge ${q.difficulty}">${q.difficulty[0].toUpperCase() + q.difficulty.slice(1)}</span>
      </div>
      <div class="ood-editor-layout">
        <div class="ood-pane-code sd-sections-pane" id="oodPaneCode">
          ${sectionsHtml}
        </div>
        <div class="ood-divider" id="oodDivider"></div>
        <div class="ood-pane-side" id="oodPaneSide">
          <div class="ood-scenarios-box">
            <div class="ood-scenarios-hd">📌 ${t('题目描述', 'Problem')}</div>
            <p style="font-size:13px;line-height:1.7;margin:6px 0 10px">${esc(desc)}</p>
            <div class="sd-topics">${topicsHtml}</div>
          </div>
          <button class="btn-primary ood-analyze-btn" id="sdAnalyzeBtn" onclick="sdAnalyze()">
            🔍 ${t('分析我的设计', 'Analyze My Design')}
          </button>
          <div id="sdAnalysis" class="ood-analysis">
            ${analysis
              ? md2h(analysis)
              : `<div class="ood-analysis-empty">${t('填写各模块后点击「分析」获取 AI 评审', 'Fill in the sections then click "Analyze" for AI review')}</div>`}
          </div>
        </div>
      </div>
    </div>`

  initPaneDrag()
}

// ── User actions ──────────────────────────────────────────────────────────────

export function sysDesignBackToList() {
  _saveAllAnswers()
  renderSysDesign()
}

export function sdInput(skey) {
  if (!_currentQ) return
  const ta = document.getElementById(`sd-${skey}`)
  if (ta) _setAnswer(_currentQ, skey, ta.value)
}

export async function sdAnalyze() {
  if (!_currentQ || _streaming) return
  const q = _getQ(_currentQ)
  if (!q) return

  _saveAllAnswers()

  const allEmpty = SECTIONS.every(s => !_getAnswer(q.id, s.key).trim())
  if (allEmpty) {
    alert(t('请至少填写一个模块再分析', 'Please fill in at least one section before analyzing'))
    return
  }

  _streaming = true
  const btn = document.getElementById('sdAnalyzeBtn')
  if (btn) { btn.disabled = true; btn.textContent = `⟳ ${t('分析中…', 'Analyzing…')}` }

  const analysisDiv = document.getElementById('sdAnalysis')
  if (analysisDiv) {
    analysisDiv.innerHTML = `<div class="ood-analysis-loading">
      ⟳ ${t('AI 正在评审你的系统设计…', 'AI is reviewing your system design…')}</div>`
  }

  const replyLang = state.lang === 'en' ? 'English' : '中文'
  const system = `You are a principal engineer conducting a system design interview. \
Evaluate the candidate's design critically and constructively. Use Markdown. \
Reply in ${replyLang}.`

  const sectionDump = SECTIONS.map(s => {
    const label = s.en
    const val   = _getAnswer(q.id, s.key).trim() || '(not provided)'
    return `### ${label}\n${val}`
  }).join('\n\n')

  const userMsg = `## Problem: ${q.title}
${q.desc_en}

## Candidate's Design

${sectionDump}

---

Evaluate the design on these dimensions (use ### headers):

### 1. Requirements Clarity
Did the candidate scope the problem well? Any missing functional or non-functional requirements?

### 2. Capacity & Scalability
Are the estimations reasonable? Does the architecture handle the stated scale?

### 3. API & Data Model
Are the interfaces clean and complete? Is the data model appropriate and efficient?

### 4. Architecture Soundness
Is the high-level design coherent? Are the right components chosen? Single points of failure?

### 5. Deep Dive Quality
Did the candidate go deep enough on critical sub-problems? Are edge cases addressed?

### 6. Trade-off Awareness
Did the candidate justify key decisions? Were alternatives considered?

### 7. Overall Assessment
What would pass a principal-level bar? What are the top 2-3 improvements needed?`

  try {
    const result = await claudeStream(system, userMsg, 3000, (accumulated) => {
      const div = document.getElementById('sdAnalysis')
      if (div) div.innerHTML = md2h(accumulated)
    })
    _analysis[_currentQ] = result
    const div = document.getElementById('sdAnalysis')
    if (div) div.innerHTML = md2h(result)
  } catch (err) {
    const div = document.getElementById('sdAnalysis')
    if (div) div.innerHTML = `<div class="ood-analysis-error">
      ${t('分析失败：', 'Analysis failed: ')}${esc(err?.message || String(err))}</div>`
  } finally {
    _streaming = false
    const btn = document.getElementById('sdAnalyzeBtn')
    if (btn) { btn.disabled = false; btn.textContent = `🔍 ${t('重新分析', 'Re-analyze')}` }
  }
}
