// ── WELCOME ───────────────────────────────────────────────────────────────────
import { state } from './state.js'
import { t } from './i18n.js'
import { esc } from './util.js'

export function renderWelcome() {
  const fopts = state.S.folders.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('')
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
          <input type="text" class="form-input" id="chName" placeholder="${t('例：Kubernetes · Pods 生命周期', 'e.g. Kubernetes · Pod Lifecycle')}">
        </div>
        <div class="form-group">
          <label class="form-label">${t('所属目录', 'Folder')}</label>
          <select class="form-select" id="chFolder">
            <option value="">${t('未分类', 'Uncategorized')}</option>${fopts}
          </select>
        </div>
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
        </div>
      </div>
    </div>
  `
  document.getElementById('chUrl').addEventListener('keydown', e => { if (e.key === 'Enter') window.doAnalyze() })
}
