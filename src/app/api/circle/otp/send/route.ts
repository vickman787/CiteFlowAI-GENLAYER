import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets';
import { NextResponse } from 'next/server';

const circleUserSdk = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY as string,
});

export async function POST(req: Request) {
  try {
    const { email, deviceId } = await req.json();

    if (!email || !deviceId) {
      return NextResponse.json(
        { error: 'Email and deviceId are required' },
        { status: 400 }
      );
    }

    const response = await circleUserSdk.createDeviceTokenForEmailLogin({
      email: email,
      deviceId: deviceId,
      idempotencyKey: crypto.randomUUID()
    });

    return NextResponse.json(response.data);

  } catch (error: any) {
    console.error('Circle OTP Error:', error?.response?.data || error);
    return NextResponse.json(
      { error: error?.response?.data?.message || 'Failed to send OTP' },
      { status: 500 }
    );
  }
}
