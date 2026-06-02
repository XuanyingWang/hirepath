// ── AUTHENTICATION ────────────────────────────────────────────────────────────
import { supabase, supabaseConfigured } from './supabase.js'
import { isTauri } from './platform.js'
import { t } from './i18n.js'

let _user = null
const _cbs = []   // auth-change subscribers

// ── Public API ────────────────────────────────────────────────────────────────

export function getUser() { return _user }

/** Register a callback fired on every auth state change.
 *  cb(event: string, user: object|null) */
export function onAuthChange(cb) { _cbs.push(cb) }

export async function initAuth() {
  if (!supabaseConfigured) return

  // Subscribe to future auth state changes (sign-in, sign-out, token refresh)
  supabase.auth.onAuthStateChange((event, session) => {
    _notify(event, session)
  })

  // Restore persisted session from localStorage (supabase-js manages this)
  const { data: { session } } = await supabase.auth.getSession()
  _notify('INITIAL_SESSION', session)

  // Hook deep-link callback (desktop) or URL callback (web)
  if (isTauri) {
    try {
      const { onOpenUrl, getCurrent } = await import('@tauri-apps/plugin-deep-link')
      // App already running — incoming deep link
      await onOpenUrl(async (urls) => {
        for (const url of urls) await _handleCallback(url)
      })
      // App launched via deep link — handle the launch URL
      const initial = await getCurrent()
      if (initial) {
        for (const url of initial) await _handleCallback(url)
      }
    } catch (e) {
      console.warn('deep-link plugin not available:', e)
    }
  } else {
    // Web: check if this page load is an OAuth/magic-link callback
    const href = window.location.href
    if (href.includes('token_hash=') || href.includes('code=') || href.includes('access_token=')) {
      await _handleCallback(href)
    }
  }
}

/** Verify a 6-digit OTP code. Throws on error. */
export async function verifyOtp(email, token) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
}

/** Send a magic-link email. Throws on error. */
export async function signIn(email) {
  if (!supabaseConfigured) {
    alert(t(
      '请先配置 Supabase（在 .env 文件中填写 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY）',
      'Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.'
    ))
    return
  }
  const redirectTo = isTauri
    ? 'l5prep://auth'
    : window.location.origin + '/auth/callback'
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo }
  })
  if (error) throw error
}

export async function signOut() {
  if (!supabaseConfigured) return
  await supabase.auth.signOut()
  _user = null
  _fire('SIGNED_OUT', null)
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _notify(event, session) {
  const prev = _user?.id
  _user = session?.user || null
  if (_user?.id !== prev || event === 'INITIAL_SESSION') {
    _fire(event, _user)
  }
}

function _fire(event, user) {
  _cbs.forEach(cb => { try { cb(event, user) } catch (_) {} })
}

async function _handleCallback(url) {
  try {
    const parsed = new URL(url)
    const tokenHash  = parsed.searchParams.get('token_hash')
    const type       = parsed.searchParams.get('type') || 'magiclink'
    const code       = parsed.searchParams.get('code')
    const accessToken  = parsed.hash && new URLSearchParams(parsed.hash.slice(1)).get('access_token')
    const refreshToken = parsed.hash && new URLSearchParams(parsed.hash.slice(1)).get('refresh_token')

    if (tokenHash) {
      await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    } else if (code) {
      await supabase.auth.exchangeCodeForSession(code)
    } else if (accessToken && refreshToken) {
      // Implicit flow fallback (some older magic link formats)
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    }

    // On web, clean up the URL so the tokens don't linger in the address bar
    if (!isTauri) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  } catch (e) {
    console.error('Auth callback error:', e)
  }
}
