import { NextRequest, NextResponse } from 'next/server'
import { registerArticle } from '@/lib/registration/pipeline'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

const registrationSchema = z.object({
  url: z.string().url(),
  price: z.number().min(0).max(100),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: creatorProfile, error: creatorError } = await supabase
      .from('creator_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (creatorError || !creatorProfile) {
      return NextResponse.json({ error: 'Creator profile not found. Please reconnect your wallet.' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = registrationSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 })
    }

    const { url, price } = parsed.data

    const result = await registerArticle(url, creatorProfile.id, price)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, sourceId: result.sourceId }, { status: 201 })

  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
