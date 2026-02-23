# L5 Prep — Google SDE Interview Study Tool

A Tauri desktop app (Rust + Vite/JS) that turns any technical documentation URL into structured L5-level interview study notes and adaptive quiz questions.

## Features

- **Automatic page fetching** — the Rust backend fetches and extracts plain text from documentation URLs so Claude receives actual content, not just a link
- **Paste fallback** — for pages that require login (internal wikis, gated docs), paste content directly into the form
- **AI knowledge framework** — Claude generates six structured sections per chapter: Core Concepts, Architecture & Design, Implementation Details, Performance & Trade-offs, Best Practices / Common Pitfalls, L5 High-Frequency Topics
- **Adaptive quiz** — two modes: *Concept* (definitions, principles, comparisons) and *Scenario* (system design decisions, fault diagnosis, capacity planning); 10 questions per session with per-question hints and explanations
- **Folder/chapter organization** — create folders with custom emoji icons, move chapters between folders, rename/delete anytime
- **Local storage** — all notes persist in `localStorage`; API key is stored securely in the OS app-config directory via the Rust backend (never sent anywhere beyond Anthropic)
- **Secure API calls** — all Claude API calls go through the Rust backend to avoid CORS issues and keep the key out of DevTools

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18 + |
| Rust / Cargo | 1.77 + |
| Tauri CLI | 2.x (installed as dev-dep) |

On Windows you also need the [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (ships with Windows 10/11).

## Setup

```bash
# 1. Install JS dependencies
npm install

# 2. Start development (launches Vite + the native window)
npm run tauri dev
```

The first `tauri dev` run compiles the Rust crate and will take a few minutes. Subsequent runs are fast thanks to incremental compilation.

## First Launch

On first launch the app asks for an **Anthropic API key** (starts with `sk-ant-`). The key is saved to the OS config directory (`%APPDATA%\com.l5prep\config\config.json` on Windows) and never leaves your machine except in requests to `api.anthropic.com`.

Get a key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).

## How to Use

### Add a chapter

1. Click **+ 添加章节** in the sidebar footer
2. Fill in the chapter name and (optionally) the folder it belongs to
3. Paste the documentation URL — or paste raw text if the page needs a login
4. Click **分析 →**

The app will:
1. Fetch the URL content (Rust backend, bypasses CORS)
2. Run two parallel Claude calls to generate the full knowledge framework
3. Save the chapter and open it automatically

### Study the framework

Click any chapter in the sidebar to open the **知识框架** tab. The structured notes render as formatted markdown with syntax-highlighted code blocks and comparison tables.

### Take a quiz

Switch to the **Quiz 练习** tab, choose *Concept* or *Scenario* mode, and click **开始 10 题**. After each answer you get an explanation; at the end you see a per-question result breakdown.

## Project Structure

```
l5-prep-desktop/
├── index.html              # App shell (sidebar + main area)
├── src/
│   ├── main.js             # All frontend logic (state, UI, Tauri invocations)
│   └── styles.css          # Design system (warm beige, Inter + Lora fonts)
├── src-tauri/
│   ├── Cargo.toml          # Rust deps: tauri, reqwest, serde, tokio
│   ├── tauri.conf.json     # Window size, bundle ID, dev URL
│   └── src/
│       ├── main.rs         # Entry point (calls lib::run)
│       └── lib.rs          # Tauri commands: call_claude, fetch_url,
│                           #   save_api_key, load_api_key
│                           #   + html_to_text helpers
└── vite.config.js          # Dev server on :1420, Chrome 105 target
```

## Tauri Commands (Rust → JS bridge)

| Command | Description |
|---------|-------------|
| `call_claude(apiKey, system, userMsg, maxTokens)` | POST to Anthropic API, returns text |
| `fetch_url(url)` | GET URL, strip HTML, return plain text (≤ 12 000 chars) |
| `save_api_key(key)` | Write key to OS config dir |
| `load_api_key()` | Read key from OS config dir |

## Build for Distribution

```bash
npm run tauri build
```

Output is in `src-tauri/target/release/bundle/`.

## Notes on the URL Fetcher

The `fetch_url` command strips `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, and `<aside>` blocks before stripping all remaining HTML tags, decoding entities, and collapsing whitespace. Content is capped at 12 000 characters (~3 000 tokens) to leave room for the Claude prompt and response. If a page requires authentication, use the **粘贴内容** textarea instead.
