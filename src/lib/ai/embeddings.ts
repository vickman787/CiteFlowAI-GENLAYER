// Text embeddings via Gemini gemini-embedding-001.
// Dimensionality is pinned to 1536 to match the source_chunks.embedding vector(1536) column.
// Gemini only L2-normalizes 3072-dim outputs, so we normalize ourselves and use
// dot product as cosine similarity.
//
// This is retrieval only — picking which chunks are relevant enough to hand to
// the GenLayer contract. The actual answer generation happens on GenLayer,
// not here. See lib/genlayer/.

const EMBED_MODEL = 'gemini-embedding-001'
const EMBED_DIM = 1536

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0))
  if (norm === 0) return v
  return v.map(x => x / norm)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

export async function embedQuery(text: string): Promise<number[]> {
  return embedSingle(text, 'RETRIEVAL_QUERY')
}

async function embedSingle(text: string, taskType: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBED_DIM,
        taskType
      })
    }
  )

  const data = await response.json()
  if (!response.ok) {
    throw new Error(`Gemini Embedding API Error: ${data.error?.message || 'Unknown'}`)
  }

  return normalize(data.embedding.values)
}

// Batch-embed document chunks. Gemini's batchEmbedContents accepts up to 100 requests per call.
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const results: number[][] = []
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: batch.map(text => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: EMBED_DIM,
            taskType: 'RETRIEVAL_DOCUMENT'
          }))
        })
      }
    )

    const data = await response.json()
    if (!response.ok) {
      throw new Error(`Gemini Batch Embedding API Error: ${data.error?.message || 'Unknown'}`)
    }

    for (const emb of data.embeddings) {
      results.push(normalize(emb.values))
    }
  }

  return results
}

// pgvector columns round-trip through PostgREST as "[0.1,0.2,...]" strings
export function parseVector(value: string | number[] | null): number[] | null {
  if (!value) return null
  if (Array.isArray(value)) return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function serializeVector(v: number[]): string {
  return `[${v.join(',')}]`
}
