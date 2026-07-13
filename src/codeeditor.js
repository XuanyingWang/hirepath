// ── MONACO EDITOR WRAPPER ─────────────────────────────────────────────────────
import * as monaco from 'monaco-editor'

const LANG = { python: 'python', java: 'java' }

// Custom themes with explicit suggest-widget colours so text is always visible
monaco.editor.defineTheme('hp-light', {
  base: 'vs', inherit: true, rules: [],
  colors: {
    'editorSuggestWidget.background':         '#ffffff',
    'editorSuggestWidget.foreground':         '#1e1e1e',
    'editorSuggestWidget.selectedBackground': '#0060c0',
    'editorSuggestWidget.selectedForeground': '#ffffff',
    'editorSuggestWidget.highlightForeground':'#0060c0',
    'editorSuggestWidget.focusHighlightForeground': '#0060c0',
    'editorSuggestWidget.border':             '#c8c8c8',
  },
})

monaco.editor.defineTheme('hp-dark', {
  base: 'vs-dark', inherit: true, rules: [],
  colors: {
    'editorSuggestWidget.background':         '#252526',
    'editorSuggestWidget.foreground':         '#d4d4d4',
    'editorSuggestWidget.selectedBackground': '#0060c0',
    'editorSuggestWidget.selectedForeground': '#ffffff',
    'editorSuggestWidget.highlightForeground':'#18a3ff',
    'editorSuggestWidget.focusHighlightForeground': '#18a3ff',
    'editorSuggestWidget.border':             '#454545',
  },
})

// Map of containerId → editor instance
const _editors = new Map()

export function createEditor(containerId, code, lang) {
  disposeEditor(containerId)

  const container = document.getElementById(containerId)
  if (!container) return null

  const isDark = document.documentElement.dataset.theme?.startsWith('dark')

  const editor = monaco.editor.create(container, {
    value: code,
    language: LANG[lang] || 'plaintext',
    theme: isDark ? 'hp-dark' : 'hp-light',
    fontSize: 13,
    fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
    fontLigatures: true,
    tabSize: 4,
    insertSpaces: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: 'on',
    renderLineHighlight: 'line',
    automaticLayout: true,
    padding: { top: 12, bottom: 12 },
    scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    // Word-based completions from current file
    wordBasedSuggestions: 'currentDocument',
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    snippetSuggestions: 'top',
    suggest: {
      showWords: true,
      showKeywords: true,
      showSnippets: true,
      showMethods: true,
      showFunctions: true,
      showVariables: true,
      showClasses: true,
      filterGraceful: true,
      // Don't show the generic 'abc' label — only show real words
      showIcons: true,
    },
  })

  _editors.set(containerId, editor)
  return editor
}

export function getEditorValue(containerId) {
  return _editors.get(containerId)?.getValue() ?? ''
}

export function setEditorValue(containerId, code) {
  const ed = _editors.get(containerId)
  if (!ed) return
  ed.setValue(code)
}

export function setEditorLanguage(containerId, lang) {
  const ed = _editors.get(containerId)
  if (!ed) return
  monaco.editor.setModelLanguage(ed.getModel(), LANG[lang] || 'plaintext')
}

export function setEditorTheme(isDark) {
  monaco.editor.setTheme(isDark ? 'hp-dark' : 'hp-light')
}

export function disposeEditor(containerId) {
  const ed = _editors.get(containerId)
  if (ed) { ed.dispose(); _editors.delete(containerId) }
}

export function addEditorAction(containerId, id, label, keybinding, handler) {
  const ed = _editors.get(containerId)
  if (!ed) return
  ed.addAction({
    id,
    label,
    keybindings: keybinding ? [keybinding] : [],
    run: handler,
  })
}

export { monaco }
