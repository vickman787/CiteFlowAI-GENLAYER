// Typed entry point into the deployed Intelligent Contract (see
// contracts/research_contract.py). This is where the "AI aspect" of the app
// actually happens: given a query and the candidate source chunks retrieval
// already narrowed down, the contract's validators decide which sources are
// genuinely relevant and synthesize the grounded answer, reconciled through
// GenLayer's consensus (equivalence principle) rather than a single trusted
// API call.
//
// Deliberately ONE contract call per research query, not one call per
// candidate source. Looping validator consensus per-source would multiply
// latency and cost by the number of sources under consideration — bad for a
// pay-per-prompt, real-time demo. The contract receives all candidate chunks
// at once and returns its citation decision in a single transaction.
//
// Waits for ACCEPTED, not FINALIZED — confirmed from the genlayer-js README:
// ACCEPTED is the point where validator consensus is already done; FINALIZED
// only lands after a longer finality window closes on top of that. Waiting
// for FINALIZED in an interactive request is what caused the timeout seen in
// testing. The same README also warns a transaction can reach either status
// with a *failed* execution, so the execution result is checked explicitly
// below rather than trusting `result.result` just because a status was hit.

import { getRelayerClient } from './relayer'
import { TransactionStatus, type CalldataEncodable } from 'genlayer-js/types'

export interface GenLayerSourceInput {
  id: string
  title: string
  content: string
}

export interface GenLayerResearchResult {
  answer: string
  citationsUsed: string[] // source IDs the contract's consensus deemed relevant
}

interface StudioResult {
  status?: string
  payload?: unknown
}

function decodeResearchResult(value: unknown): GenLayerResearchResult | undefined {
  let decoded = value

  if (decoded && typeof decoded === 'object' && 'readable' in decoded) {
    decoded = (decoded as { readable?: unknown }).readable
  }

  if (typeof decoded === 'string') {
    const rawString = decoded
    try {
      decoded = JSON.parse(rawString)
    } catch {
      // StudioNet's calldata renderer currently emits Python dictionaries as
      // almost-JSON: adjacent fields may lack a comma and arrays may retain a
      // trailing comma. Repair only those two observed serialization quirks.
      const repaired = rawString
        .replace(/"\s*"citationsUsed"\s*:/, '","citationsUsed":')
        .replace(/,\s*([}\]])/g, '$1')
      try {
        decoded = JSON.parse(repaired)
      } catch {
        return undefined
      }
    }
  }

  if (!decoded || typeof decoded !== 'object') return undefined
  const candidate = decoded as Partial<GenLayerResearchResult>
  if (typeof candidate.answer !== 'string') return undefined

  return {
    answer: candidate.answer,
    citationsUsed: Array.isArray(candidate.citationsUsed)
      ? candidate.citationsUsed.filter((id): id is string => typeof id === 'string')
      : [],
  }
}

export async function runGenLayerResearch(
  query: string,
  sources: GenLayerSourceInput[]
): Promise<GenLayerResearchResult> {
  const contractAddress = process.env.GENLAYER_CONTRACT_ADDRESS
  if (!contractAddress) throw new Error('GENLAYER_CONTRACT_ADDRESS is not set')

  const { client, account } = getRelayerClient()

  const receipt = await client.writeContract({
    account,
    address: contractAddress as `0x${string}`,
    functionName: 'research',
    args: [query, sources.map((source) => ({ ...source })) as unknown as CalldataEncodable],
    value: BigInt(0),
  })

  // studionet has been inconsistent in testing — the same call sometimes
  // reaches ACCEPTED within one wait and sometimes doesn't, even with
  // identical input. Since the transaction already exists on-chain once
  // writeContract returns (we have its hash), retrying the wait re-polls
  // the same transaction rather than resubmitting it — safe to retry, no
  // risk of double execution or double payment.
  const MAX_WAIT_ATTEMPTS = 8
  let result: Awaited<ReturnType<typeof client.waitForTransactionReceipt>> | undefined
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_WAIT_ATTEMPTS; attempt++) {
    try {
      result = await client.waitForTransactionReceipt({
        hash: receipt,
        status: TransactionStatus.ACCEPTED,
      })
      break
    } catch (err) {
      lastError = err
      console.warn(`GenLayer wait attempt ${attempt}/${MAX_WAIT_ATTEMPTS} failed for tx ${receipt}:`, err)
    }
  }

  if (!result) {
    throw lastError instanceof Error
      ? lastError
      : new Error(`GenLayer transaction ${receipt} never reached ACCEPTED after ${MAX_WAIT_ATTEMPTS} attempts.`)
  }

  // Per genlayer-js docs: reaching ACCEPTED/FINALIZED doesn't guarantee the
  // execution itself succeeded — check before trusting the returned value.
  const executionResult = (result as any)?.txExecutionResultName
    ?? (result as any)?.txExecutionResult
    ?? (result as any)?.executionResult
  if (executionResult && executionResult !== 'FINISHED_WITH_RETURN' && executionResult !== 'FINISHED') {
    throw new Error(`GenLayer contract execution did not finish successfully: ${executionResult} (tx ${receipt})`)
  }

  const transactionData = (result as any)?.data
  const consensusData = (result as any)?.consensus_data
    ?? (result as any)?.consensusData
    ?? transactionData?.consensus_data
    ?? transactionData?.consensusData
  const leaderReceiptValue = consensusData?.leader_receipt ?? consensusData?.leaderReceipt
  const leaderReceipts = Array.isArray(leaderReceiptValue)
    ? leaderReceiptValue
    : leaderReceiptValue ? [leaderReceiptValue] : []

  for (const leaderReceipt of leaderReceipts) {
    const studioResult = leaderReceipt?.result as StudioResult | undefined
    if (studioResult?.status && studioResult.status !== 'return') {
      const message = typeof studioResult.payload === 'string'
        ? studioResult.payload
        : JSON.stringify(studioResult.payload)
      throw new Error(`GenLayer contract failed: ${message || studioResult.status} (tx ${receipt})`)
    }

    const decoded = decodeResearchResult(studioResult?.payload)
    if (decoded) return decoded
  }

  // Keep support for SDK/network variants that expose the value at top level.
  const topLevel = decodeResearchResult((result as any)?.result)
  if (!topLevel) {
    console.error('GenLayer raw receipt (unexpected shape):', JSON.stringify(result, null, 2))
    throw new Error(
      `GenLayer contract returned an unexpected result shape for tx ${receipt}. Raw receipt logged to the server console.`
    )
  }
  return topLevel
}
