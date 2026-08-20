import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: sessions, error } = await supabase
      .from('research_sessions')
      .select('id, query, created_at, result')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .not('result', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('History Fetch Error:', error)
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
    }

    const history = sessions.map(s => ({
      id: s.id,
      query: s.query,
      timestamp: s.created_at,
      result: s.result
    }))

    return NextResponse.json({ history })
  } catch (error: any) {
    console.error('History API Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    const { error } = await supabase
      .from('research_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('History Delete Error:', error)
      return NextResponse.json({ error: 'Failed to delete history' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('History Delete API Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
