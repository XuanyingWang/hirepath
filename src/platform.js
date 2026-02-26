// ── PLATFORM SHIM ─────────────────────────────────────────────────────────────
// Detects whether we are running inside Tauri (desktop) or a plain browser.
// Import `isTauri` in any module that needs to branch on the platform.

export const isTauri = '__TAURI_INTERNALS__' in window
