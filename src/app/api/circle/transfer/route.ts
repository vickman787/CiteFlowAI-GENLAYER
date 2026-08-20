import { NextRequest, NextResponse } from 'next/server'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userToken, amount, destinationAddress } = body

    if (!process.env.CIRCLE_API_KEY) {
      return NextResponse.json({ error: 'Missing CIRCLE_API_KEY' }, { status: 500 })
    }

    const circleClient = initiateUserControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
    })

    const idempotencyKey = crypto.randomUUID()

    const walletsRes = await circleClient.listWallets({ userToken })
    const userWallet = walletsRes.data?.wallets?.[0]

    if (!userWallet) {
      return NextResponse.json({ error: 'No wallets found for user' }, { status: 400 })
    }

    const actualWalletId = userWallet.id

    const tokenBalanceRes = await circleClient.getWalletTokenBalance({
      userToken,
      walletId: actualWalletId
    })

    const usdcToken = tokenBalanceRes.data?.tokenBalances?.find(t => t.token?.symbol === 'USDC')
    const nativeToken = tokenBalanceRes.data?.tokenBalances?.find(t => t.token?.isNative)

    const targetTokenId = usdcToken?.token?.id || nativeToken?.token?.id

    if (!targetTokenId) {
      return NextResponse.json({ error: 'No tokens available to transfer. Please fund the wallet via Faucet.' }, { status: 400 })
    }

    const res = await circleClient.createTransaction({
      userToken,
      walletId: actualWalletId,
      tokenId: targetTokenId,
      destinationAddress,
      amounts: [amount],
      fee: {
        type: "level",
        config: {
          feeLevel: "MEDIUM"
        }
      },
      idempotencyKey
    })

    return NextResponse.json({
      challengeId: res.data?.challengeId
    })

  } catch (error: any) {
    console.error('Circle Transfer Error:', error?.response?.data || error)
    return NextResponse.json({ error: 'Failed to initialize transfer challenge' }, { status: 500 })
  }
}
