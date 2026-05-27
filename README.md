# HirePath

> AI-powered desktop app for SDE interview prep — covering technical knowledge, behavioral questions, resume deep-dives, and coding patterns.

![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Tauri](https://img.shields.io/badge/Tauri-2.x-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

| Module | Description |
|--------|-------------|
| 📚 **Knowledge Analysis** | Paste a doc URL — AI fetches, analyzes, and generates a structured study guide |
| ❓ **Quiz** | AI-generated concept & scenario questions calibrated to SDE II level |
| 🃏 **Flashcards** | Auto-generated flashcard decks from your study materials |
| 📊 **Dashboard** | Track readiness score across all chapters |
| 🧠 **OOD Practice** | Object-oriented design interview questions with AI feedback |
| 🔢 **LeetCode Patterns** | Pattern-based study guides with curated problem sets |
| 📝 **Resume Deep-Dive** | Bullet-level HM interview questions, answer polishing, and evaluation |
| 🎤 **Self Introduction** | AI-generated 3-part intro script with practice mode |
| ⭐ **STAR Stories** | Build and polish behavioral stories with STAR structure extraction |
| 💼 **BQ Prep** | Behavioral question bank with story-linking and answer tuning |
| 🏢 **Job Prep** | Parse job postings, match resume bullets, track applications |
| 📦 **Aggregator** | Batch-analyze multiple docs into a unified knowledge base |

---

## Tech Stack

- **Frontend:** Vanilla JS + Vite
- **Desktop shell:** [Tauri 2](https://tauri.app) (Rust)
- **AI providers:** Anthropic Claude (default), Google Gemini, OpenAI
- **Cloud sync:** Supabase (optional)

---

## Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| Rust / Cargo | 1.77+ |
| Tauri CLI | 2.x (installed as dev-dep) |

### Install & Run

```bash
# Clone
git clone https://github.com/XuanyingWang/hirepath.git
cd hirepath

# Install JS dependencies
npm install

# Start in dev mode (opens desktop window with hot reload)
npm run tauri dev
```

The first `tauri dev` run compiles the Rust crate — takes a few minutes. Subsequent runs are fast thanks to incremental compilation.

### Configure API Key

On first launch a settings dialog will appear. Enter your API key:

| Provider | Where to get it |
|----------|----------------|
| **Anthropic Claude** (default) | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| Google Gemini | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

> **Note:** Claude Pro (claude.ai subscription) and the Anthropic API are separate products with separate billing. The API requires its own account at [console.anthropic.com](https://console.anthropic.com).

Keys are stored locally in the OS app-config directory and never leave your machine except in requests to the respective AI provider.

### Build for Production

```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

---

## Cloud Sync (Optional)

HirePath supports optional cloud backup and cross-device sync via Supabase:

1. Create a free project at [supabase.com](https://supabase.com)
2. Copy `.env.example` to `.env` and fill in your project URL and anon key
3. Sign in with a magic link from the Settings panel

---

## Project Structure

```
hirepath/
├── src/                    # Frontend (Vanilla JS + Vite)
│   ├── behavioral/         # Resume, STAR stories, BQ prep
│   ├── analysis.js         # AI knowledge analysis
│   ├── quiz.js             # Quiz generation
│   ├── flashcards.js       # Flashcard generation
│   ├── patterns.js         # LeetCode patterns
│   ├── ood.js              # OOD practice
│   ├── jobprep.js          # Job posting tracker
│   ├── dashboard.js        # Readiness dashboard
│   └── api.js              # AI provider abstraction (Claude / Gemini / OpenAI)
├── src-tauri/              # Rust backend (Tauri 2)
│   ├── src/lib.rs          # Tauri commands — AI calls, file I/O, PDF parsing
│   └── capabilities/       # Frontend permission configuration
├── .env.example            # Supabase config template
└── package.json
```

---

## License

MIT
