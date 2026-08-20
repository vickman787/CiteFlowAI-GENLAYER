import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import crypto from 'crypto'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  try {
    const { sourceId } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('sources')
      .select('price_usdc, creator_id, creator_profiles(user_id, profiles(wallet_address))')
      .eq('id', sourceId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    }

    const source = data as any;
    const walletAddress = source.creator_profiles?.profiles?.wallet_address

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Creator has not configured a wallet address' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        message: 'Payment Required',
        amount: source.price_usdc,
        currency: 'USDC',
        recipient: walletAddress,
        network: 'arc-testnet',
        paymentEndpoint: `/api/sources/${sourceId}/license`
      },
      { status: 402 }
    )
  } catch (error: any) {
    console.error('License GET Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  try {
    const { sourceId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()

    const { authorizationId, amount } = body

    if (!authorizationId || typeof amount !== 'number' || !Number.isFinite(amount)) {
      return NextResponse.json({ error: 'Missing payment authorization payload' }, { status: 400 })
    }

    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('price_usdc, creator_profiles(profiles(wallet_address))')
      .eq('id', sourceId)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    }

    if (amount < parseFloat(source.price_usdc)) {
      return NextResponse.json({ error: 'Insufficient payment amount' }, { status: 400 })
    }

    const recipientWallet = (source as any).creator_profiles?.profiles?.wallet_address
    if (!recipientWallet) {
      return NextResponse.json({ error: 'Creator wallet not found' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: paymentAuth, error: authError } = await admin
      .from('payment_authorizations')
      .select('id, status, source_id, amount_usdc, recipient_address, research_sessions!inner(user_id)')
      .eq('authorization_id', authorizationId)
      .single()

    const sessionOwner = (paymentAuth as any)?.research_sessions?.user_id
    if (authError || !paymentAuth || sessionOwner !== user.id || paymentAuth.source_id !== sourceId || paymentAuth.recipient_address?.toLowerCase() !== recipientWallet.toLowerCase() || parseFloat(paymentAuth.amount_usdc) !== parseFloat(source.price_usdc) || amount !== parseFloat(paymentAuth.amount_usdc)) {
      return NextResponse.json({ error: 'Invalid or unknown payment authorization' }, { status: 400 })
    }

    if (paymentAuth.status === 'settled') {
      const { data: existing } = await admin.from('payment_settlements').select('gateway_settlement_id').eq('authorization_id', authorizationId).single()
      return existing ? NextResponse.json({ success: true, receipt: { gatewaySettlementId: existing.gateway_settlement_id } }) : NextResponse.json({ error: 'Payment settlement is incomplete' }, { status: 409 })
    }
    const { data: claimed } = await admin.from('payment_authorizations').update({ status: 'processing' }).eq('authorization_id', authorizationId).eq('status', 'pending').select('authorization_id').single()
    if (!claimed) return NextResponse.json({ error: 'Payment authorization is already being settled' }, { status: 409 })

    let gatewaySettlementId: string
    try {
      const { executeGatewayTransfer } = await import('@/lib/payments/circle-api')

      const platformFeePercent = 0.20
      const price = parseFloat(source.price_usdc)
      const creatorPayout = (price * (1 - platformFeePercent)).toFixed(6)

      gatewaySettlementId = await executeGatewayTransfer(recipientWallet, creatorPayout)
    } catch (apiError: any) {
      console.error('Circle API Execution Failed:', apiError)
      await admin.from('payment_authorizations').update({ status: 'pending' }).eq('authorization_id', authorizationId).eq('status', 'processing')
      return NextResponse.json({ error: apiError.message || 'Payment execution failed at Gateway' }, { status: 500 })
    }

    const { error: settlementError } = await admin
      .from('payment_settlements')
      .insert({
        authorization_id: authorizationId,
        gateway_settlement_id: gatewaySettlementId,
        status: 'settled'
      })

    if (settlementError) {
      await admin.from('payment_authorizations').update({ status: 'pending' }).eq('authorization_id', authorizationId).eq('status', 'processing')
      return NextResponse.json({ error: 'Payment already settled or failed to record settlement' }, { status: 400 })
    }

    await admin
      .from('payment_authorizations')
      .update({ status: 'settled' })
      .eq('authorization_id', authorizationId)

    const receiptPayload = `${sourceId}:${authorizationId}:${Date.now()}`
    const signingSecret = process.env.RECEIPT_SIGNING_SECRET
    if (!signingSecret) throw new Error('RECEIPT_SIGNING_SECRET is not configured')
    const receiptSignature = crypto.createHmac('sha256', signingSecret)
      .update(receiptPayload)
      .digest('hex')

    return NextResponse.json({
      success: true,
      receipt: {
        payload: receiptPayload,
        signature: receiptSignature,
        gatewaySettlementId
      }
    })

  } catch (error: any) {
    console.error('License POST Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
