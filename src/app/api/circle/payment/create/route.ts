import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets';
import { NextResponse } from 'next/server';

const circleUserSdk = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY as string,
});

export async function POST(req: Request) {
  try {
    const { userToken, walletAddress, amount } = await req.json();

    if (!userToken || !walletAddress || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const walletsRes = await circleUserSdk.listWallets({ userToken });
    const wallet = walletsRes.data?.wallets?.find(w => w.address.toLowerCase() === walletAddress.toLowerCase());

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found for this user' }, { status: 404 });
    }

    const walletId = wallet.id;

    const balanceRes = await circleUserSdk.getWalletTokenBalance({
      walletId,
      userToken,
    });

    const tokens = balanceRes.data?.tokenBalances || [];
    const usdcToken = tokens.length > 0 ? tokens[0].token : null;

    if (!usdcToken) {
      return NextResponse.json({ error: 'Wallet has no tokens to pay with' }, { status: 400 });
    }

    const treasuryAddress = process.env.AGENT_TREASURY_ADDRESS;

    if (!treasuryAddress) {
      throw new Error("AGENT_TREASURY_ADDRESS is not configured");
    }

    const txRes = await circleUserSdk.createTransaction({
      userToken,
      walletId,
      amounts: [amount.toString()],
      destinationAddress: treasuryAddress,
      tokenId: usdcToken.id,
      fee: {
        type: 'level',
        config: {
          feeLevel: 'MEDIUM'
        }
      }
    });

    if (!txRes.data?.challengeId) {
      return NextResponse.json({ error: 'Failed to generate challenge' }, { status: 500 });
    }

    return NextResponse.json({ challengeId: txRes.data.challengeId });
  } catch (error: any) {
    console.error('Payment Create Error:', error.response?.data || error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
