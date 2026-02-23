// ── SPEECH RECOGNITION ────────────────────────────────────────────────────────
// Uses the Web Speech API (webkitSpeechRecognition / SpeechRecognition).
// Available in WebView2 (Chromium) on Windows — no Tauri command needed.
import { state } from './state.js'

const SR = window.SpeechRecognition || window.webkitSpeechRecognition

// True if the browser supports speech input
export const speechSupported = !!SR

// ── Module state ──────────────────────────────────────────────────────────────
let _recognition = null
let _activeId = null      // textarea id currently recording
let _baseValue = ''       // textarea value at recording start
let _finalText = ''       // accumulated final transcript chunks

// ── Public API ────────────────────────────────────────────────────────────────

export function isSpeaking(textareaId) {
  return _activeId === textareaId
}

export function toggleSpeech(textareaId) {
  if (_activeId === textareaId) {
    stopSpeech()
  } else {
    _startSpeech(textareaId)
  }
}

export function stopSpeech() {
  const prevId = _activeId
  _activeId = null
  _finalText = ''
  _baseValue = ''
  if (_recognition) {
    _recognition.onresult = null
    _recognition.onerror = null
    _recognition.onend = null
    try { _recognition.stop() } catch (_) {}
    _recognition = null
  }
  if (prevId) _syncBtn(prevId, false)
}

// ── Returns the mic-button HTML for a given textarea id.
// Returns '' when speech is unsupported (buttons simply don't appear).
export function micBtn(textareaId) {
  if (!SR) return ''
  return '<button class="mic-btn" id="mic-btn-' + textareaId
    + '" title="Voice input" onclick="toggleSpeech(\'' + textareaId + '\')">🎤</button>'
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _startSpeech(textareaId) {
  stopSpeech()   // end any active session first

  const ta = document.getElementById(textareaId)
  if (!ta) return

  _activeId = textareaId
  _baseValue = ta.value
  _finalText = ''

  _recognition = new SR()
  _recognition.continuous = true
  _recognition.interimResults = true
  _recognition.lang = state.lang === 'zh' ? 'zh-CN' : 'en-US'

  _recognition.onresult = (event) => {
    const ta = document.getElementById(textareaId)
    if (!ta) { stopSpeech(); return }   // navigated away

    let newFinal = ''
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript
      if (event.results[i].isFinal) newFinal += chunk
      else interim += chunk
    }
    if (newFinal) _finalText += newFinal

    // Append to whatever was in the textarea when recording began
    const sep = _baseValue.length > 0 && !/\s$/.test(_baseValue) ? ' ' : ''
    ta.value = _baseValue + sep + _finalText + interim
    _syncBtn(textareaId, true)
  }

  _recognition.onerror = (e) => {
    // 'no-speech' is benign (silence timeout) — just stop cleanly
    if (e.error !== 'no-speech') console.warn('[speech]', e.error)
    stopSpeech()
  }

  _recognition.onend = () => {
    // Trim trailing interim artifacts and commit
    const ta = document.getElementById(textareaId)
    if (ta && _finalText) {
      const sep = _baseValue.length > 0 && !/\s$/.test(_baseValue) ? ' ' : ''
      ta.value = _baseValue + sep + _finalText.trim()
    }
    stopSpeech()
  }

  try {
    _recognition.start()
    _syncBtn(textareaId, true)
  } catch (e) {
    console.warn('[speech] start failed:', e)
    stopSpeech()
  }
}

function _syncBtn(textareaId, active) {
  const btn = document.getElementById('mic-btn-' + textareaId)
  if (!btn) return
  btn.textContent = active ? '⏹' : '🎤'
  btn.title = active ? 'Stop recording' : 'Voice input'
  btn.classList.toggle('mic-btn-active', active)
}
