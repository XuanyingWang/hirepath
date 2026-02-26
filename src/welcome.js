// ── WELCOME ───────────────────────────────────────────────────────────────────
import { state } from './state.js'
import { t } from './i18n.js'
import { esc } from './util.js'

const isTauri = '__TAURI_INTERNALS__' in window

// ── Module state (persisted across URL ↔ File tab switches) ──────────────────
let _chSource = 'url'     // 'url' | 'file'
let _chFileName = ''
let _chFileContent = ''
let _chSavedName = ''
let _chSavedFolder = ''

export function getChSource()      { return _chSource }
export function getChFileName()    { return _chFileName }
export function getChFileContent() { return _chFileContent }

/** Reset all state — call this when starting a brand-new chapter. */
export function resetWelcomeState() {
  _chSource = 'url'; _chFileName = ''; _chFileContent = ''
  _chSavedName = ''; _chSavedFolder = ''
}

// ── Source tab switch ─────────────────────────────────────────────────────────
export function chSwitchSource(mode) {
  // Preserve form values across re-render
  _chSavedName   = document.getElementById('chName')?.value   || _chSavedName
  _chSavedFolder = document.getElementById('chFolder')?.value || _chSavedFolder
  _chSource = mode
  renderWelcome()
}

// ── File picking ──────────────────────────────────────────────────────────────

/** Tauri: open native file dialog. Browser: trigger hidden file input. */
export async function chPickFile() {
  if (isTauri) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { invoke } = await import('@tauri-apps/api/core')
      const filePath = await open({
        multiple: false,
        filters: [{ name: 'Documents', extensions: ['pdf', 'md', 'txt', 'rst'] }],
      })
      if (!filePath) return
      _chFileName = filePath.split(/[\\/]/).pop()
      const content = _chFileName.toLowerCase().endsWith('.pdf')
        ? await invoke('read_pdf_file', { path: filePath })
        : await invoke('read_text_file', { path: filePath })
      _applyFileContent(content)
    } catch (e) {
      alert(`Failed to read file: ${e?.message || String(e)}`)
    }
  } else {
    document.getElementById('chFileInput')?.click()
  }
}

/** Called by the hidden <input type="file"> in browser mode. */
export async function chHandleFile(input) {
  const file = input.files?.[0]
  if (!file) return
  _chFileName = file.name
  try {
    let content
    if (file.name.toLowerCase().endsWith('.pdf')) {
      if (!isTauri) {
        alert(t(
          'PDF 提取需要桌面应用，请改用 .md 或 .txt 格式',
          'PDF extraction requires the desktop app. Please use .md or .txt instead.',
        ))
        return
      }
      const { invoke } = await import('@tauri-apps/api/core')
      const buf = await file.arrayBuffer()
      const bytes = Array.from(new Uint8Array(buf))
      content = await invoke('extract_pdf_bytes', { bytes })
    } else {
      content = await file.text()
    }
    _applyFileContent(content)
  } catch (e) {
    alert(`Failed to read file: ${e?.message || String(e)}`)
  }
}

/** Drag-and-drop handler for the file drop zone. */
export async function chHandleDrop(e) {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  await chHandleFile({ files: [file] })
}

function _applyFileContent(content) {
  _chFileContent = content
  // Auto-fill chapter name from filename if the field is still empty
  const nameEl = document.getElementById('chName')
  if (nameEl && !nameEl.value.trim()) {
    const auto = _chFileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
    nameEl.value = auto
    _chSavedName = auto
  }
  // Update status label in-place (no full re-render needed)
  const status = document.getElementById('chFileStatus')
  if (status) {
    status.className = 'ch-file-status loaded'
    status.textContent = `✓ ${_chFileName} (${(_chFileContent.length / 1024).toFixed(1)} KB)`
  }
  const btn = document.getElementById('chAnalyzeBtn')
  if (btn) btn.removeAttribute('disabled')
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderWelcome() {
  const savedFolder = _chSavedFolder
  const fopts = state.S.folders.map(f =>
    `<option value="${f.id}"${f.id === savedFolder ? ' selected' : ''}>${esc(f.name)}</option>`
  ).join('')

  // ── URL source section ────────────────────────────────────────────────────
  const urlSection = `
    <div class="form-group">
      <label class="form-label">${t('文档 URL', 'Doc URL')}</label>
      <div class="form-row">
        <input type="url" class="form-input" id="chUrl" placeholder="https://kubernetes.io/docs/concepts/...">
        <button class="btn-primary" onclick="doAnalyze()">${t('分析 →', 'Analyze →')}</button>
      </div>
    </div>
    <div class="form-group form-group-optional">
      <label class="form-label">
        ${t('粘贴内容', 'Paste Content')}
        <span class="form-label-opt">${t('可选 · URL 需要登录或无法访问时使用', 'Optional · use when the URL requires login or is inaccessible')}</span>
      </label>
      <textarea class="form-input form-textarea" id="chContent"
        placeholder="${t('直接将文档文字粘贴于此（留空则自动抓取 URL 内容）', 'Paste document text here (leave empty to auto-fetch the URL)')}" rows="3"></textarea>
    </div>`

  // ── Local file source section ─────────────────────────────────────────────
  const fileLoaded = !!_chFileContent
  const fileSection = `
    <div class="form-group">
      <label class="form-label">${t('文档文件', 'Document File')}</label>
      <div class="ch-file-area" ondragover="event.preventDefault()" ondrop="chHandleDrop(event)">
        <button class="ch-file-pick-btn" onclick="chPickFile()">
          📁 ${t('选择文件', 'Pick File')} (.pdf / .md / .txt)
        </button>
        <div id="chFileStatus" class="ch-file-status${fileLoaded ? ' loaded' : ''}">
          ${fileLoaded
            ? `✓ ${esc(_chFileName)} (${(_chFileContent.length / 1024).toFixed(1)} KB)`
            : t('未选择文件 · 或将文件拖放到此处', 'No file selected · or drag & drop here')}
        </div>
        ${!isTauri ? `<input type="file" id="chFileInput" accept=".pdf,.md,.txt,.rst" style="display:none" onchange="chHandleFile(this)">` : ''}
      </div>
      <p class="ch-file-hint">${t('支持 PDF、Markdown (.md)、纯文本 (.txt)', 'Supports PDF, Markdown (.md), plain text (.txt)')}</p>
    </div>
    <div class="form-group" style="display:flex;justify-content:flex-end">
      <button id="chAnalyzeBtn" class="btn-primary" onclick="doAnalyze()"${fileLoaded ? '' : ' disabled'}>
        ${t('分析 →', 'Analyze →')}
      </button>
    </div>`

  document.getElementById('mainContent').innerHTML = `
    <div class="welcome">
      <div class="welcome-hero">
        <h1>Google <em>L5 SDE</em><br>${t('面试备考助手', 'Interview Prep')}</h1>
        <p>${t('输入技术文档 URL，AI 自动抓取内容并深度解析知识要点，<br>生成结构化学习框架，并出针对 L5 水平的定制面试题。',
          'Enter a technical doc URL — AI fetches and deep-analyzes the content,<br>generating a structured knowledge framework and L5-calibrated quiz questions.')}</p>
      </div>
      <div class="form-card">
        <div class="form-group">
          <label class="form-label">${t('章节名称', 'Chapter Name')}</label>
          <input type="text" class="form-input" id="chName" value="${esc(_chSavedName)}"
            placeholder="${t('例：Kubernetes · Pods 生命周期', 'e.g. Kubernetes · Pod Lifecycle')}">
        </div>
        <div class="form-group">
          <label class="form-label">${t('所属目录', 'Folder')}</label>
          <select class="form-select" id="chFolder">
            <option value=""${savedFolder === '' ? ' selected' : ''}>${t('未分类', 'Uncategorized')}</option>${fopts}
          </select>
        </div>
        <div class="ch-source-tabs">
          <button class="ch-src-tab${_chSource === 'url' ? ' active' : ''}" onclick="chSwitchSource('url')">
            🔗 ${t('网页 URL', 'From URL')}
          </button>
          <button class="ch-src-tab${_chSource === 'file' ? ' active' : ''}" onclick="chSwitchSource('file')">
            📄 ${t('本地文件', 'Local File')}
          </button>
        </div>
        ${_chSource === 'url' ? urlSection : fileSection}
      </div>
    </div>
  `

  if (_chSource === 'url') {
    document.getElementById('chUrl')?.addEventListener('keydown', e => { if (e.key === 'Enter') window.doAnalyze() })
  }
}
