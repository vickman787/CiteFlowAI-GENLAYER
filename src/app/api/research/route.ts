import { NextRequest, NextResponse } from 'next/server'
import { runResearchAgent } from '@/lib/ai/research-agent'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'
import { z } from 'zod'

const researchRequestSchema = z.object({
  query: z.string().min(5),
  maxBudget: z.number().min(0).max(100),
  challengeId: z.string().min(1),
  userToken: z.string().min(1)
})

const DEAD_TX_STATES = ['FAILED', 'DENIED', 'CANCELLED']

// Verify with Circle that the upfront budget transfer actually happened before
// any GenLayer/retrieval work runs.
async function verifyFundingPayment(userToken: string, challengeId: string, maxBudget: number) {
  if (!process.env.CIRCLE_API_KEY) throw new Error('CIRCLE_API_KEY is not configured')
  const treasuryAddress = process.env.AGENT_TREASURY_ADDRESS
  if (!treasuryAddress) throw new Error('AGENT_TREASURY_ADDRESS is not configured')

  const circleClient = initiateUserControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
  })

  const challengeRes = await circleClient.getUserChallenge({ userToken, challengeId })
  const challenge = challengeRes.data?.challenge

  if (!challenge || challenge.status !== 'COMPLETE') {
    throw new Error('Payment challenge has not been completed')
  }

  const transactionId = challenge.correlationIds?.[0]
  if (!transactionId) {
    throw new Error('Payment challenge has no associated transaction')
  }

  const txRes = await circleClient.getTransaction({ userToken, id: transactionId })
  const tx = txRes.data?.transaction

  if (!tx) throw new Error('Funding transaction not found')

  if (DEAD_TX_STATES.includes(tx.state)) {
    throw new Error(`Funding transaction is in state ${tx.state}`)
  }

  if (!tx.destinationAddress || tx.destinationAddress.toLowerCase() !== treasuryAddress.toLowerCase()) {
    throw new Error('Funding transaction was not sent to the agent treasury')
  }

  const paidAmount = (tx.amounts || []).reduce((acc, a) => acc + parseFloat(a), 0)
  if (paidAmount < maxBudget) {
    throw new Error(`Funding transaction amount ($${paidAmount}) does not cover the requested budget ($${maxBudget})`)
  }

  return { transactionId, payerAddress: tx.sourceAddress?.toLowerCase() }
}

export async function POST(request: NextRequest) {
  try {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please connect your wallet first.' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = researchRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 })
    }

    const { query, maxBudget, challengeId, userToken } = parsed.data

    let funding
    try {
      funding = await verifyFundingPayment(userToken, challengeId, maxBudget)
    } catch (verifyError: any) {
      console.error('Funding verification failed:', verifyError?.response?.data || verifyError)
      return NextResponse.json({ error: `Payment verification failed: ${verifyError.message}` }, { status: 402 })
    }

    const supabase = createAdminClient()

    let refundAddress = funding.payerAddress
    if (!refundAddress) {
      const { data: profile } = await userClient
        .from('profiles')
        .select('wallet_address')
        .eq('id', user.id)
        .single()
      refundAddress = profile?.wallet_address || undefined
    }

    const { data: sessionId, error: sessionError } = await supabase.rpc('create_funded_research_session', {
      p_user_id: user.id,
      p_query: query,
      p_budget: maxBudget,
      p_transaction_id: funding.transactionId,
      p_amount: maxBudget,
    })

    if (sessionError || !sessionId) {
      if (sessionError?.code === '23505') return NextResponse.json({ error: 'This payment has already been used to fund a research session' }, { status: 409 })
      console.error("Session creation error:", sessionError)
      return NextResponse.json({ error: 'Failed to create research session', details: sessionError?.message || "Unknown DB Error" }, { status: 500 })
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        const pushUpdate = (type: string, payload: any) => {
          controller.enqueue(encoder.encode(JSON.stringify({ type, payload }) + '\n'))
        }

        try {
          const result = await runResearchAgent(
            sessionId,
            query,
            maxBudget,
            refundAddress,
            (msg) => pushUpdate('progress', msg),
            request.headers.get('cookie') || undefined
          )

          await supabase
            .from('research_sessions')
            .update({ status: 'completed', result: result })
            .eq('id', sessionId)

          pushUpdate('done', { result, sessionId })
          controller.close()
        } catch (error: any) {
          await supabase.from('research_sessions').update({ status: 'failed', result: { error: error.message } }).eq('id', sessionId)
          pushUpdate('error', error.message)
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    })
  } catch (error: any) {
    console.error('Research API Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
