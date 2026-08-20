import { createAdminClient } from '@/utils/supabase/admin'

export async function authorizePayment(sessionId: string, sourceId: string, amountUsdc: number, recipientAddress: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('reserve_treasury_payment', {
    p_session_id: sessionId,
    p_source_id: sourceId,
    p_amount: amountUsdc,
    p_recipient_address: recipientAddress,
  })
  if (error || !data?.[0]) throw new Error(error?.message || 'Could not reserve treasury payment')

  const reservation = data[0]

  return {
    authorizationId: reservation.authorization_id,
    payload: {
      authorizationId: reservation.authorization_id,
      amount: amountUsdc,
      nonce: reservation.nonce,
      validAfter: reservation.valid_after,
      validBefore: reservation.valid_before
    }
  }
}
