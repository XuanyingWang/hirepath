// ── CODE RUNNER (Wandbox — free, no API key) ──────────────────────────────────
// Tauri mode:  invoke('run_code') — Rust makes the request, no CORS
// Web/dev mode: vite proxy /api/wandbox → https://wandbox.org
import { isTauri } from './platform.js'
import { claude } from './api.js'
import { state } from './state.js'

const COMPILER = { python: 'cpython-3.12.7', java: 'openjdk-jdk-22+36' }

// Wandbox Java compiler uses prog.java — public class declarations must be removed
function _prepareCode(code, lang) {
  if (lang !== 'java') return code
  // Strip 'public' from top-level class declarations so file-name mismatch is avoided
  return code.replace(/^public\s+class\s+/gm, 'class ')
}

function _parseWandbox(rawJson) {
  const data = JSON.parse(rawJson)
  const ok      = data.status === '0'
  const output  = data.program_output?.trim() || ''
  const compErr = data.compiler_error?.trim() || ''
  const runErr  = data.program_error?.trim()  || ''

  // Compilation failed
  if (compErr) return { ok: false, output: compErr }

  // Compiled OK but no main() — treat as partial success
  if (runErr?.includes('main class was not found') || runErr?.includes('main method')) {
    return {
      ok: true,
      output: '✓ Compiled successfully\n\nTo run your code, add a main method:\n\npublic static void main(String[] args) {\n    // create instances and call your methods here\n}',
    }
  }

  const combined = output + (runErr ? (output ? '\n' : '') + '[stderr]\n' + runErr : '')
  return { ok, output: combined || '(no output)' }
}

async function _runWandbox(code, lang) {
  const compiler = COMPILER[lang]
  if (!compiler) throw new Error(`Unsupported language: ${lang}`)
  const prepared = _prepareCode(code, lang)
  const body = JSON.stringify({ compiler, code: prepared })

  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core')
    const rawJson = await invoke('run_code', { code: prepared, language: lang })
    return _parseWandbox(rawJson)
  }

  // Web/dev — goes through vite proxy to avoid CORS
  const resp = await fetch('/api/wandbox/api/compile.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  if (!resp.ok) throw new Error(`Wandbox error: ${resp.status}`)
  return _parseWandbox(await resp.text())
}

async function _runAI(code, lang) {
  const langLabel = lang === 'python' ? 'Python 3' : 'Java 17'
  const system =
    'You are a ' + langLabel + ' interpreter. ' +
    'Execute the code and return ONLY the terminal output. ' +
    'If a method body is "// TODO" or "pass", treat it as a no-op returning the zero value. ' +
    'Output ONLY what the terminal prints. No explanations.'
  const out = await claude(system, '```' + lang + '\n' + code + '\n```', 800, 'fast')
  const trimmed = out.trim()
  const isErr = /^(error:|exception|compileerror|syntaxerror|nameerror|typeerror)/i.test(trimmed)
  return { ok: !isErr, output: trimmed || '(no output)', aiSimulated: true }
}

export async function runCode(code, lang) {
  try {
    return await _runWandbox(code, lang)
  } catch (err) {
    // Network failure fallback — use AI simulation
    const result = await _runAI(code, lang)
    result.output = '[AI 模拟执行 · 网络不可用时的备用方案]\n\n' + result.output
    return result
  }
}
