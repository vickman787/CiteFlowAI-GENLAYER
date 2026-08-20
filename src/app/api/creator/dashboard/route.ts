import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const CREATOR_SHARE = 0.8

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('wallet_address, creator_profiles(id)')
      .eq('id', user.id)
      .single()

    const creatorProfile = (profile as any)?.creator_profiles
    const creatorId = Array.isArray(creatorProfile) ? creatorProfile[0]?.id : creatorProfile?.id

    if (profileError || !creatorId) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
    }

    // Payment rows are intentionally not visible through the user's RLS scope:
    // they belong to research sessions funded by other users. Use the admin
    // client only after authenticating the session and resolving this creator's
    // profile, then constrain every query by that creator's source IDs.
    const admin = createAdminClient()

    const { data: sources, error: sourcesError } = await admin
      .from('sources')
      .select('id, title, url, price_usdc, status, created_at, updated_at')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })

    if (sourcesError) throw sourcesError

    const sourceIds = (sources || []).map((source) => source.id)
    let authorizations: any[] = []

    if (sourceIds.length > 0) {
      const { data, error: authorizationsError } = await admin
        .from('payment_authorizations')
        .select('authorization_id, source_id, amount_usdc, status, created_at, payment_settlements(gateway_settlement_id, status, created_at)')
        .in('source_id', sourceIds)
        .eq('status', 'settled')
        .order('created_at', { ascending: false })

      if (authorizationsError) throw authorizationsError
      authorizations = data || []
    }

    const grossEarnings = authorizations.reduce((total, authorization) => {
      const settled = Array.isArray(authorization.payment_settlements)
        ? authorization.payment_settlements.some((settlement: any) => settlement.status === 'settled')
        : authorization.payment_settlements?.status === 'settled'
      return settled ? total + Number(authorization.amount_usdc) : total
    }, 0)

    return NextResponse.json({
      walletAddress: profile.wallet_address,
      sources: sources || [],
      earnings: authorizations.map((authorization) => ({
        ...authorization,
        creatorAmount: Number(authorization.amount_usdc) * CREATOR_SHARE,
        payment_settlements: undefined,
      })),
      stats: {
        sourceCount: sources?.length || 0,
        settledCitations: authorizations.length,
        grossEarnings,
        creatorEarnings: grossEarnings * CREATOR_SHARE,
      },
    })
  } catch (error) {
    console.error('Creator Dashboard API Error:', error)
    return NextResponse.json({ error: 'Failed to load creator dashboard' }, { status: 500 })
  }
}
