import { NextRequest, NextResponse } from 'next/server'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userToken } = body

    if (!userToken) {
      return NextResponse.json({ error: 'Missing userToken' }, { status: 400 })
    }

    if (!process.env.CIRCLE_API_KEY) {
      return NextResponse.json({ error: 'Missing CIRCLE_API_KEY' }, { status: 500 })
    }

    const circleClient = initiateUserControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
    })

    const walletsRes = await circleClient.listWallets({ userToken })
    const userWallet = walletsRes.data?.wallets?.[0]

    if (!userWallet || !userWallet.address) {
      return NextResponse.json({ error: 'No wallet found for this userToken' }, { status: 400 })
    }

    const walletAddress = userWallet.address.toLowerCase()

    const supabase = await createClient()
    const email = `${walletAddress}@citeflow-genlayer.local`

    const password = crypto.createHash('sha256').update(walletAddress + process.env.CIRCLE_API_KEY).digest('hex')

    let userId = null;

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (signUpError) {
        console.error('Invisible Supabase SignUp Error:', signUpError)
        return NextResponse.json({ error: 'Failed to create internal user session' }, { status: 500 })
      }
      userId = signUpData.user?.id;
    } else {
      userId = signInData.user?.id;
    }

    if (userId) {
      await new Promise(resolve => setTimeout(resolve, 500));

      const adminAuth = createAdminClient();

      const { error: profileError } = await adminAuth
        .from('profiles')
        .update({ wallet_address: walletAddress })
        .eq('id', userId);

      if (profileError) console.error('Admin Profile Update Error:', profileError);

      await adminAuth
        .from('creator_profiles')
        .insert({ user_id: userId })
        .select()
        .single();
    }

    return NextResponse.json({
      success: true,
      walletAddress
    })

  } catch (error: any) {
    // Circle codes 155103/155104/155105: userToken not found / expired / invalid.
    // This is expected when a stale localStorage session gets auto-retried on
    // page load — not a server fault, so don't log it as one or return 500.
    const circleCode = error?.code || error?.response?.data?.code
    if ([155103, 155104, 155105].includes(circleCode)) {
      return NextResponse.json({ error: 'Wallet session expired', code: 'TOKEN_EXPIRED' }, { status: 401 })
    }
    console.error('Wallet Login Error:', error?.response?.data || error)
    return NextResponse.json({ error: 'Failed to execute wallet login' }, { status: 500 })
  }
}
