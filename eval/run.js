// RAG eval harness for HirePath's Knowledge Base Q&A pipeline.
//
// Runs the same algorithm as src/rag.js + the chapter Q&A flow in
// src/knowledge.js (`_doChQuestion`) — chunk -> embed -> top-k retrieve ->
// grounded generation — against a local golden corpus (eval/dataset.js) so
// results are reproducible and don't touch production Supabase data.
//
// Usage:
//   npm run eval
//
// Requires VOYAGE_API_KEY and ANTHROPIC_API_KEY in .env

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { CORPUS, TEST_CASES } from './dataset.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REPORTS_DIR = path.join(__dirname, 'reports')

// ── tiny .env loader (no extra dependency) ──────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
}
loadEnv()

const VOYAGE_KEY = process.env.VOYAGE_API_KEY
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY
const JUDGE_MODEL = 'claude-sonnet-4-6'
const GEN_MODEL = 'claude-sonnet-4-6'
const TOP_K = 4
const PASS_THRESHOLD = 7 // out of 10, per rubric dimension

if (!VOYAGE_KEY || !CLAUDE_KEY) {
  console.error('Missing VOYAGE_API_KEY and/or ANTHROPIC_API_KEY in .env — see .env.example')
  process.exit(1)
}

// ── chunking (mirrors src/rag.js _chunkText) ────────────────────────────────
function chunkText(text, size = 400, overlap = 50) {
  const chunks = []
  for (let i = 0; i < text.length; i += size - overlap) chunks.push(text.slice(i, i + size))
  return chunks
}

// ── Voyage AI embeddings (mirrors src/rag.js _embedTexts) ───────────────────
async function embedTexts(texts) {
  const resp = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VOYAGE_KEY}` },
    body: JSON.stringify({ model: 'voyage-3-lite', input: texts }),
  })
  if (!resp.ok) throw new Error(`Voyage AI ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  return data.data.map(d => d.embedding)
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ── Claude calls ─────────────────────────────────────────────────────────────
async function callClaude(model, system, userMsg, maxTokens = 1024) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  if (!resp.ok) throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  return data.content[0].text
}

function stripJsonFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

async function generateAnswer(question, retrievedChunks) {
  const context = retrievedChunks.map((c, i) => `[${i + 1}] ${c.text}`).join('\n\n')
  const system = `You are an SDE II interview coach. Answer the candidate's question in
3-5 concise bullet points, using ONLY the retrieved notes below. If the notes
don't contain the answer, say so instead of guessing.

Relevant notes retrieved from knowledge base:
${context}`
  return callClaude(GEN_MODEL, system, question, 600)
}

async function judge(question, retrievedChunks, answer, expectedChapterName) {
  const context = retrievedChunks.map((c, i) => `[${i + 1}] (from "${c.chapterName}") ${c.text}`).join('\n\n')
  const system = `You are grading a RAG system for an interview-prep app. Score the
retrieval + answer on three 0-10 dimensions:

- retrieval_relevance: are the retrieved chunks actually relevant to the question?
- groundedness: is the answer fully supported by the retrieved chunks, with no
  fabricated facts not present in the chunks?
- answer_quality: does the answer correctly and clearly answer the question?

Respond with ONLY a JSON object, no prose, no markdown fences:
{"retrieval_relevance": <0-10>, "groundedness": <0-10>, "answer_quality": <0-10>, "rationale": "<one sentence>"}`

  const userMsg = `Question: ${question}

Retrieved chunks:
${context}

Generated answer:
${answer}`

  const raw = await callClaude(JUDGE_MODEL, system, userMsg, 300)
  try {
    return JSON.parse(stripJsonFences(raw))
  } catch {
    return { retrieval_relevance: 0, groundedness: 0, answer_quality: 0, rationale: `Judge returned unparseable output: ${raw.slice(0, 200)}` }
  }
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nHirePath RAG Eval — ${CORPUS.length} chapters, ${TEST_CASES.length} test cases\n`)

  console.log('Indexing corpus (chunk + embed)...')
  const pool = [] // { chapterId, chapterName, text, embedding }
  for (const doc of CORPUS) {
    const chunks = chunkText(doc.content)
    const embeddings = await embedTexts(chunks)
    chunks.forEach((text, i) => pool.push({ chapterId: doc.id, chapterName: doc.chapterName, text, embedding: embeddings[i] }))
  }
  console.log(`Indexed ${pool.length} chunks across ${CORPUS.length} chapters.\n`)

  const results = []
  for (const tc of TEST_CASES) {
    process.stdout.write(`  ${tc.id} ... `)
    const [qEmbedding] = await embedTexts([tc.question])
    const ranked = pool
      .map(c => ({ ...c, score: cosineSim(qEmbedding, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K)

    const expectedChapter = CORPUS.find(c => c.id === tc.expectedChapterId)
    const retrievalPrecision = ranked.filter(c => c.chapterId === tc.expectedChapterId).length / TOP_K
    // Recall: was the needed chunk found at all? This is what actually determines
    // whether the generation step *could* produce a correct answer.
    const retrievalHit = retrievalPrecision > 0

    const answer = await generateAnswer(tc.question, ranked)
    const scores = await judge(tc.question, ranked, answer, expectedChapter?.chapterName)

    // Gate pass/fail on user-facing outcome (did retrieval find the needed info,
    // and was the answer grounded and correct) — not on retrieval purity. A
    // handful of harmless off-topic neighbor chunks shouldn't fail a test if the
    // model correctly ignored them and answered well; that's the whole point of
    // grounded generation. retrieval_relevance is still scored and reported as a
    // diagnostic signal (retrievalWarning) since low retrieval purity is worth
    // knowing about even when it doesn't break the answer.
    const numOk = v => typeof v === 'number' && v >= PASS_THRESHOLD
    const pass = retrievalHit && numOk(scores.groundedness) && numOk(scores.answer_quality)
    const retrievalWarning = !numOk(scores.retrieval_relevance)

    results.push({
      id: tc.id,
      question: tc.question,
      expectedChapterId: tc.expectedChapterId,
      retrievalPrecision,
      retrievalHit,
      retrievedChapters: [...new Set(ranked.map(c => c.chapterId))],
      answer,
      ...scores,
      retrievalWarning,
      pass,
    })
    console.log(pass ? (retrievalWarning ? 'PASS (retrieval warning)' : 'PASS') : 'FAIL')
  }

  printReport(results)
  const reportPath = saveReport(results)
  diffAgainstPrevious(reportPath, results)
}

function printReport(results) {
  console.log('\n─────────────────────────────────────────────────────────────────────')
  console.log('  ID                              Retr@4  Relev  Ground  Qual  Result')
  console.log('─────────────────────────────────────────────────────────────────────')
  for (const r of results) {
    const id = r.id.padEnd(32)
    const prec = `${Math.round(r.retrievalPrecision * 100)}%`.padStart(6)
    const rel = String(r.retrieval_relevance ?? '-').padStart(5)
    const grd = String(r.groundedness ?? '-').padStart(6)
    const qual = String(r.answer_quality ?? '-').padStart(5)
    const result = (r.pass ? 'PASS' : 'FAIL') + (r.retrievalWarning ? ' ⚠' : '')
    console.log(`  ${id}${prec}  ${rel}  ${grd}  ${qual}  ${result}`)
  }
  console.log('─────────────────────────────────────────────────────────────────────')
  const passCount = results.filter(r => r.pass).length
  const warnCount = results.filter(r => r.retrievalWarning).length
  console.log(`  ${passCount}/${results.length} passed (gate: relevant chunk retrieved + groundedness/answer_quality >= ${PASS_THRESHOLD}/10)`)
  console.log(`  ${warnCount} retrieval-relevance warning(s) — retrieved chunks included off-topic noise but didn't break the answer (relevance < ${PASS_THRESHOLD}/10, diagnostic only)\n`)
}

function saveReport(results) {
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(REPORTS_DIR, `${timestamp}.json`)
  const summary = {
    timestamp,
    passCount: results.filter(r => r.pass).length,
    total: results.length,
    avgRetrievalPrecision: results.reduce((s, r) => s + r.retrievalPrecision, 0) / results.length,
    avgGroundedness: results.reduce((s, r) => s + (r.groundedness || 0), 0) / results.length,
    results,
  }
  writeFileSync(reportPath, JSON.stringify(summary, null, 2))
  console.log(`Report written to eval/reports/${timestamp}.json`)
  return reportPath
}

function diffAgainstPrevious(currentPath, results) {
  const files = readdirSync(REPORTS_DIR).filter(f => f.endsWith('.json')).sort()
  const currentFile = path.basename(currentPath)
  const idx = files.indexOf(currentFile)
  if (idx <= 0) return // no previous report to compare against

  const prev = JSON.parse(readFileSync(path.join(REPORTS_DIR, files[idx - 1]), 'utf8'))
  const prevById = Object.fromEntries(prev.results.map(r => [r.id, r]))

  const regressions = []
  for (const r of results) {
    const before = prevById[r.id]
    if (!before) continue
    if (before.pass && !r.pass) regressions.push(`  REGRESSION  ${r.id}: was PASS, now FAIL`)
    const scoreDrop = ['retrieval_relevance', 'groundedness', 'answer_quality']
      .filter(dim => (before[dim] ?? 0) - (r[dim] ?? 0) >= 2)
    if (scoreDrop.length) regressions.push(`  SCORE DROP  ${r.id}: ${scoreDrop.map(d => `${d} ${before[d]}->${r[d]}`).join(', ')}`)
  }

  if (regressions.length) {
    console.log(`Regressions vs previous run (${files[idx - 1]}):`)
    regressions.forEach(l => console.log(l))
  } else {
    console.log(`No regressions vs previous run (${files[idx - 1]}).`)
  }
  console.log()
}

main().catch(err => {
  console.error('\nEval run failed:', err.message)
  process.exit(1)
})
