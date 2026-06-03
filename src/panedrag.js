// ── RESIZABLE PANE DRAG ───────────────────────────────────────────────────────
// Shared by OOD, Production Code, and System Design modules.
// Call initPaneDrag() after each question render to wire up the divider.

let _dragging = false
let _sideWidth = null   // persists across question navigations

export function initPaneDrag() {
  const divider = document.getElementById('oodDivider')
  const right   = document.getElementById('oodPaneSide')
  if (!divider || !right) return

  // Restore last dragged width
  if (_sideWidth !== null) {
    right.style.flex = `0 0 ${_sideWidth}px`
  }

  divider.addEventListener('mousedown', e => {
    _dragging = true
    divider.classList.add('dragging')
    document.body.style.cursor    = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  })
}

document.addEventListener('mousemove', e => {
  if (!_dragging) return
  const layout  = document.querySelector('.ood-editor-layout')
  const left    = document.getElementById('oodPaneCode')
  const right   = document.getElementById('oodPaneSide')
  if (!layout || !left || !right) return

  const rect = layout.getBoundingClientRect()
  const divW = 10
  const available = rect.width - divW
  const leftPx  = Math.max(260, Math.min(e.clientX - rect.left, available - 180))
  const rightPx = available - leftPx

  left.style.flex  = `0 0 ${leftPx}px`
  right.style.flex = `0 0 ${rightPx}px`
  _sideWidth = rightPx
})

document.addEventListener('mouseup', () => {
  if (!_dragging) return
  _dragging = false
  document.getElementById('oodDivider')?.classList.remove('dragging')
  document.body.style.cursor     = ''
  document.body.style.userSelect = ''
})
