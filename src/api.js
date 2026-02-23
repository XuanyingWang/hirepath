// ── API KEY + CLAUDE ──────────────────────────────────────────────────────────
import { invoke, Channel } from '@tauri-apps/api/core'
import { state } from './state.js'
import { t } from './i18n.js'
import { modal, closeModal, esc } from './util.js'

export async function initApiKey() {
  try {
    state.apiKey = await invoke('load_api_key')
  } catch (e) {
    state.apiKey = ''
  }
  updateKeyStatusBadge()
  if (!state.apiKey) showSettings(true)
}

export function updateKeyStatusBadge() {
  const btn = document.getElementById('settingsBtn')
  if (!btn) return
  btn.title = state.apiKey
    ? t('API Key 已设置 · 点击修改', 'API Key set · click to change')
    : t('API Key 未设置 · 点击配置', 'API Key not set · click to configure')
  btn.style.opacity = state.apiKey ? '0.55' : '1'
}

export function showSettings(required = false) {
  modal('', [], () => {}, `
    <div class="modal-title">⚙️ Anthropic API Key</div>
    ${required ? `<p class="modal-note" style="color:var(--red);font-weight:500;margin-bottom:10px">${t('首次使用，请先配置 API Key', 'First use — please configure your API Key')}</p>` : ''}
    <input class="modal-input" id="sk_input" type="password"
      placeholder="sk-ant-api03-..."
      value="${esc(state.apiKey)}">
    <p class="modal-note">
      ${t('Key 仅保存在本地，不会上传。', 'Your key is stored locally and never uploaded.')}
      <a href="https://console.anthropic.com/settings/keys" target="_blank">${t('获取 API Key →', 'Get API Key →')}</a>
    </p>
    <div class="modal-actions">
      ${!required ? `<button class="btn-sec" onclick="closeModal()">${t('取消', 'Cancel')}</button>` : ''}
      <button class="btn-primary" onclick="saveApiKey()">${t('保存', 'Save')}</button>
    </div>
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
      <div class="modal-note" style="margin-bottom:8px">Language / 语言</div>
      <div class="lang-toggle">
        <button class="lang-btn${state.lang === 'zh' ? ' active' : ''}" onclick="setLang('zh')">中文</button>
        <button class="lang-btn${state.lang === 'en' ? ' active' : ''}" onclick="setLang('en')">English</button>
      </div>
    </div>
  `)
  setTimeout(() => document.getElementById('sk_input')?.focus(), 50)
}

export async function saveApiKey() {
  const key = document.getElementById('sk_input')?.value?.trim() || ''
  if (!key || !key.startsWith('sk-')) {
    alert(t('请输入有效的 Anthropic API Key（以 sk- 开头）', 'Please enter a valid Anthropic API Key (starts with sk-)'))
    return
  }
  try {
    await invoke('save_api_key', { key })
    state.apiKey = key
    updateKeyStatusBadge()
    closeModal()
  } catch (e) {
    alert(t('保存失败：', 'Save failed: ') + e)
  }
}

function _requireKey() {
  if (!state.apiKey) throw new Error(t('请先配置 Anthropic API Key（点击右上角 ⚙️）', 'Please configure your Anthropic API Key first (click ⚙️)'))
}

// ── Plain-text call ───────────────────────────────────────────────────────────

export async function claude(system, userMsg, maxTokens = 1800) {
  _requireKey()
  return await invoke('call_claude', { apiKey: state.apiKey, system, userMsg, maxTokens })
}

// ── JSON call (assistant prefill forces clean JSON, no markdown fences) ───────
// Pass prefill='{' for objects or prefill='[' for arrays.

export async function claudeJSON(system, userMsg, maxTokens = 1800, prefill = '{') {
  _requireKey()
  return await invoke('call_claude', { apiKey: state.apiKey, system, userMsg, maxTokens, prefill })
}

// ── Quiz call (JSON array, slightly higher token budget) ─────────────────────

export async function claudeQuiz(system, userMsg) {
  return claudeJSON(system, userMsg, 3000, '[')
}

// ── Streaming call ────────────────────────────────────────────────────────────
// `onChunk(accumulated)` is called with the full text so far on every token.
// Returns a Promise that resolves to the final accumulated string.

export function claudeStream(system, userMsg, maxTokens = 1800, onChunk) {
  _requireKey()
  return new Promise((resolve, reject) => {
    const channel = new Channel()
    let accumulated = ''

    channel.onmessage = (event) => {
      if (event.type === 'chunk') {
        accumulated += event.text
        try { onChunk(accumulated) } catch (_) {}
      } else if (event.type === 'done') {
        resolve(accumulated)
      }
    }

    invoke('call_claude_stream', {
      apiKey: state.apiKey,
      system,
      userMsg,
      maxTokens,
      onEvent: channel,
    }).catch(reject)
  })
}
