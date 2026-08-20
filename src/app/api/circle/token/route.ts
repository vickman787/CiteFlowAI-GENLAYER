import { NextRequest, NextResponse } from 'next/server'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId } = body

    if (!process.env.CIRCLE_API_KEY) {
      return NextResponse.json({ error: 'Missing CIRCLE_API_KEY' }, { status: 500 })
    }

    const circleClient = initiateUserControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
    })

    let id = crypto.randomUUID()
    if (body.email) {
      const hash = Array.from(body.email).reduce((acc: number, char: any) => (acc * 31 + char.charCodeAt(0)) | 0, 0)
      id = `00000000-0000-0000-0000-${Math.abs(hash).toString(16).padStart(12, '0')}`
    } else if (userId) {
      id = userId
    }

    try {
      await circleClient.createUser({ userId: id })
    } catch (e: any) {
      if (e?.response?.status !== 409) {
        console.error("Failed to create user:", e?.response?.data || e.message)
      }
    }

    const res = await circleClient.createUserToken({
      userId: id
    })

    return NextResponse.json({
      userId: id,
      userToken: res.data?.userToken,
      encryptionKey: res.data?.encryptionKey
    })

  } catch (error: any) {
    console.error('Circle Token Error:', error?.response?.data || error)
    return NextResponse.json({ error: 'Failed to generate Circle user token' }, { status: 500 })
  }
}
