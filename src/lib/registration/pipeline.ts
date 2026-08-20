import { URL } from 'url'
import { createClient } from '@/utils/supabase/server'
import { embedDocuments, serializeVector } from '@/lib/ai/embeddings'
import { safeFetch } from '@/lib/net/safe-fetch'
import crypto from 'crypto'

// No ownership verification gate in this demo app — any wallet-authenticated
// user can register any public URL under their own creator profile. The main
// CiteFlowAI app enforces domain/X/Medium/Substack/Arc House ownership proof
// before registration; this app deliberately skips that so a source can be
// registered and cited in a single demo take.

function extractMetadata(html: string) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled'

  const readableText = html
    .replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '')
    .replace(/<style[^>]*>([\S\s]*?)<\/style>/gmi, '')
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return { title, readableText }
}

export async function registerArticle(targetUrl: string, creatorId: string, price: number = 0.00) {
  const supabase = await createClient()

  try {
    const normalizedUrl = new URL(targetUrl).toString()

    let title = 'Untitled'
    let readableText = ''

    const response = await safeFetch(normalizedUrl).catch(() => null)

    if (!response || !response.ok) {
      // Fallback to Jina AI Reader API (bypasses Cloudflare & anti-bot)
      const jinaResponse = await fetch(`https://r.jina.ai/${normalizedUrl}`)
      if (!jinaResponse.ok) {
        throw new Error(`Failed to fetch article (even with Jina AI fallback): ${jinaResponse.statusText}`)
      }
      readableText = await jinaResponse.text()

      title = jinaResponse.headers.get('x-title') || jinaResponse.headers.get('X-Title') || 'Untitled'

      if (title === 'Untitled') {
        const lines = readableText.split('\n')
        const firstLine = lines[0]?.trim() || ''
        if (firstLine.startsWith('Title:')) {
          title = firstLine.replace('Title:', '').trim()
        } else if (firstLine.startsWith('#')) {
          title = firstLine.replace(/^#+\s*/, '').trim()
        }
      }
    } else {
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('text/html')) {
        throw new Error('Invalid content type. Expected text/html.')
      }
      const html = await response.text()
      const extracted = extractMetadata(html)
      title = extracted.title
      readableText = extracted.readableText
    }

    const contentHash = crypto.createHash('sha256').update(readableText).digest('hex')

    const { data: existing } = await supabase
      .from('sources')
      .select('id, creator_id, status')
      .eq('url', normalizedUrl)
      .single()

    let sourceId: string;

    if (existing) {
      if (existing.creator_id !== creatorId) {
        throw new Error('This article is already registered by another creator.')
      }
      if (existing.status !== 'deleted') {
        throw new Error('Article already registered (Duplicate)')
      }

      const { data: updated, error } = await supabase
        .from('sources')
        .update({
          status: 'extracted',
          title,
          content_hash: contentHash,
          price_usdc: price
        })
        .eq('id', existing.id)
        .select('id')
        .single()

      if (error) throw error
      sourceId = updated.id

      const { error: deleteError } = await supabase.from('source_chunks').delete().eq('source_id', sourceId)
      if (deleteError) throw deleteError
    } else {
      const { data: inserted, error } = await supabase
        .from('sources')
        .insert({
          url: normalizedUrl,
          title,
          content_hash: contentHash,
          price_usdc: price,
          creator_id: creatorId,
          status: 'extracted'
        })
        .select('id')
        .single()

      if (error) {
        if (error.code === '23505') {
          throw new Error('Article already registered (Duplicate)')
        }
        throw error
      }
      sourceId = inserted.id
    }

    // Chunking (naive for now)
    const chunks = readableText.match(/.{1,1000}/g) || []

    let embeddings: number[][] | null = null
    if (chunks.length > 0) {
      try {
        embeddings = await embedDocuments(chunks)
      } catch (embedError: any) {
        console.warn(`Embedding failed for ${normalizedUrl}, storing chunks without vectors:`, embedError.message)
      }
    }

    if (chunks.length > 0) {
      const chunkInserts = chunks.map((chunk, i) => ({
        source_id: sourceId,
        chunk_text: chunk,
        ...(embeddings ? { embedding: serializeVector(embeddings[i]) } : {})
      }))

      const { error: chunkInsertError } = await supabase.from('source_chunks').insert(chunkInserts)
      if (chunkInsertError) throw chunkInsertError
    }

    return { success: true, sourceId }

  } catch (error: any) {
    console.error('Registration error:', error.message)
    return { success: false, error: error.message }
  }
}
