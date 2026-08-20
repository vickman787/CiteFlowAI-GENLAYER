import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const circleUserSdk = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY as string,
});

export async function POST(req: Request) {
  const { userToken } = await req.json();

  if (!userToken) {
    return NextResponse.json({ error: 'User Token is required' }, { status: 400 });
  }

  try {
    const response = await circleUserSdk.createUserPinWithWallets({
      userToken: userToken,
      blockchains: ['ARC-TESTNET'],
      accountType: 'EOA',
      idempotencyKey: crypto.randomUUID()
    });

    return NextResponse.json(response.data);

  } catch (error: any) {
    const errorCode = error?.response?.data?.code || error?.code;
    const errorStatus = error?.response?.status || error?.status;

    if (errorCode === 155106 || errorStatus === 409) {
      try {
        const walletsRes = await circleUserSdk.listWallets({ userToken });
        if (walletsRes.data?.wallets && walletsRes.data.wallets.length > 0) {
          return NextResponse.json({
            address: walletsRes.data.wallets[0].address
          });
        } else {
          const createRes = await circleUserSdk.createWallet({
            userToken,
            blockchains: ['ARC-TESTNET'],
            accountType: 'EOA',
            idempotencyKey: crypto.randomUUID()
          });
          return NextResponse.json(createRes.data);
        }
      } catch (innerError: any) {
        console.error('Inner Circle Error:', innerError?.response?.data || innerError);
        return NextResponse.json(
          { error: innerError?.response?.data?.message || 'Failed to fetch existing wallet' },
          { status: 500 }
        );
      }
    }

    console.error('Circle Initialize Error:', error?.response?.data || error);
    return NextResponse.json(
      { error: error?.response?.data?.message || 'Failed to initialize wallet challenge' },
      { status: 500 }
    );
  }
}
