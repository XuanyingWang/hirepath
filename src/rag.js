// ── RAG (Retrieval-Augmented Generation) ──────────────────────────────────────
// Uses Voyage AI for embeddings + Supabase pgvector for similarity search.
// Falls back gracefully if voyageKey or Supabase auth is not configured.

import { supabase, supabaseConfigured } from './supabase.js'
import { getUser } from './auth.js'
import { state } from './state.js'
import { isTauri } from './platform.js'

const _VOYAGE_BASE = isTauri ? 'https://api.voyageai.com' : '/api/voyage'

// Split text into overlapping chunks so context is not cut mid-sentence
function _chunkText(text, size = 400, overlap = 50) {
  const chunks = []
  for (let i = 0; i < text.length; i += size - overlap)
    chunks.push(text.slice(i, i + size))
  return chunks
}

async function _embedTexts(texts) {
  const resp = await fetch(`${_VOYAGE_BASE}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.voyageKey}`,
    },
    body: JSON.stringify({ model: 'voyage-3-lite', input: texts }),
  })
  if (!resp.ok) throw new Error(`Voyage AI ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  return data.data.map(d => d.embedding)
}

/**
 * Index a chapter's content into Supabase pgvector.
 * Called after a chapter is saved/regenerated. Runs in the background (not awaited).
 */
export async function indexChapter(chapterId, content) {
  if (!supabaseConfigured || !getUser() || !state.voyageKey || !content) return
  try {
    const chunks = _chunkText(content)
    const embeddings = await _embedTexts(chunks)
    const rows = chunks.map((text, i) => ({
      user_id:     getUser().id,
      chapter_id:  chapterId,
      chunk_index: i,
      content:     text,
      embedding:   embeddings[i],
    }))
    const { error } = await supabase.from('document_chunks').upsert(rows, {
      onConflict: 'user_id,chapter_id,chunk_index',
    })
    if (error) console.error('[RAG] index error:', error.message)
  } catch (e) {
    console.error('[RAG] indexChapter failed:', e?.message || e)
  }
}

/**
 * Retrieve the top-K most relevant chunks for a query.
 * Returns a formatted context string to inject into the system prompt,
 * or an empty string if RAG is not configured or no results found.
 */
export async function retrieveContext(question, k = 4) {
  if (!supabaseConfigured || !getUser() || !state.voyageKey || !question) return ''
  try {
    const [qEmbedding] = await _embedTexts([question])
    const { data, error } = await supabase.rpc('match_chunks', {
      query_embedding: qEmbedding,
      match_user_id:   getUser().id,
      match_count:     k,
    })
    if (error) { console.error('[RAG] retrieve error:', error.message); return '' }
    if (!data?.length) return ''
    return data.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
  } catch (e) {
    console.error('[RAG] retrieveContext failed:', e?.message || e)
    return ''
  }
}
