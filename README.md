# HirePath

An AI-powered desktop app to help software engineers prepare for SDE II interviews — from technical depth to behavioral storytelling.

---

## What It Does

HirePath brings together every part of the interview process in one place. You feed it your study materials and resume; it generates study guides, practice questions, polished stories, and mock interview content — all tailored to the senior engineer bar.

---

## Modules

### 📚 Knowledge Base
Turn any technical document into a structured study guide. Paste a URL, upload a PDF, or paste raw text — the AI fetches the content, extracts key concepts, and generates a full knowledge framework covering core concepts, architecture trade-offs, implementation details, performance considerations, and common pitfalls.

### ❓ Quiz
After studying a chapter, test yourself with 10 AI-generated questions in two modes:
- **Concept** — definitions, comparisons, principles
- **Scenario** — system design decisions, fault diagnosis, capacity planning

Each question comes with a hint and a detailed explanation after you answer.

### 🃏 Flashcards
Generate a deck of flashcards from any chapter for quick review. Flip, mark as learned, or skip — the session tracks your progress.

### 🧩 LeetCode Patterns
Study algorithmic patterns (sliding window, two pointers, dynamic programming, etc.) with AI-generated guides and curated problem sets. Add your own notes and track which patterns you've mastered.

### 🏗️ OOD Design
Practice object-oriented design questions. The AI plays the role of an interviewer — ask clarifying questions, design your solution, and get feedback on your approach.

### 📄 Resume Analyzer
Upload your resume and drill into each bullet point:
- Generate 5 HM-style deep-dive questions per bullet
- Practice and polish your answers
- Get honest feedback scored against the SDE II bar
- Build a self-introduction script from your resume with a practice mode

### 🎯 BQ Prep
A behavioral question bank paired with a STAR story library:
- Browse high-frequency behavioral questions
- Link your STAR stories to relevant questions
- Auto-generate polished answers from your stories
- Practice with speech recognition

### ⭐ STAR Stories
Build and refine behavioral stories:
- Free-write a draft and let AI extract the STAR structure
- Polish the story to be crisp, first-person, and impact-forward
- Reuse stories across multiple behavioral questions

### 💼 Job Prep
Track job applications and prep for each role:
- Paste a job posting URL to auto-extract requirements and responsibilities
- Connect your resume and see which bullets match the role
- Prep tailored talking points per company

### 🖼️ Knowledge Aggregator
Batch-analyze multiple documents at once into a unified study guide — useful for consolidating notes from several related topics into one coherent reference.

### 📊 Progress Dashboard
See your overall readiness at a glance — chapter coverage, quiz scores, and weak areas that need more attention.

---

## AI Providers

HirePath supports three AI providers. Switch between them in Settings:

| Provider | Model |
|----------|-------|
| **Anthropic Claude** (default) | claude-sonnet-4 / claude-haiku-4 |
| Google Gemini | gemini-2.0-flash |
| OpenAI | gpt-4o-mini |

All API keys are stored locally on your machine and never sent anywhere other than the respective AI provider.

---

## Getting Started

### Requirements
- macOS (Windows support coming)
- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs)

### Run Locally

```bash
git clone https://github.com/XuanyingWang/hirepath.git
cd hirepath
npm install
npm run tauri dev
```

On first launch, the app will prompt you to enter an API key. Get one at:
- **Claude:** [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
- **Gemini:** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **OpenAI:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### Build

```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

---

## Optional: Cloud Sync

Sign in with a magic link (email) to back up your data and sync across devices via Supabase. To self-host:

1. Create a free project at [supabase.com](https://supabase.com)
2. Copy `.env.example` → `.env` and fill in your project URL and anon key

---

## Tech Stack

- **UI:** Vanilla JS + Vite
- **Desktop:** Tauri 2 (Rust)
- **AI:** Anthropic Claude, Google Gemini, OpenAI
- **Sync:** Supabase (optional)
