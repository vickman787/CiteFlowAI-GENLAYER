import { createAdminClient } from '@/utils/supabase/admin'
import { authorizePayment } from '../payments/treasury'
import { executeGatewayTransfer } from '../payments/circle-api'
import { embedQuery, cosineSimilarity, parseVector } from './embeddings'
import { runGenLayerResearch, type GenLayerSourceInput } from '../genlayer/contract'

// Per-source context budget handed to the GenLayer contract (in ~1000-char chunks).
// Chunks are ranked by embedding similarity to the query; chunks without
// embeddings (older sources) fall back to document order.
//
// Kept small (was 8) after seeing GenVM validators return an empty LLM
// response — gl.nondet.exec_prompt() came back as "" rather than an answer,
// which json.loads() then threw on inside the contract. The validator
// config logs a 7s first-token timeout; a large, noisy prompt (naive HTML
// extraction pulls in a lot of navigation chrome alongside real content) is
// a plausible way to blow past that on a shared/loaded testnet.
const TOP_CHUNKS_PER_SOURCE = 2

// How many candidate sources (by top-chunk similarity) get sent into the
// single GenLayer contract call. Keeping this bounded matters: every source
// included adds prompt size to a call that goes through multi-validator
// consensus, not a plain API request.
const MAX_CANDIDATE_SOURCES = 2

function selectRelevantChunks(
  chunks: { chunk_text: string, embedding: string | number[] | null }[],
  queryEmbedding: number[] | null
): { text: string, bestScore: number } {
  if (!queryEmbedding) {
    const ranked = chunks.slice(0, TOP_CHUNKS_PER_SOURCE)
    return { text: ranked.map(c => c.chunk_text).join('\n[...]\n'), bestScore: 0 }
  }

  const scored = chunks.map((c, i) => {
    const v = parseVector(c.embedding)
    return { i, score: v ? cosineSimilarity(queryEmbedding, v) : -1 }
  })
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, TOP_CHUNKS_PER_SOURCE)
  const ranked = top.sort((a, b) => a.i - b.i).map(s => chunks[s.i])
  const bestScore = top.length > 0 ? top[0].score : -1

  return { text: ranked.map(c => c.chunk_text).join('\n[...]\n'), bestScore }
}

export async function runResearchAgent(
  sessionId: string,
  query: string,
  initialBudget: number,
  walletAddress: string | undefined,
  onProgress?: (msg: string) => void,
  cookieHeader?: string
) {
  let totalSpentOnSources = 0;
  const platformFee = 0.20; // platform revenue per prompt

  try {
    const supabase = createAdminClient()

    if (onProgress) onProgress('Connecting to Treasury and querying registered sources...')

    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('id, url, title, price_usdc, creator_profiles(profiles(wallet_address)), source_chunks(chunk_text, embedding)')
      .eq('status', 'extracted')

    if (sourcesError || !sources) throw new Error('Failed to fetch sources')

    let queryEmbedding: number[] | null = null
    try {
      queryEmbedding = await embedQuery(query)
    } catch (e: any) {
      console.warn('Query embedding failed, falling back to document-order retrieval:', e.message)
      if (onProgress) onProgress('Vector index unavailable. Falling back to sequential scan...')
    }

    // 1. Retrieval — deterministic, off-chain, no LLM call. Narrows the full
    // source set down to a small number of candidates worth sending into the
    // GenLayer contract at all.
    if (onProgress) onProgress(`Found ${sources.length} registered sources. Ranking by relevance...`)

    const candidates = sources
      .filter(s => parseFloat(s.price_usdc) <= initialBudget)
      .map(source => {
        const { text, bestScore } = selectRelevantChunks(source.source_chunks, queryEmbedding)
        const creatorProfiles = source.creator_profiles as { profiles?: { wallet_address?: string } } | null
        return { id: source.id, title: source.title, url: source.url, price_usdc: source.price_usdc, recipientAddress: creatorProfiles?.profiles?.wallet_address, content: text, bestScore }
      })
      .filter(c => c.content.length > 0)
      .sort((a, b) => b.bestScore - a.bestScore)
      .slice(0, MAX_CANDIDATE_SOURCES)

    if (candidates.length === 0) {
      if (onProgress) onProgress('No registered sources matched this query closely enough.')
    }

    // 2. Generation + citation decision — the one non-deterministic step,
    // reconciled through GenLayer validator consensus instead of a single
    // trusted API call.
    if (onProgress) onProgress(`Submitting ${candidates.length} candidate source(s) to the GenLayer contract for grounded synthesis...`)

    const genlayerInputs: GenLayerSourceInput[] = candidates.map(c => ({
      id: c.id,
      title: c.title,
      content: c.content,
    }))

    const genlayerResult = await runGenLayerResearch(query, genlayerInputs)

    if (onProgress) onProgress(`GenLayer consensus reached. ${genlayerResult.citationsUsed.length} source(s) cited.`)

    // 3. Execute Payments ONLY for citations GenLayer's consensus actually used
    const purchasedSources: any[] = []
    if (onProgress) onProgress(`Executing payments for ${genlayerResult.citationsUsed.length} citation(s)...`)

    for (const usedId of genlayerResult.citationsUsed) {
      const source = candidates.find(s => s.id === usedId)
      if (!source) continue

      try {
        if (!source.recipientAddress) throw new Error('Source creator has no wallet address')
        const { payload } = await authorizePayment(sessionId, source.id, parseFloat(source.price_usdc), source.recipientAddress)

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const licenseRes = await fetch(`${baseUrl}/api/sources/${source.id}/license`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
          },
          body: JSON.stringify(payload)
        })

        const licenseText = await licenseRes.text()
        let licenseData: any
        try {
          licenseData = JSON.parse(licenseText)
        } catch {
          licenseData = { error: licenseText.slice(0, 500) }
        }
        if (!licenseRes.ok) throw new Error(licenseData.error || `License settlement failed (${licenseRes.status})`)

        purchasedSources.push({
          id: source.id,
          title: source.title,
          url: source.url,
          content: source.content,
          receipt: licenseData.receipt
        })
        const price = parseFloat(source.price_usdc);
        totalSpentOnSources += price;
        if (onProgress) onProgress(`Payment Settled. Gateway Batch ID: ${licenseData.receipt.gatewaySettlementId}`)
      } catch (e: any) {
        console.error(`Failed to purchase source ${source.id}:`, e.message)
        if (onProgress) onProgress(`Payment execution failed for ${source.title}.`)
        if (parseFloat(source.price_usdc) > 0) {
          throw new Error(`Required source payment failed for ${source.title}: ${e.message}`)
        }
      }
    }

    const purchasedIds = new Set(purchasedSources.map(source => source.id))
    for (const candidate of candidates) {
      const wasCited = genlayerResult.citationsUsed.includes(candidate.id)
      const wasPurchased = purchasedIds.has(candidate.id)
      await supabase.from('citation_decisions').insert({
        session_id: sessionId,
        source_id: candidate.id,
        contribution_score: Math.max(0, Math.min(1, candidate.bestScore)),
        accepted: wasPurchased,
        reasoning: wasPurchased
          ? 'Cited by GenLayer consensus and payment settled'
          : wasCited
            ? 'Selected by GenLayer consensus but payment did not settle'
            : 'Not cited in final GenLayer answer',
      })
    }

    // --- Backend Refund Mechanism ---
    if (walletAddress) {
      const actualPlatformFee = totalSpentOnSources * platformFee;
      const unspentBudget = initialBudget - totalSpentOnSources - actualPlatformFee;

      if (unspentBudget >= 0.05) {
        if (onProgress) onProgress(`Calculating budget... Unspent budget is $${unspentBudget.toFixed(2)}. Initiating refund...`)
        try {
          await executeGatewayTransfer(walletAddress, unspentBudget.toFixed(2));
          if (onProgress) onProgress(`Refunded $${unspentBudget.toFixed(2)} to your wallet.`)
        } catch (err: any) {
          console.error("Refund failed:", err);
          if (onProgress) onProgress(`Warning: Refund transfer failed (${err.message})`)
        }
      } else {
        if (onProgress) onProgress(`Unspent budget is $${unspentBudget.toFixed(2)} (below $0.05 minimum threshold). Retained by Treasury.`)
      }
    }

    return {
      answer: genlayerResult.answer,
      citationsUsed: purchasedSources.filter(s => genlayerResult.citationsUsed.includes(s.id)),
      purchasedSources
    }

  } catch (err: any) {
    if (walletAddress) {
      const chargedPlatformFee = totalSpentOnSources * platformFee
      const refundableAmount = Math.max(0, initialBudget - totalSpentOnSources - chargedPlatformFee)
      if (onProgress) onProgress(`Research execution failed. Initiating refund of $${refundableAmount.toFixed(2)}...`)
      try {
        if (refundableAmount >= 0.05) {
          await executeGatewayTransfer(walletAddress, refundableAmount.toFixed(2));
          if (onProgress) onProgress(`Refunded $${refundableAmount.toFixed(2)} to your wallet.`)
        }
      } catch (refundErr: any) {
        console.error("Crash Refund failed:", refundErr);
      }
    }
    throw err;
  }
}
