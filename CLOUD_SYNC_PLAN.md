# L5 Prep — Cross-Platform, Cloud Sync & Accounts Plan

> Status: **Draft** · Last updated: Feb 2026

---

## 1. Goals

| Goal | Description |
|---|---|
| **Cross-platform** | Ship native installers for Windows, macOS, and Linux from a single codebase |
| **Cloud sync** | User's data (stories, BQs, resume bullets, job prep) persists across devices and app reinstalls |
| **Accounts** | Email-based authentication; data is private and tied to a user account |
| **Offline-first** | The app works fully offline; sync happens in the background when online |
| **Zero data migration friction** | Existing local data is automatically pushed to the cloud on first sign-in |
| **Web companion** | Use the same account in any browser and see the same content — full read/write parity with the desktop app |

---

## 2. Current Architecture (baseline)

```
┌─────────────────────────────────────────────────┐
│  WebView2 / WKWebView / WebKitGTK                │
│  Vite 5 · Vanilla JS modules                     │
│  Data: localStorage key "l5v3" (JSON blob)       │
│  API key: Tauri secure keychain commands         │
├─────────────────────────────────────────────────┤
│  Rust (Tauri 2.x)                                │
│  Commands: call_claude, call_claude_stream,       │
│            save/load_api_key, read_pdf_file, …   │
│  Deps: reqwest 0.12, serde, pdf-extract 0.7      │
└─────────────────────────────────────────────────┘
Platform: Windows only (WebView2)
```

**Data model** — `state.S` in localStorage:
```
{ folders[], chapters[], behavioral: { resumes[], stories[], bqStore[] },
  jobPrep: { companies[] } }
```

---

## 3. Target Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Frontend — shared Vite/JS bundle (runs in Tauri WebView OR browser) │
│  + auth.js   (sign-in/out, session management)                        │
│  + sync.js   (offline queue, debounced push, conflict merge)          │
│  + platform.js  (Tauri vs browser capability shims)                   │
├──────────────────────┬───────────────────────────────────────────────┤
│  Tauri desktop shell │  Web companion (browser)                       │
│  Rust 2.x + plugins  │  Static site — Vercel / Netlify / Supabase    │
│  deep-link callbacks │  PKCE OAuth callback via redirect URL          │
│  OS keychain (JWT)   │  localStorage (JWT, same Supabase session)     │
│  read_pdf_file cmd   │  <input type="file"> (PDF paste-only)          │
│  auto-updater        │  Browser cache / PWA (future)                  │
├──────────────────────┴───────────────────────────────────────────────┤
│  Supabase (BaaS) — shared by all surfaces                             │
│  • Auth  — email magic link, Google OAuth                             │
│  • Postgres — user_data table (JSON blob per user)                    │
│  • Row Level Security — users only read/write their own rows          │
│  • Edge Functions (optional) — Claude proxy for future                │
└──────────────────────────────────────────────────────────────────────┘
         ↑  HTTPS/WSS
┌─────────────────────┐
│  GitHub Releases     │  ← .exe / .dmg / .AppImage / .deb
│  GitHub Actions CI   │  ← matrix build: windows/macos/ubuntu + web deploy
└─────────────────────┘
```

---

## 4. Technology Choices

### 4.1 Backend — Supabase

**Why Supabase over alternatives:**

| | Supabase | Firebase | Custom |
|---|---|---|---|
| SQL queries | ✅ PostgreSQL | ❌ NoSQL | ✅ |
| Self-hostable | ✅ | ❌ | ✅ |
| Row Level Security | ✅ built-in | ❌ rules | manual |
| JS client (frontend) | ✅ `@supabase/supabase-js` | ✅ | custom |
| Free tier | 500 MB DB · 50k MAU | 1 GB/day Firestore | — |
| Open source | ✅ MIT | ❌ | — |

Free tier comfortably covers hundreds of users. All Supabase calls are made from the frontend JS via `@supabase/supabase-js` — the Rust backend never calls Supabase directly. Self-hosting is always an option.

### 4.2 Auth — Magic Link first, Google OAuth later

Magic links require no password management, work great for a desktop app, and Supabase sends them out of the box. Google OAuth adds friction (deep-link setup, app verification) so it's Phase 2.

### 4.3 Sync Strategy — Whole-document, last-write-wins

The entire `state.S` JSON is stored as a single `jsonb` column per user. This is appropriate because:
- Data is single-user (no collaboration, so no merge conflicts between users)
- The blob is small (< 1 MB for typical heavy use)
- Simplicity outweighs the overhead of column-level sync

Conflict resolution: **server timestamp wins**. Each save writes a `client_updated_at`; on app start we compare with `server_updated_at` and take whichever is newer.

---

## 5. Cross-Platform Build

### 5.1 What Tauri already handles

Tauri 2.x compiles to native on all three platforms with zero code changes. The WebView used:

| Platform | WebView | Notes |
|---|---|---|
| Windows | WebView2 (Chromium) | Ships with Win 10/11; install prompt on older |
| macOS | WKWebView (WebKit) | Bundled by the OS |
| Linux | WebKitGTK | Requires `libwebkit2gtk-4.1` on the user's system |

Speech recognition (`SpeechRecognition` API) is available on all three but relies on different OS speech engines; test carefully on macOS (uses Siri/Dictation) and Linux (may be limited).

### 5.2 Platform-specific changes needed

**`tauri.conf.json`** — add bundle targets and deep-link scheme:
```json
{
  "bundle": {
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"],
    "macOS": { "minimumSystemVersion": "10.15" },
    "linux": { "deb": { "depends": ["libwebkit2gtk-4.1-0"] } }
  },
  "plugins": {
    "deep-link": {
      "desktop": { "schemes": ["l5prep"] }
    }
  }
}
```
> Note: `deepLinkProtocols` in `bundle` is the Tauri *mobile* (iOS) format. For Tauri 2 desktop, deep-link schemes live under `plugins.deep-link.desktop`.

**`capabilities/default.json`** — add new plugin permissions:
```json
{
  "permissions": [
    "core:default",
    "deep-link:default",
    "keychain:default",
    "store:default",
    "updater:default",
    "notification:default"
  ]
}
```

**macOS-specific** — `Info.plist` entries for microphone access are generated automatically by Tauri when you declare the `microphone` permission; no manual plist editing needed.

**Linux-specific** — microphone requires `pulseaudio` or `pipewire`. Document this in the installer readme.

### 5.3 CI/CD — GitHub Actions matrix build

```yaml
# .github/workflows/release.yml
strategy:
  matrix:
    include:
      - platform: windows-latest
        args: '--target x86_64-pc-windows-msvc'
      - platform: macos-latest
        args: '--target aarch64-apple-darwin'   # M-series
      - platform: macos-latest
        args: '--target x86_64-apple-darwin'    # Intel
      - platform: ubuntu-22.04
        args: ''
```

Artifacts: `.exe` (NSIS installer + MSI), `.dmg`, `.AppImage` + `.deb`.

Code signing:
- **Windows**: self-signed cert (free) → store secret in GitHub, sign during CI
- **macOS**: requires Apple Developer account ($99/yr) for Gatekeeper notarization
- **Linux**: no signing required

---

## 6. Authentication Design

### 6.1 Flow — magic link (Phase 1)

```
User opens app (no session)
  → Shows sign-in screen (email input)
  → Calls supabase.auth.signInWithOtp({ email })
  → Supabase sends email with link: l5prep://auth?token_hash=…&type=magiclink
  → User clicks link in email client
  → OS routes l5prep:// to the app via deep-link plugin
  → Rust handler passes URL to frontend: window.emit('auth-callback', url)
  → JS calls supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
  → Session established — JWT stored via OS keychain (tauri-plugin-keychain)
  → Trigger initial sync
```

### 6.2 Session persistence

Tokens are stored securely — **not** in `localStorage`. Two options, pick one:

| Option | Plugin | Storage | Notes |
|---|---|---|---|
| **A (recommended)** | `tauri-plugin-keychain` | OS keychain (Credential Manager / macOS Keychain) | True OS-level secret storage |
| B | `tauri-plugin-store` | AES-encrypted JSON file in app data dir | Simpler, but not OS keychain — key derived from app identity |

On app start:
1. Load tokens from chosen store
2. Call `supabase.auth.setSession({ access_token, refresh_token })`
3. Supabase client auto-refreshes the access token before expiry

> ⚠️ `tauri-plugin-store` is **not** backed by the OS keychain despite common confusion — it writes an encrypted file. For JWT tokens, Option A (keychain) is preferred.

### 6.3 New JS module: `src/auth.js`

```
exports:
  initAuth()          — load persisted session, subscribe to auth state changes
  signIn(email)       — trigger magic link
  signOut()           — clear session + stop sync
  getUser()           — current user object or null
  onAuthChange(cb)    — subscribe to sign-in/sign-out events
```

### 6.4 UI changes

- **No-account state**: thin banner at bottom of sidebar — "Sign in to sync across devices" with a button. App works fully without signing in.
- **Sign-in modal**: email input → "Send magic link" → confirmation message.
- **Signed-in state**: settings modal shows email + "Sign out". Sync status icon in sidebar footer.
- **Settings modal** (`api.js`): add auth section below the language toggle.

### 6.5 Google OAuth (Phase 2)

```js
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    // Desktop: OS routes l5prep:// back to the app via deep-link plugin
    // Web: redirects to the hosted callback page instead
    redirectTo: isTauri ? 'l5prep://auth' : 'https://app.l5prep.com/auth/callback'
  }
})
// Desktop: Opens system browser → Google consent → redirects to l5prep://auth?code=…
//          Deep-link handler calls supabase.auth.exchangeCodeForSession(code)
// Web:     Browser redirects to /auth/callback → same PKCE handler as magic link (§5.3)
```

Requires Google Cloud Console OAuth app with **both** redirect URIs registered:
- `l5prep://auth` (desktop)
- `https://app.l5prep.com/auth/callback` (web)

Also requires Supabase Google provider configuration and macOS App Transport Security exception (handled automatically by WKWebView for `https`).

---

## 7. Cloud Sync Design

### 7.1 Database schema

```sql
-- Supabase (PostgreSQL)

create table user_data (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade not null,
  data           jsonb not null default '{}',
  client_updated_at timestamptz,           -- set by the client
  updated_at     timestamptz default now() -- set by the server (trigger)
);

-- Unique: one row per user
alter table user_data add constraint user_data_user_unique unique (user_id);

-- Auto-update server timestamp
create or replace function set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
create trigger user_data_updated_at before update on user_data
  for each row execute function set_updated_at();

-- Row Level Security: users access only their own row
alter table user_data enable row level security;
-- USING covers SELECT/UPDATE/DELETE; WITH CHECK covers INSERT
create policy "own data" on user_data for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### 7.2 New JS module: `src/sync.js`

```
State:
  _pendingPush     boolean
  _lastSyncedAt    timestamp (stored in tauri-plugin-store on desktop; localStorage on web)
  _online          boolean (navigator.onLine + fetch health-check)

Exports:
  initSync()          — called after auth, sets up listeners
  schedulePush()      — debounced (3 s) push to cloud; called by save(), not a replacement
  pullOnStart()       — on app start, compare timestamps and pull if cloud is newer
  getSyncStatus()     — { state: 'synced'|'pending'|'offline'|'error', lastSyncedAt }
  onSyncChange(cb)    — subscribe to status changes (updates sidebar badge)
```

### 7.3 Save flow (modified)

```
Current:  save() → localStorage.setItem('l5v3', JSON.stringify(state.S))

New:      save() → localStorage.setItem('l5v3', …)   ← keep for offline
                 → sync.schedulePush()                ← debounced cloud push
```

`schedulePush()` waits 3 seconds after the last `save()` call, then:
1. Sets `client_updated_at = now()`
2. Calls `supabase.from('user_data').upsert({ user_id, data: state.S, client_updated_at })`
3. On success → `_lastSyncedAt = now()`, emits `synced`
4. On network error → queues in-memory, retries when `online` event fires

### 7.4 Pull on start (conflict resolution)

```js
async function pullOnStart() {
  const { data } = await supabase.from('user_data')
    .select('data, updated_at').single()
  if (!data) {
    // No cloud data yet → push local data up
    await pushNow()
    return
  }
  const serverTs = new Date(data.updated_at).getTime()
  const localTs  = new Date(_lastSyncedAt || 0).getTime()
  if (serverTs > localTs) {
    // Cloud is newer (another device was used) → merge
    state.S = _merge(state.S, data.data)
    save()   // persist merged state locally
  }
  // else: local is current → push happens naturally on next edit
}
```

**Merge strategy** — additive for collections, newest-timestamp for other fields:
- `chapters`, `folders`, `stories`, `resumes`, `bqStore`, `companies`: union by `id` (add items that exist in only one side; for conflicts on same `id`, use newest `updatedAt`)
- Other scalar config: server wins

> ⚠️ **Prerequisite**: the current data model items only have `createdAt` (or no timestamp). Every `save()` call must also stamp `updatedAt = new Date().toISOString()` on the modified item before this merge logic works. This needs to be implemented as part of Phase 3, touching `state.js` and every mutation in `resume.js`, `stories.js`, `bqstore.js`, `jobprep.js`, and `chapters.js`.

### 7.5 Sync status UI

Sidebar footer gets a small badge:
- ☁ grey = offline
- ⟳ animated = syncing
- ✓ green = synced
- ⚠ amber = pending (unsaved to cloud)
- ✕ red = error (tap for details)

---

## 8. API Key Strategy

Three options for how to handle the Anthropic API key post-accounts:

### Option A — User-provided key (current, keep as-is)
Users configure their own `sk-ant-…` key in settings. Free to use, user controls costs. **Recommended for v1** — zero backend complexity.

### Option B — Backend proxy (subscription model)
The Rust `call_claude` command is replaced by a call to a Supabase Edge Function that holds a shared `sk-ant-…` key. Users subscribe to use the service. Removes the key-setup friction entirely. Requires: pricing model, payment (Stripe), rate limiting, cost management.

### Option C — Freemium hybrid
- Free tier: user provides own key (current behavior)
- Paid tier: backend proxy, no key required

**Recommendation**: Ship with Option A, design the system so Option B/C can be dropped in later without changing the frontend call sites (the `claude()` / `claudeStream()` functions in `api.js` are the only integration points).

---

## 9. Data Migration (existing users → cloud)

On first sign-in after the cloud feature ships:

```
1. App detects sign-in event
2. Checks if cloud row exists for this user
3. If no cloud row → push current localStorage data up (silent)
4. If cloud row exists (user signed in on another device first) → merge
5. Show one-time toast: "Your data has been synced to the cloud ✓"
```

This is fully automatic. No manual export/import needed.

---

## 10. Implementation Phases

### Phase 1 — Cross-platform builds (no new features)
**Effort: ~1–2 days**
- Add macOS and Linux to Tauri build config
- Set up GitHub Actions matrix build
- Add platform-specific capability declarations
- Test on macOS (Safari/WebKit differences: CSS, Speech API)
- Test on Ubuntu (WebKitGTK, microphone availability)
- Produce `.dmg`, `.AppImage`, `.deb` artifacts

**Deliverable**: GitHub Release with installers for all three platforms.

---

### Phase 2 — Authentication (magic link)
**Effort: ~3–4 days**
- Add Supabase JS client (`@supabase/supabase-js`)
- Add `tauri-plugin-deep-link` + register `l5prep://` scheme
- Add `tauri-plugin-store` for encrypted token persistence
- Create `src/auth.js` (signIn, signOut, session init)
- Deep-link handler in `lib.rs` → emit `auth-callback` event to frontend
- Sign-in UI: bottom-of-sidebar banner → modal with email input
- Settings modal: show signed-in email + sign-out button
- Signed-out: app works fully, banner persists

**Deliverable**: Users can sign in/out with email magic link. Data still local only.

---

### Phase 3 — Cloud sync
**Effort: ~3–4 days**
- Provision Supabase project, create `user_data` table + RLS
- Create `src/sync.js` (schedulePush, pullOnStart, status)
- Hook `save()` → `sync.schedulePush()`
- Pull on app start (after auth resolves)
- Migration: push local data on first sign-in
- Sync status badge in sidebar footer
- Offline detection + retry queue

**Deliverable**: Data syncs across devices transparently. Works offline.

---

### Phase 4 — Auto-updates + polish
**Effort: ~1–2 days**
- Add `tauri-plugin-updater`
- Host update manifests in GitHub Releases
- Notification when update is available (non-blocking prompt)
- Google OAuth (Phase 2 of auth)
- Rate limiting / abuse protection if using shared key (Option B)

---

### Phase 5 — Web Companion
**Effort: ~3–4 days** (Phases 2–3 must be complete first)

The goal: the exact same Vite JS bundle runs in a browser tab at a hosted URL. Users sign in with their Supabase account and get full read/write access to all their data.

#### 5.1 What changes for the browser

| Feature | Desktop (Tauri) | Browser |
|---|---|---|
| OAuth callback | `l5prep://auth` deep-link | Redirect to `https://app.l5prep.com/auth/callback` (PKCE) |
| JWT storage | `tauri-plugin-keychain` (OS keychain) | `localStorage` — acceptable because XSS surface is our own app |
| PDF parsing | `read_pdf_file` Rust command | `<input type="file" accept=".pdf">` → text extraction via `pdf.js` |
| Auto-updater | `tauri-plugin-updater` | Not applicable; users always load latest from server |
| Drag-and-drop PDF | ✅ native file drop | Not supported on web |
| Speech recognition | Web Speech API ✅ | Web Speech API ✅ (same) |
| Claude API calls | Rust `call_claude` command | Direct `fetch` to `https://api.anthropic.com` (CORS open for browser) |

#### 5.2 Platform detection shim — `src/platform.js`

```js
// Detect Tauri vs browser at runtime
export const isTauri = '__TAURI_INTERNALS__' in window

export async function readPdfFile(path) {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('read_pdf_file', { path })
  }
  // Browser: file already read by <input type="file"> — caller passes text directly
  throw new Error('Use file input in browser')
}

export async function callClaude(payload) {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('call_claude', payload)
  }
  // Browser: call Anthropic API directly
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': getApiKey(), 'anthropic-version': '2023-06-01',
                'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(payload)
  })
  const json = await res.json()
  return json.content[0].text
}
```

> Note: direct browser calls to the Anthropic API require the `anthropic-dangerous-direct-browser-access: true` header (Anthropic's explicit opt-in for browser CORS). The user's key is still required — this keeps Option A (user-provided key) compatible with the web build.

#### 5.3 Auth flow change for PKCE (browser)

```js
// auth.js — conditional on platform
async function signIn(email) {
  if (isTauri) {
    // Magic link with custom deep-link callback
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: 'l5prep://auth' }
    })
  } else {
    // PKCE flow: redirect to hosted callback page
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: 'https://app.l5prep.com/auth/callback' }
    })
  }
}

// On the callback page — Supabase v2 PKCE handling:
// Option 1 (automatic): supabase client detects ?code= in URL and fires onAuthStateChange
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) { /* redirect to app root */ }
})
// Option 2 (explicit): extract code param and call directly
const code = new URL(window.location.href).searchParams.get('code')
if (code) await supabase.auth.exchangeCodeForSession(code)
// Note: getSessionFromUrl() was deprecated in @supabase/supabase-js v2.x
```

#### 5.4 Build targets

Two Vite build outputs from a single source tree:

```js
// vite.config.js
export default defineConfig(({ mode }) => ({
  build: {
    outDir: mode === 'web' ? 'dist-web' : 'dist',
  },
  define: {
    __IS_WEB__: mode === 'web',
  }
}))
```

```
npm run build            → dist/        (Tauri desktop, existing)
npm run build:web        → dist-web/    (browser deployment)
```

`tauri.conf.json` `frontendDist` points to `dist/`; the web deploy pushes `dist-web/` to Vercel/Netlify.

#### 5.5 Hosting

Options:
| Provider | Cost | Notes |
|---|---|---|
| **Vercel** (recommended) | Free hobby tier | Auto-deploy from `dist-web/` on every push to `main` |
| Netlify | Free tier | Same workflow |
| Supabase Hosting | ⚪ In beta | Would keep everything in one service |

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the hosting dashboard (same values as the desktop build).

#### 5.6 What is NOT available on the web (graceful degradation)

- **PDF file drop**: replaced by a plain `<input type="file">` button in the Resume Analyzer. All other features work identically.
- **Native notifications**: use browser `Notification` API instead (requires permission prompt).
- **Auto-updater**: not needed; users always load the latest version on page load.

**Deliverable**: Publicly hosted web app where users can sign in, access all their data, and use every feature (except file-drop PDF) from any browser.

---

## 11. New Dependencies Summary

### npm (`package.json`)
```json
"@supabase/supabase-js": "^2",
"@tauri-apps/plugin-deep-link": "^2",
"@tauri-apps/plugin-keychain": "^2",
"@tauri-apps/plugin-store": "^2",
"@tauri-apps/plugin-updater": "^2",
"@tauri-apps/plugin-notification": "^2",
"pdfjs-dist": "^4"
```
> `tauri-plugin-keychain` is for JWT token storage (OS keychain). `tauri-plugin-store` is kept for other app preferences (e.g., last sync timestamp, UI state) where OS keychain is overkill.
> `pdfjs-dist` is used **only** in the web build (`isTauri === false`) to parse PDFs from `<input type="file">` in the browser. The desktop build continues to use the Rust `read_pdf_file` command.

Also add `build:web` script:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "build:web": "vite build --mode web",
  "preview": "vite preview",
  "tauri": "tauri"
}
```

### Rust (`Cargo.toml`)
```toml
tauri-plugin-deep-link    = "2"
tauri-plugin-keychain     = "2"
tauri-plugin-store        = "2"
tauri-plugin-updater      = "2"
tauri-plugin-notification = "2"
```

### Environment variables (build-time, never committed)
```
SUPABASE_URL          = https://<project>.supabase.co
SUPABASE_ANON_KEY     = eyJ…  (public, safe to ship in the app)
```
The `anon` key is designed to be public — RLS enforces all access control.

---

## 12. Security Considerations

| Concern | Mitigation |
|---|---|
| Anthropic API key exposure | **Desktop**: stays in OS keychain (Tauri keychain), never sent to Supabase. **Web**: stored in `localStorage` — lower security than OS keychain, but the key is never transmitted to our servers and the XSS surface is our own first-party app |
| Supabase anon key in binary | Intentionally public; RLS on `user_data` means it cannot be abused to read others' data |
| JWT token storage | `tauri-plugin-keychain` → OS keychain (Credential Manager / macOS Keychain). `tauri-plugin-store` is an encrypted file, not the OS keychain — see §6.2 |
| Deep-link hijacking | OS-level protocol registration; only the registered app handles `l5prep://` |
| Data at rest | Supabase encrypts data at rest (AES-256); local localStorage is unencrypted (low-sensitivity data) |
| HTTPS only | Supabase endpoints are HTTPS; reqwest enforces TLS; WebView CSP can be tightened |

---

## 13. Non-Goals (explicitly out of scope)

- **Collaboration / sharing** — this is a personal prep tool; multi-user editing is not planned
- **Self-hosted backend** — Supabase cloud is the target; self-hosting docs can come later
- **Mobile app** — Tauri targets desktop; a React Native or Capacitor port is a separate project
- **Progressive Web App (PWA) push notifications** — nice-to-have, not required for parity
- **Real-time sync** — Supabase Realtime is available but unnecessary for single-user; polling on app focus is sufficient
- **End-to-end encryption** — data in Supabase is encrypted at rest by the service; E2E (client-side encryption before upload) adds significant complexity with key recovery challenges and is not planned

---

## 14. Where Can You Sign In? (multi-platform access matrix)

| Surface | Covered by this plan | Notes |
|---|---|---|
| Windows desktop | ✅ Phase 1–3 | Primary target |
| macOS desktop | ✅ Phase 1–3 | Same codebase |
| Linux desktop | ✅ Phase 1–3 | Same codebase |
| **Web browser** | ✅ **Phase 5** | Same JS bundle; PKCE OAuth; PDF paste-only; full read/write parity |
| Mobile (iOS/Android) | ❌ Out of scope | Separate app (Capacitor/React Native) required |

**Same account, different desktops**: ✅ — core sync story. Sign in on your work Mac and home Windows PC with the same email; data syncs automatically.

**Sign in from a browser**: ✅ — explicit Phase 5 goal. Open `app.l5prep.com` (or similar), sign in with the same email, and all your stories, BQs, and resume bullets are right there. No install needed.

---

## 15. Open Questions

1. **App identifier / domain** — `com.l5prep.app` is fine for development. A real domain is needed for macOS notarization and Google OAuth redirect URI configuration.
2. **Pricing model** — Option A (user key) vs Option B (proxy subscription) needs a decision before Phase 4.
3. **Account deletion / GDPR** — a "Delete my account and data" flow is required before any public launch; Supabase cascade deletes handle the data side automatically.
4. **Multiple Supabase environments** — dev / staging / prod? For a personal tool, one project is fine initially.
5. **Current API key storage** — verify whether `save_api_key` / `load_api_key` in `lib.rs` currently uses the OS keychain (e.g., `tauri-plugin-keychain`) or a plain/encrypted file. If it's file-based today, the security table in §12 should note that.
