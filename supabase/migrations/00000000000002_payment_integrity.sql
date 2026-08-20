-- Atomic reservations and replay protection for funded research sessions.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.payment_authorizations
  ADD COLUMN IF NOT EXISTS recipient_address TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS audit_funding_transaction_unique
  ON public.audit_events ((details->>'transactionId'))
  WHERE event_type = 'funding_tx_used' AND details->>'transactionId' IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_funded_research_session(
  p_user_id UUID,
  p_query TEXT,
  p_budget NUMERIC,
  p_transaction_id TEXT,
  p_amount NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_id UUID;
BEGIN
  INSERT INTO public.research_sessions (user_id, query, budget_usdc, status)
  VALUES (p_user_id, p_query, p_budget, 'active')
  RETURNING id INTO session_id;

  INSERT INTO public.audit_events (event_type, details)
  VALUES ('funding_tx_used', jsonb_build_object(
    'transactionId', p_transaction_id,
    'sessionId', session_id,
    'userId', p_user_id,
    'amount', p_amount
  ));

  RETURN session_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'funding_transaction_already_used' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_treasury_payment(
  p_session_id UUID,
  p_source_id UUID,
  p_amount NUMERIC,
  p_recipient_address TEXT
)
RETURNS TABLE (authorization_id TEXT, nonce TEXT, valid_after BIGINT, valid_before BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  daily_limit NUMERIC;
  spent NUMERIC;
  session_budget NUMERIC;
  session_spent NUMERIC;
  new_auth TEXT := 'auth_' || encode(extensions.gen_random_bytes(12), 'hex');
  new_nonce TEXT := '0x' || encode(extensions.gen_random_bytes(32), 'hex');
  starts_at BIGINT := extract(epoch from now())::BIGINT;
BEGIN
  IF p_amount < 0 OR p_recipient_address IS NULL OR p_recipient_address = '' THEN
    RAISE EXCEPTION 'invalid_payment_reservation';
  END IF;

  INSERT INTO public.treasury_limits (date, daily_limit_usdc)
  VALUES (today, 100.00)
  ON CONFLICT (date) DO NOTHING;

  SELECT daily_limit_usdc, spent_today_usdc INTO daily_limit, spent
  FROM public.treasury_limits WHERE date = today FOR UPDATE;
  SELECT budget_usdc INTO session_budget FROM public.research_sessions WHERE id = p_session_id FOR UPDATE;
  IF session_budget IS NULL THEN RAISE EXCEPTION 'research_session_not_found'; END IF;

  SELECT COALESCE(sum(amount_usdc), 0) INTO session_spent
  FROM public.payment_authorizations WHERE session_id = p_session_id;
  IF spent + p_amount > daily_limit THEN RAISE EXCEPTION 'treasury_limit_reached'; END IF;
  IF session_spent + p_amount > session_budget THEN RAISE EXCEPTION 'session_budget_exceeded'; END IF;

  INSERT INTO public.payment_authorizations
    (session_id, source_id, authorization_id, amount_usdc, recipient_address, status)
  VALUES (p_session_id, p_source_id, new_auth, p_amount, p_recipient_address, 'pending');
  UPDATE public.treasury_limits SET spent_today_usdc = spent + p_amount WHERE date = today;

  authorization_id := new_auth;
  nonce := new_nonce;
  valid_after := starts_at;
  valid_before := starts_at + 3600;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_funded_research_session(UUID, TEXT, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_treasury_payment(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_funded_research_session(UUID, TEXT, NUMERIC, TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_treasury_payment(UUID, UUID, NUMERIC, TEXT) TO service_role;
