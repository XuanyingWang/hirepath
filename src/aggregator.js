// ── KNOWLEDGE AGGREGATOR ───────────────────────────────────────────────────────
// Map-reduce pipeline:
//   Pass 1: batch extract text from images (5/batch, non-streaming)
//   Pass 2: synthesise into a final README (streaming, live preview)

import { state, save } from './state.js'
import { t } from './i18n.js'
import { esc } from './util.js'
import { isTauri } from './platform.js'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { claudeVisionBatch, claudeStream } from './api.js'
import { exportAggregatorPdf } from './export.js'

const BATCH_SIZE = 5

// ── Module-level ephemeral state ──────────────────────────────────────────────
let _agg = { status: 'idle', files: [], log: [], result: '', title: '' }
let _cancelled = false

// ── Public entry point ────────────────────────────────────────────────────────

export function renderAggregator() {
  // Restore persisted result across navigations
  const saved = state.S.aggregator
  if (_agg.status === 'idle' && saved?.result) {
    _agg.result = saved.result
    _agg.title  = saved.title || ''
    _agg.status = 'done'
  }
  _renderView()
}

// ── Orchestration ─────────────────────────────────────────────────────────────

async function _runAggregation(files) {
  _cancelled = false
  _agg.files  = files
  _agg.log    = []
  _agg.result = ''
  _agg.status = 'extracting'
  _renderView()

  // --- Pass 1: extraction ---
  const batches = []
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push(files.slice(i, i + BATCH_SIZE))
  }

  const extractedTexts = []
  for (let bi = 0; bi < batches.length; bi++) {
    if (_cancelled) { _agg.status = 'idle'; _renderView(); return }
    _log(t(`⟳ 正在提取批次 ${bi + 1} / ${batches.length}…`, `⟳ Extracting batch ${bi + 1} / ${batches.length}…`))
    _renderView()
    try {
      const imgs = await _loadImages(batches[bi])
      if (_cancelled) { _agg.status = 'idle'; _renderView(); return }
      const text = await _extractBatch(imgs)
      extractedTexts.push(text)
      _log(t(`✓ 批次 ${bi + 1} — 提取 ${text.length} 字符`, `✓ Batch ${bi + 1} — ${text.length} chars extracted`))
    } catch (batchErr) {
      // Batch failed — fall back to processing each image individually so we
      // lose at most one image rather than the entire batch.
      if (batches[bi].length > 1) {
        _log(t(`⚠ 批次 ${bi + 1} 失败，逐张重试 (${batches[bi].length} 张)…`,
               `⚠ Batch ${bi + 1} failed, retrying each image individually (${batches[bi].length} imgs)…`))
        for (let fi = 0; fi < batches[bi].length; fi++) {
          if (_cancelled) { _agg.status = 'idle'; _renderView(); return }
          try {
            const imgs = await _loadImages([batches[bi][fi]])
            const text = await _extractBatch(imgs)
            extractedTexts.push(text)
            _log(t(`  ✓ 图片 ${fi + 1}/${batches[bi].length} — 提取 ${text.length} 字符`,
                   `  ✓ Image ${fi + 1}/${batches[bi].length} — ${text.length} chars`))
          } catch (imgErr) {
            const name = batches[bi][fi]?.name || `#${fi + 1}`
            _log(t(`  ✕ 图片 ${fi + 1}/${batches[bi].length} 跳过 (${name})：${imgErr?.message || imgErr}`,
                   `  ✕ Image ${fi + 1}/${batches[bi].length} skipped (${name}): ${imgErr?.message || imgErr}`))
          }
          _renderView()
        }
      } else {
        const name = batches[bi][0]?.name || `batch ${bi + 1}`
        _log(t(`✕ 批次 ${bi + 1} 跳过 (${name})：${batchErr?.message || batchErr}`,
               `✕ Batch ${bi + 1} skipped (${name}): ${batchErr?.message || batchErr}`))
      }
    }
    _renderView()
  }

  if (_cancelled) { _agg.status = 'idle'; _renderView(); return }
  if (!extractedTexts.length) {
    _log(t('✕ 未能提取任何文本。', '✕ No text could be extracted.'))
    _agg.status = 'idle'
    _renderView()
    return
  }

  // --- Pass 2: synthesis ---
  _agg.status = 'synthesising'
  _log(t(`✓ 共提取 ${extractedTexts.length} 段（${extractedTexts.reduce((a, s) => a + s.length, 0)} 字符）`, `✓ ${extractedTexts.length} section(s) extracted (${extractedTexts.reduce((a, s) => a + s.length, 0)} chars total)`))
  _log(t('⟳ 正在合成 README…', '⟳ Synthesising README…'))
  _renderView()

  const synthSystem = `You are a senior technical writer reconstructing a complete technical document from OCR-extracted text sections. Rules:
1. COMPLETENESS: Include every piece of information — no omissions, no summarising, no paraphrasing. If it was in the source, it must be in the output.
2. ACCURACY: Preserve all commands, flags, code snippets, config values, URLs, version numbers, and technical terms verbatim.
3. FORMATTING: Use clean Markdown — proper # heading hierarchy, triple-backtick code fences with language tags (e.g. \`\`\`bash, \`\`\`yaml), bullet/numbered lists, bold for emphasis. Fix OCR artefacts (garbled characters, broken words) using context.
4. STRUCTURE: Reorganise content into logical sections with clear headers. Merge duplicate/overlapping content from sequential screenshots.
5. OUTPUT: Return ONLY the Markdown document. No preamble, no "Here is the README", no commentary.`
  const n = extractedTexts.length
  const sectionsText = extractedTexts.join('\n\n---\n\n')
  const synthUser = `Reconstruct a complete, comprehensive technical document from these ${n} OCR-extracted section${n > 1 ? 's' : ''}. Include ALL content — commands, examples, explanations, and code:\n\n${sectionsText}`

  try {
    await claudeStream(synthSystem, synthUser, 16000, (accumulated) => {
      _agg.result = accumulated
      _renderResultOnly()
    })
    _agg.status = 'done'
    // Persist
    state.S.aggregator = { title: _agg.title, result: _agg.result, updatedAt: new Date().toISOString() }
    save()
    _log(t('✓ 合成完成', '✓ Synthesis complete'))
  } catch (e) {
    _log(t(`✕ 合成失败：${e?.message || e}`, `✕ Synthesis failed: ${e?.message || e}`))
    _agg.status = 'done'
  }
  _renderView()
}

// ── Image loading ─────────────────────────────────────────────────────────────

const _MAX_IMAGE_BYTES = 4.5 * 1024 * 1024  // 4.5 MB — Anthropic limit is 5 MB

/** Resize a base64 image via Canvas if it exceeds the API size limit.
 *  Returns { base64, mediaType } always as image/jpeg after resize. */
async function _resizeIfNeeded(base64, mediaType) {
  // base64 length * 3/4 ≈ raw byte size
  if (base64.length * 0.75 <= _MAX_IMAGE_BYTES) return { base64, mediaType }
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scaleFactor = Math.sqrt(_MAX_IMAGE_BYTES / (base64.length * 0.75)) * 0.9  // 10% safety margin
      const canvas = document.createElement('canvas')
      canvas.width  = Math.floor(img.naturalWidth  * scaleFactor)
      canvas.height = Math.floor(img.naturalHeight * scaleFactor)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
    }
    img.onerror = reject
    img.src = `data:${mediaType};base64,${base64}`
  })
}

async function _loadImages(files) {
  const MEDIA_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' }
  return Promise.all(files.map(async (f) => {
    let base64, mediaType
    if (isTauri) {
      // f = { name, path }
      base64 = await invoke('read_image_base64', { path: f.path })
      const ext = f.name.split('.').pop().toLowerCase()
      mediaType = MEDIA_TYPES[ext] || 'image/jpeg'
    } else {
      // f = File object (from <input>)
      const result = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result
          const [header, b64] = dataUrl.split(',')
          resolve({ base64: b64, mediaType: header.match(/data:([^;]+)/)?.[1] || 'image/jpeg' })
        }
        reader.onerror = reject
        reader.readAsDataURL(f)
      })
      base64 = result.base64
      mediaType = result.mediaType
    }
    return _resizeIfNeeded(base64, mediaType)
  }))
}

// ── Claude calls ──────────────────────────────────────────────────────────────

async function _extractBatch(imgs) {
  const system = `You are a precise OCR assistant. Your job is to extract ALL visible text from the provided images with 100% completeness — do not skip, truncate, or summarise ANY content. Preserve Markdown formatting exactly as shown: # headers, \`\`\` code blocks with language tags, - bullet lists, numbered lists, **bold**, \`inline code\`, tables, etc. Include every command, flag, URL, config value, and code snippet verbatim. Return ONLY the raw extracted text, no commentary, no preamble.`
  const prompt = `Extract every line of text from these sequential documentation screenshots in order. Do not skip anything.`
  return claudeVisionBatch(system, prompt, imgs, 4096)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _log(msg) { _agg.log.push(msg) }

function _renderResultOnly() {
  const el = document.getElementById('aggr-result-body')
  if (el) el.innerHTML = _simpleMarkdown(_agg.result)
}

// ── Markdown renderer (lightweight) ──────────────────────────────────────────

function _simpleMarkdown(md) {
  if (!md) return ''
  let html = esc(md)  // escape first to prevent XSS

  // Code blocks (fenced) — must come before inline code
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="lang-${esc(lang)}">${code}</code></pre>`)

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')

  // Headers
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^##### (.+)$/gm,  '<h5>$1</h5>')
  html = html.replace(/^#### (.+)$/gm,   '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm,    '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm,     '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm,      '<h1>$1</h1>')

  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr>')

  // Unordered list items
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]*?<\/li>)\n(?=<li>)/g, '$1')
  html = html.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')

  // Ordered list items
  html = html.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>')
  html = html.replace(/<oli>([\s\S]*?)<\/oli>/g, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]*?<\/li>)\n(?=<li>)/g, '$1')

  // Paragraphs (double newlines)
  html = html
    .split(/\n{2,}/)
    .map(block => {
      const trimmed = block.trim()
      if (!trimmed) return ''
      if (/^<(h[1-6]|ul|ol|li|pre|hr|blockquote)/.test(trimmed)) return trimmed
      return '<p>' + trimmed.replace(/\n/g, '<br>') + '</p>'
    })
    .join('\n')

  return html
}

// ── DOM event handlers (called from inline onclick) ──────────────────────────

export async function aggrPickFolder() {
  try {
    const path = await openDialog({ directory: true, multiple: false, title: t('选择图片文件夹', 'Select image folder') })
    if (!path) return  // user cancelled
    const files = await invoke('list_image_files', { path })
    if (!files.length) { alert(t('该文件夹中未找到图片文件', 'No image files found in that folder')); return }
    _agg.title = path.split(/[\\/]/).pop() || path
    _runAggregation(files)
  } catch (e) {
    alert(t('读取目录失败：', 'Failed to read folder: ') + (e?.message || e))
  }
}

export function aggrPickFiles(input) {
  const files = Array.from(input.files || [])
  if (!files.length) return
  files.sort((a, b) => a.name.localeCompare(b.name))
  _agg.title = t('所选图片', 'Selected images')
  _runAggregation(files)
}

export function aggrCancel() {
  _cancelled = true
}

export function aggrClear() {
  _agg = { status: 'idle', files: [], log: [], result: '', title: '' }
  state.S.aggregator = { title: '', result: '', updatedAt: null }
  save()
  _renderView()
}

export function aggrExportPdf() {
  if (!_agg.result) return
  exportAggregatorPdf(_agg.title, _simpleMarkdown(_agg.result))
}

// ── View rendering ────────────────────────────────────────────────────────────

function _renderView() {
  const mc = document.getElementById('mainContent')
  if (!mc) return
  mc.innerHTML = _buildHtml()
}

function _buildHtml() {
  const isProcessing = _agg.status === 'extracting' || _agg.status === 'synthesising'

  const logHtml = _agg.log.length
    ? `<div class="aggr-log">${_agg.log.map(l => `<div class="aggr-log-line">${esc(l)}</div>`).join('')}</div>`
    : ''

  const resultHtml = _agg.result
    ? `<div class="aggr-result">
        <div class="aggr-toolbar">
          <button class="btn-primary btn-sm" onclick="aggrExportPdf()">${t('导出 PDF', 'Export PDF')}</button>
          <button class="btn-sec btn-sm" onclick="aggrClear()">${t('清除 / 重新开始', 'Clear / New')}</button>
        </div>
        <div class="aggr-result-body" id="aggr-result-body">${_simpleMarkdown(_agg.result)}</div>
      </div>`
    : ''

  if (_agg.status === 'idle') {
    return `
      <div class="aggr-wrap">
        <div class="aggr-header">
          <h2>${t('🖼️ 知识聚合器', '🖼️ Knowledge Aggregator')}</h2>
          <p class="aggr-desc">${t('从截图中重建 README，支持批量图片。', 'Rebuild a README from documentation screenshots. Supports batches of images.')}</p>
        </div>
        ${_inputSection()}
      </div>`
  }

  if (isProcessing) {
    return `
      <div class="aggr-wrap">
        <div class="aggr-header">
          <h2>${t('🖼️ 知识聚合器', '🖼️ Knowledge Aggregator')}</h2>
        </div>
        <div class="aggr-progress">
          <div class="aggr-spinner">⟳</div>
          <span>${_agg.status === 'synthesising' ? t('正在合成 README…', 'Synthesising README…') : t('正在提取文字…', 'Extracting text…')}</span>
          <button class="btn-sec btn-sm" onclick="aggrCancel()">${t('取消', 'Cancel')}</button>
        </div>
        ${logHtml}
        ${resultHtml}
      </div>`
  }

  // done
  return `
    <div class="aggr-wrap">
      <div class="aggr-header">
        <h2>${t('🖼️ 知识聚合器', '🖼️ Knowledge Aggregator')}</h2>
      </div>
      ${logHtml}
      ${resultHtml || _inputSection()}
    </div>`
}

function _inputSection() {
  if (isTauri) {
    return `
      <div class="aggr-pick-row">
        <button class="btn-primary aggr-pick-btn" onclick="aggrPickFolder()">
          📁 ${t('选择文件夹', 'Select folder')}
        </button>
        <span class="aggr-hint">${t('选择包含截图的文件夹，按文件名排序处理', 'Select a folder of screenshots — sorted by filename')}</span>
      </div>
      <div class="aggr-or">${t('或', 'or')}</div>
      <div class="aggr-pick-row">
        <label class="btn-sec aggr-pick-btn">
          🖼️ ${t('选择单张图片', 'Pick individual images')}
          <input type="file" accept="image/*" multiple style="display:none"
            onchange="aggrPickFiles(this)">
        </label>
      </div>`
  }
  return `
    <div class="aggr-pick-row">
      <label class="btn-primary aggr-pick-btn">
        📁 ${t('选择图片文件', 'Pick image files')}
        <input type="file" accept="image/*" multiple style="display:none"
          onchange="aggrPickFiles(this)">
      </label>
      <span class="aggr-hint">${t('支持 PNG / JPG / WebP，按文件名排序处理', 'PNG / JPG / WebP — sorted by filename')}</span>
    </div>`
}
