import { createClient } from '@/utils/supabase/server'

export const CREATOR_SHARE = 0.8 // 20% platform fee

export interface NetworkStats {
  answersServed: number
  paidToCreators: number
  avgAnswerCost: number
  registeredSources: number
}

// Live network stats from the ledger — used by the ticker and the landing page tiles
export async function getNetworkStats(): Promise<NetworkStats> {
  const supabase = await createClient()

  const [{ count: answersServed }, { data: settledAmounts }, { count: registeredSources }] = await Promise.all([
    supabase.from('research_sessions').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('payment_authorizations').select('amount_usdc').eq('status', 'settled'),
    supabase.from('sources').select('*', { count: 'exact', head: true }).eq('status', 'extracted'),
  ])

  const totalSettled = (settledAmounts || []).reduce((acc, r) => acc + parseFloat(r.amount_usdc), 0)
  const paidToCreators = totalSettled * CREATOR_SHARE

  return {
    answersServed: answersServed || 0,
    paidToCreators,
    avgAnswerCost: answersServed ? totalSettled / answersServed : 0,
    registeredSources: registeredSources || 0,
  }
}
