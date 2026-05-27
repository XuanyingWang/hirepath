// ── API KEY + PROVIDERS ────────────────────────────────────────────────────────
import { invoke, Channel } from '@tauri-apps/api/core'
import { isTauri } from './platform.js'
import { state } from './state.js'
import { t } from './i18n.js'
import { modal, closeModal, esc } from './util.js'
import { supabaseConfigured } from './supabase.js'
import { getUser, signIn, signOut } from './auth.js'

// ── Init: load all keys + active provider ─────────────────────────────────────

export async function initApiKey() {
  try {
    state.apiKey = isTauri
      ? await invoke('load_api_key')
      : (localStorage.getItem('l5_api_key') || '')
  } catch (e) {
    state.apiKey = ''
  }
  // Load Gemini / OpenAI keys + provider choice
  try {
    if (isTauri) {
      const raw = await invoke('load_provider_config')
      const cfg = JSON.parse(raw)
      state.geminiKey  = cfg.geminiKey  || ''
      state.openaiKey  = cfg.openaiKey  || ''
      state.provider   = cfg.provider   || 'claude'
    } else {
      state.geminiKey  = localStorage.getItem('l5_gemini_key')  || ''
      state.openaiKey  = localStorage.getItem('l5_openai_key')  || ''
      state.provider   = localStorage.getItem('l5provider')     || 'claude'
    }
  } catch (e) {
    state.geminiKey = ''; state.openaiKey = ''
  }
  updateKeyStatusBadge()
  if (!_activeKey()) showSettings(true)
}

function _activeKey() {
  if (state.provider === 'gemini') return state.geminiKey
  if (state.provider === 'openai') return state.openaiKey
  return state.apiKey
}

export function updateKeyStatusBadge() {
  const btn = document.getElementById('settingsBtn')
  if (!btn) return
  const providerLabel = state.provider === 'gemini' ? 'Gemini' : state.provider === 'openai' ? 'OpenAI' : 'Claude'
  const hasKey = !!_activeKey()
  btn.title = hasKey
    ? `${providerLabel} · ${t('API Key 已设置 · 点击修改', 'API Key set · click to change')}`
    : `${providerLabel} · ${t('API Key 未设置 · 点击配置', 'API Key not set · click to configure')}`
  btn.style.opacity = hasKey ? '0.55' : '1'
}

// ── Settings modal ─────────────────────────────────────────────────────────────

export function showSettings(required = false) {
  const user = getUser()
  const authSection = supabaseConfigured
    ? user
      ? `<div class="settings-section">
          <div class="modal-note" style="margin-bottom:6px">${t('云同步账号', 'Cloud sync account')}</div>
          <div class="auth-signed-in">
            <span class="auth-email">✓ ${esc(user.email)}</span>
            <button class="btn-sec btn-sm" onclick="doSignOut()">${t('退出登录', 'Sign out')}</button>
          </div>
        </div>`
      : `<div class="settings-section">
          <div class="modal-note" style="margin-bottom:6px">${t('云同步 · 登录后数据自动备份', 'Cloud sync · sign in to back up your data')}</div>
          <div class="auth-sign-in-row">
            <input class="modal-input auth-email-input" id="auth_email" type="email"
              placeholder="${t('输入邮箱，发送登录链接', 'Enter email to receive a magic link')}">
            <button class="btn-primary btn-sm" onclick="doSignIn()">${t('发送链接', 'Send link')}</button>
          </div>
          <p id="auth_msg" class="modal-note" style="margin-top:6px;min-height:16px"></p>
        </div>`
    : ''

  modal('', [], () => {}, `
    <div class="modal-title">⚙️ ${t('设置', 'Settings')}</div>
    ${required ? `<p class="modal-note" style="color:var(--red);font-weight:500;margin-bottom:10px">${t('首次使用，请先配置 API Key', 'First use — please configure your API Key')}</p>` : ''}

    <div class="settings-section">
      <div class="modal-note" style="margin-bottom:8px">${t('AI 提供商', 'AI Provider')}</div>
      <div class="provider-toggle">
        <button class="provider-btn${state.provider === 'claude'  ? ' active' : ''}" onclick="switchProvider('claude')">Claude</button>
        <button class="provider-btn${state.provider === 'gemini'  ? ' active' : ''}" onclick="switchProvider('gemini')">Gemini</button>
        <button class="provider-btn${state.provider === 'openai'  ? ' active' : ''}" onclick="switchProvider('openai')">ChatGPT</button>
      </div>
      <p class="modal-note" style="margin-top:6px;font-size:11px;opacity:.7">
        ${t('当前模型：', 'Model: ')}
        ${state.provider === 'claude' ? 'claude-sonnet-4' : state.provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini'}
      </p>
    </div>

    <div class="settings-section">
      <div class="modal-note" style="margin-bottom:6px">Anthropic API Key (Claude)</div>
      <div style="position:relative">
        <input class="modal-input" id="sk_claude" type="password"
          placeholder="sk-ant-api03-..."
          value="${esc(state.apiKey)}"
          style="padding-right:2.4rem">
        <button onclick="(function(){var i=document.getElementById('sk_claude');i.type=i.type==='password'?'text':'password';this.textContent=i.type==='password'?'👁':'🙈'}).call(this)"
          style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:1rem;padding:2px 4px">👁</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="modal-note" style="margin-bottom:6px">Google Gemini API Key</div>
      <div style="position:relative">
        <input class="modal-input" id="sk_gemini" type="password"
          placeholder="AIzaSy..."
          value="${esc(state.geminiKey)}"
          style="padding-right:2.4rem">
        <button onclick="(function(){var i=document.getElementById('sk_gemini');i.type=i.type==='password'?'text':'password';this.textContent=i.type==='password'?'👁':'🙈'}).call(this)"
          style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:1rem;padding:2px 4px">👁</button>
      </div>
      <p class="modal-note" style="font-size:11px">
        <a href="https://aistudio.google.com/app/apikey" target="_blank">${t('获取 Gemini Key →', 'Get Gemini Key →')}</a>
      </p>
    </div>

    <div class="settings-section">
      <div class="modal-note" style="margin-bottom:6px">OpenAI API Key (ChatGPT)</div>
      <div style="position:relative">
        <input class="modal-input" id="sk_openai" type="password"
          placeholder="sk-..."
          value="${esc(state.openaiKey)}"
          style="padding-right:2.4rem">
        <button onclick="(function(){var i=document.getElementById('sk_openai');i.type=i.type==='password'?'text':'password';this.textContent=i.type==='password'?'👁':'🙈'}).call(this)"
          style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:1rem;padding:2px 4px">👁</button>
      </div>
      <p class="modal-note" style="font-size:11px">
        <a href="https://platform.openai.com/api-keys" target="_blank">${t('获取 OpenAI Key →', 'Get OpenAI Key →')}</a>
      </p>
    </div>

    <p class="modal-note" style="margin-bottom:10px">
      ${t('所有 Key 仅保存在本地，不会上传。', 'All keys are stored locally and never uploaded.')}
    </p>
    <div class="modal-actions">
      ${!required ? `<button class="btn-sec" onclick="closeModal()">${t('取消', 'Cancel')}</button>` : ''}
      <button class="btn-primary" onclick="saveApiKey()">${t('保存', 'Save')}</button>
    </div>

    <div class="settings-section">
      <div class="modal-note" style="margin-bottom:8px">${t('数据备份', 'Data Backup')}</div>
      <div style="display:flex;gap:8px">
        <button class="btn-sec" style="flex:1" onclick="exportBackup()">⬇ ${t('导出备份', 'Export')}</button>
        <button class="btn-sec" style="flex:1" onclick="importBackup()">⬆ ${t('导入备份', 'Import')}</button>
      </div>
      <p class="modal-note" style="font-size:11px;margin-top:6px;opacity:.75">
        ${t('包含全部章节、故事、BQ 回答（不含 API Key）', 'All chapters, stories & BQ answers — no API keys')}
      </p>
    </div>

    <div class="settings-section">
      <div class="modal-note" style="margin-bottom:8px">Language / 语言</div>
      <div class="lang-toggle">
        <button class="lang-btn${state.lang === 'zh' ? ' active' : ''}" onclick="setLang('zh')">中文</button>
        <button class="lang-btn${state.lang === 'en' ? ' active' : ''}" onclick="setLang('en')">English</button>
      </div>
    </div>
    ${authSection}
  `)
}

/** Called from inline onclick in settings modal to highlight active provider. */
export function switchProvider(p) {
  state.provider = p
  localStorage.setItem('l5provider', p)
  // Update button highlights without re-opening modal
  document.querySelectorAll('.provider-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase() === p ||
      (p === 'openai' && btn.textContent === 'ChatGPT') ||
      (p === 'gemini' && btn.textContent === 'Gemini') ||
      (p === 'claude' && btn.textContent === 'Claude'))
  })
  // Update model hint
  const hint = document.querySelector('.provider-model-hint')
  if (hint) hint.textContent = p === 'claude' ? 'claude-sonnet-4' : p === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini'
  updateKeyStatusBadge()
}

export async function doSignIn() {
  const email = document.getElementById('auth_email')?.value?.trim()
  const msg   = document.getElementById('auth_msg')
  if (!email || !email.includes('@')) {
    if (msg) msg.textContent = t('请输入有效的邮箱地址', 'Please enter a valid email address')
    return
  }
  const btn = document.querySelector('.auth-sign-in-row .btn-primary')
  if (btn) { btn.disabled = true; btn.textContent = t('发送中…', 'Sending…') }
  try {
    await signIn(email)
    if (msg) {
      msg.style.color = 'var(--green)'
      msg.textContent = t('✓ 登录链接已发送，请查收邮件', '✓ Magic link sent — check your inbox')
    }
  } catch (e) {
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = String(e?.message || e) }
    if (btn) { btn.disabled = false; btn.textContent = t('发送链接', 'Send link') }
  }
}

export async function doSignOut() {
  await signOut()
  closeModal()
}

/** Save all three API keys + provider choice. */
function _showSettingsError(msg) {
  const existing = document.getElementById('settings-err')
  if (existing) existing.remove()
  const el = document.createElement('p')
  el.id = 'settings-err'
  el.style.cssText = 'color:var(--red,#e53e3e);font-size:13px;margin:8px 0 0;padding:6px 10px;background:rgba(229,62,62,.1);border-radius:6px'
  el.textContent = msg
  document.querySelector('.modal-box')?.appendChild(el)
}

export async function saveApiKey() {
  const inputEl = document.getElementById('sk_claude')
  const claudeKey = inputEl?.value?.trim() || ''
  const geminiKey = document.getElementById('sk_gemini')?.value?.trim() || ''
  const openaiKey = document.getElementById('sk_openai')?.value?.trim() || ''
  // No strict format check — accept any non-empty key

  try {
    if (isTauri) {
      if (claudeKey) await invoke('save_api_key', { key: claudeKey })
      await invoke('save_provider_config', {
        geminiKey,
        openaiKey,
        provider: state.provider,
      })
    } else {
      if (claudeKey) localStorage.setItem('l5_api_key', claudeKey)
      localStorage.setItem('l5_gemini_key', geminiKey)
      localStorage.setItem('l5_openai_key', openaiKey)
      localStorage.setItem('l5provider', state.provider)
    }
    if (claudeKey) state.apiKey = claudeKey
    state.geminiKey = geminiKey
    state.openaiKey = openaiKey
    updateKeyStatusBadge()
    closeModal()
  } catch (e) {
    console.error('[saveApiKey] ERROR:', e)
    _showSettingsError(t('保存失败：', 'Save failed: ') + e)
  }
}

function _requireKey() {
  const p = state.provider
  if (p === 'gemini' && !state.geminiKey) throw new Error(t('请先配置 Gemini API Key（点击右上角 ⚙️）', 'Please configure your Gemini API Key first (click ⚙️)'))
  if (p === 'openai' && !state.openaiKey)  throw new Error(t('请先配置 OpenAI API Key（点击右上角 ⚙️）', 'Please configure your OpenAI API Key first (click ⚙️)'))
  if (p === 'claude' && !state.apiKey)     throw new Error(t('请先配置 Anthropic API Key（点击右上角 ⚙️）', 'Please configure your Anthropic API Key first (click ⚙️)'))
}

// ── Browser-direct Claude helpers ─────────────────────────────────────────────

// 'smart' = Sonnet (deep analysis, streaming)   'fast' = Haiku (JSON/structured output)
const _CLAUDE_SMART = 'claude-sonnet-4-6'
const _CLAUDE_FAST  = 'claude-haiku-4-5-20251001'
// Tauri backend uses dated model IDs
const _CLAUDE_SMART_ID = 'claude-sonnet-4-6'
const _CLAUDE_FAST_ID  = 'claude-haiku-4-5-20251001'
function _cm(tier) { return tier === 'fast' ? _CLAUDE_FAST : _CLAUDE_SMART }
function _cmId(tier) { return tier === 'fast' ? _CLAUDE_FAST_ID : _CLAUDE_SMART_ID }

const _ANTHROPIC_HEADERS = () => ({
  'Content-Type': 'application/json',
  'x-api-key': state.apiKey,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-calls': 'true',
})

/** Strip ```json ... ``` or ``` ... ``` wrappers a model might add. */
function _stripJsonFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

async function _webCall(system, userMsg, maxTokens, tier = 'smart') {
  const messages = [{ role: 'user', content: userMsg }]
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: _ANTHROPIC_HEADERS(),
    body: JSON.stringify({ model: _cm(tier), max_tokens: maxTokens, system, messages }),
  })
  if (!resp.ok) throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  return data.content[0].text
}

async function _webStream(system, userMsg, maxTokens, onChunk, tier = 'smart') {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: _ANTHROPIC_HEADERS(),
    body: JSON.stringify({ model: _cm(tier), max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: userMsg }], stream: true }),
  })
  if (!resp.ok) throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let accumulated = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value, { stream: true }).split('\n')) {
      if (!line.startsWith('data: ')) continue
      try {
        const parsed = JSON.parse(line.slice(6))
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          accumulated += parsed.delta.text
          try { onChunk(accumulated) } catch (_) {}
        }
      } catch (_) {}
    }
  }
  return accumulated
}

// ── Browser-direct Gemini helpers ─────────────────────────────────────────────

async function _geminiCall(system, userMsg, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${state.geminiKey}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(`Gemini API ${resp.status}: ${body?.error?.message || resp.statusText}`)
  }
  const data = await resp.json()
  return (data.candidates || [])
    .flatMap(c => c.content?.parts || [])
    .map(p => p.text || '')
    .join('')
}

async function _geminiStream(system, userMsg, maxTokens, onChunk) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${state.geminiKey}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  })
  if (!resp.ok) throw new Error(`Gemini API ${resp.status}: ${await resp.text()}`)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let accumulated = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value, { stream: true }).split('\n')) {
      if (!line.startsWith('data: ')) continue
      try {
        const parsed = JSON.parse(line.slice(6))
        const chunk = (parsed.candidates || [])
          .flatMap(c => c.content?.parts || [])
          .map(p => p.text || '').join('')
        if (chunk) { accumulated += chunk; try { onChunk(accumulated) } catch (_) {} }
      } catch (_) {}
    }
  }
  return accumulated
}

async function _geminiVision(system, textPrompt, images, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${state.geminiKey}`
  const parts = [
    ...images.map(img => ({ inlineData: { mimeType: img.mediaType, data: img.base64 } })),
    { text: textPrompt },
  ]
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  })
  if (!resp.ok) throw new Error(`Gemini API ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  return (data.candidates || [])
    .flatMap(c => c.content?.parts || [])
    .map(p => p.text || '')
    .join('')
}

// ── Browser-direct OpenAI helpers ─────────────────────────────────────────────

async function _openaiCall(system, userMsg, maxTokens) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
    }),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(`OpenAI API ${resp.status}: ${body?.error?.message || resp.statusText}`)
  }
  const data = await resp.json()
  return data.choices[0].message.content || ''
}

async function _openaiStream(system, userMsg, maxTokens, onChunk) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
    }),
  })
  if (!resp.ok) throw new Error(`OpenAI API ${resp.status}: ${await resp.text()}`)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let accumulated = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value, { stream: true }).split('\n')) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
      try {
        const parsed = JSON.parse(line.slice(6))
        const chunk = parsed.choices?.[0]?.delta?.content || ''
        if (chunk) { accumulated += chunk; try { onChunk(accumulated) } catch (_) {} }
      } catch (_) {}
    }
  }
  return accumulated
}

async function _openaiVision(system, textPrompt, images, maxTokens) {
  const content = [
    ...images.map(img => ({ type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.base64}` } })),
    { type: 'text', text: textPrompt },
  ]
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content }],
    }),
  })
  if (!resp.ok) throw new Error(`OpenAI API ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  return data.choices[0].message.content || ''
}

// ── Vision call (provider-aware) ──────────────────────────────────────────────
/** images: Array<{ base64: string, mediaType: 'image/jpeg'|'image/png'|'image/webp'|'image/gif' }>
 *  tier defaults to 'fast' — OCR/extraction rarely needs deep reasoning.
 */
export async function claudeVisionBatch(system, textPrompt, images, maxTokens = 3000, tier = 'fast') {
  _requireKey()
  const p = state.provider
  if (p === 'gemini') {
    if (isTauri) return invoke('call_gemini_vision', { apiKey: state.geminiKey, system, textPrompt, images: images.map(i => ({ base64: i.base64, mediaType: i.mediaType })), maxTokens })
    return _geminiVision(system, textPrompt, images, maxTokens)
  }
  if (p === 'openai') {
    if (isTauri) return invoke('call_openai_vision', { apiKey: state.openaiKey, system, textPrompt, images: images.map(i => ({ base64: i.base64, mediaType: i.mediaType })), maxTokens })
    return _openaiVision(system, textPrompt, images, maxTokens)
  }
  // Claude
  if (isTauri) {
    return invoke('call_claude_vision', {
      apiKey: state.apiKey, model: _cmId(tier), system, textPrompt,
      images: images.map(img => ({ base64: img.base64, mediaType: img.mediaType })),
      maxTokens,
    })
  }
  const content = images.map(img => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
  }))
  content.push({ type: 'text', text: textPrompt })
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: _ANTHROPIC_HEADERS(),
    body: JSON.stringify({ model: _cm(tier), max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  })
  if (!resp.ok) throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  return data.content.filter(c => c.type === 'text').map(c => c.text).join('')
}

// ── Plain-text call (provider-aware) ─────────────────────────────────────────

export async function claude(system, userMsg, maxTokens = 1800, tier = 'smart') {
  _requireKey()
  const p = state.provider
  if (p === 'gemini') {
    return isTauri
      ? invoke('call_gemini', { apiKey: state.geminiKey, system, userMsg, maxTokens })
      : _geminiCall(system, userMsg, maxTokens)
  }
  if (p === 'openai') {
    return isTauri
      ? invoke('call_openai', { apiKey: state.openaiKey, system, userMsg, maxTokens })
      : _openaiCall(system, userMsg, maxTokens)
  }
  // Claude
  if (!isTauri) return _webCall(system, userMsg, maxTokens, null, tier)
  return await invoke('call_claude', { apiKey: state.apiKey, model: _cmId(tier), system, userMsg, maxTokens })
}

// ── JSON call (provider-aware) ────────────────────────────────────────────────
// Instructs the model via system prompt to return raw JSON, then strips any
// accidental markdown fences from the response.

const _JSON_SYSTEM_SUFFIX = '\n\nIMPORTANT: Respond with raw JSON only. Do NOT wrap in markdown code fences (no ```json). Output the JSON object/array directly.'

export async function claudeJSON(system, userMsg, maxTokens = 1800, _prefill = '{', tier = 'smart') {
  _requireKey()
  const p = state.provider
  const jsonSystem = system + _JSON_SYSTEM_SUFFIX
  if (p === 'gemini') {
    const raw = isTauri
      ? await invoke('call_gemini', { apiKey: state.geminiKey, system: jsonSystem, userMsg, maxTokens })
      : await _geminiCall(jsonSystem, userMsg, maxTokens)
    return _stripJsonFences(raw)
  }
  if (p === 'openai') {
    const raw = isTauri
      ? await invoke('call_openai', { apiKey: state.openaiKey, system: jsonSystem, userMsg, maxTokens })
      : await _openaiCall(jsonSystem, userMsg, maxTokens)
    return _stripJsonFences(raw)
  }
  // Claude — no prefill; use system prompt + fence stripper instead
  const raw = isTauri
    ? await invoke('call_claude', { apiKey: state.apiKey, model: _cmId(tier), system: jsonSystem, userMsg, maxTokens })
    : await _webCall(jsonSystem, userMsg, maxTokens, tier)
  return _stripJsonFences(raw)
}

// ── Quiz call — always fast (Haiku): structured JSON, no deep reasoning needed ─

export async function claudeQuiz(system, userMsg) {
  return claudeJSON(system, userMsg, 3000, '[', 'fast')
}

// ── Streaming call (provider-aware) ──────────────────────────────────────────
// `onChunk(accumulated)` is called with the full text so far on every token.

export function claudeStream(system, userMsg, maxTokens = 1800, onChunk, tier = 'smart') {
  _requireKey()
  const p = state.provider
  if (p === 'gemini') {
    if (isTauri) {
      return new Promise((resolve, reject) => {
        const channel = new Channel()
        let accumulated = ''
        channel.onmessage = (event) => {
          if (event.type === 'chunk') { accumulated += event.text; try { onChunk(accumulated) } catch (_) {} }
          else if (event.type === 'done') resolve(accumulated)
        }
        invoke('call_gemini_stream', { apiKey: state.geminiKey, system, userMsg, maxTokens, onEvent: channel }).catch(reject)
      })
    }
    return _geminiStream(system, userMsg, maxTokens, onChunk)
  }
  if (p === 'openai') {
    if (isTauri) {
      return new Promise((resolve, reject) => {
        const channel = new Channel()
        let accumulated = ''
        channel.onmessage = (event) => {
          if (event.type === 'chunk') { accumulated += event.text; try { onChunk(accumulated) } catch (_) {} }
          else if (event.type === 'done') resolve(accumulated)
        }
        invoke('call_openai_stream', { apiKey: state.openaiKey, system, userMsg, maxTokens, onEvent: channel }).catch(reject)
      })
    }
    return _openaiStream(system, userMsg, maxTokens, onChunk)
  }
  // Claude
  if (!isTauri) return _webStream(system, userMsg, maxTokens, onChunk, tier)
  return new Promise((resolve, reject) => {
    const channel = new Channel()
    let accumulated = ''
    channel.onmessage = (event) => {
      if (event.type === 'chunk') { accumulated += event.text; try { onChunk(accumulated) } catch (_) {} }
      else if (event.type === 'done') resolve(accumulated)
    }
    invoke('call_claude_stream', { apiKey: state.apiKey, model: _cmId(tier), system, userMsg, maxTokens, onEvent: channel }).catch(reject)
  })
}
