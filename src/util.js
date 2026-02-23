// ── UTILITIES ─────────────────────────────────────────────────────────────────
import { t } from './i18n.js'

export function esc(s) {
  if (!s) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function md2h(md) {
  if (!md) return ''
  const codeBlocks = []
  let s = md.replace(/```([\w]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length
    const safe = code.trimEnd()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const label = lang ? lang.toUpperCase() : 'CODE'
    codeBlocks.push(`<pre class="code-block"><div class="code-label">${label}</div><code>${safe}</code></pre>`)
    return `\x00CODE${idx}\x00`
  })
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  s = s.replace(/^# (.+)$/gm, '<h2>$1</h2>')
  s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
  s = s.replace(/^---+$/gm, '<hr>')
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>')
  s = s.replace(/((\|[^\n]+\|\n)+)/g, m => {
    const rows = m.trim().split('\n'); if (rows.length < 2) return m
    const th = rows[0].split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('')
    let tb = ''
    for (let i = 2; i < rows.length; i++) {
      if (!rows[i].trim()) continue
      const cells = rows[i].split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('')
      tb += `<tr>${cells}</tr>`
    }
    return `<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`
  })
  s = s.replace(/((?:^\d+\. .+\n?)+)/gm, m => {
    const items = m.trim().split('\n').filter(Boolean).map(l => `<li>${l.replace(/^\d+\.\s*/, '')}</li>`).join('')
    return `<ol>${items}</ol>`
  })
  s = s.replace(/((?:^[ \t]*[-*•] .+\n?)+)/gm, m => {
    const items = m.trim().split('\n').filter(Boolean).map(l => `<li>${l.replace(/^[ \t]*[-*•]\s*/, '')}</li>`).join('')
    return `<ul>${items}</ul>`
  })
  const blocks = s.split(/\n{2,}/)
  const out = blocks.map(blk => {
    blk = blk.trim(); if (!blk) return ''
    if (/^\x00CODE\d+\x00$/.test(blk)) return blk
    if (/^<(h[1-6]|ul|ol|pre|table|blockquote|hr|div)/.test(blk)) return blk
    return `<p>${blk.replace(/\n/g, ' ')}</p>`
  })
  s = out.join('\n')
  s = s.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[+i])
  return s
}

export function showLoading(lbl, sub) {
  document.getElementById('mainContent').innerHTML = `
    <div class="loading-box">
      <div class="spinner"></div>
      <div class="load-label">${esc(lbl)}</div>
      <div class="load-sub">${esc(sub)}</div>
    </div>`
}

export function updateLoading(lbl, sub) {
  const lblEl = document.querySelector('.load-label')
  const subEl = document.querySelector('.load-sub')
  if (lblEl) lblEl.textContent = lbl
  if (subEl) subEl.textContent = sub
}

export function showErr(msg) {
  document.getElementById('mainContent').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <div class="empty-text" style="max-width:500px">
        <strong style="color:var(--red)">${t('发生错误', 'Error')}</strong><br><br>
        <span style="font-size:12px;word-break:break-all;opacity:.8">${esc(msg)}</span><br><br>
        <button class="btn-primary" onclick="renderWelcome()">${t('返回重试', 'Back')}</button>
      </div>
    </div>`
}

export function modal(title, fields, onOk, customHtml) {
  const bd = document.createElement('div'); bd.className = 'modal-bd'; bd.id = 'mbk'
  if (customHtml) {
    bd.innerHTML = `<div class="modal-box">${customHtml}</div>`
  } else {
    const inp = fields.map(f =>
      `<input class="modal-input" id="mf_${f.id}" placeholder="${esc(f.ph)}" value="${esc(f.val || '')}">`
    ).join('')
    bd.innerHTML = `<div class="modal-box">
      <div class="modal-title">${esc(title)}</div>${inp}
      <div class="modal-actions">
        <button class="btn-sec" onclick="closeModal()">${t('取消', 'Cancel')}</button>
        <button class="btn-primary" onclick="confirmModal()">${t('确定', 'OK')}</button>
      </div>
    </div>`
    bd._ok = () => {
      const v = {}; fields.forEach(f => { v[f.id] = document.getElementById('mf_' + f.id)?.value || '' })
      onOk(v)
    }
  }
  bd.addEventListener('click', e => { if (e.target === bd) closeModal() })
  document.body.appendChild(bd)
}

export function confirmModal() { const b = document.getElementById('mbk'); if (b?._ok) b._ok(); closeModal() }
export function closeModal() { document.getElementById('mbk')?.remove() }
