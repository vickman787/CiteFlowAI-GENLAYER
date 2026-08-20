-- Initial schema for citeflow-genlayer
-- Deliberately drops ownership_verifications / platform_identities from the
-- main CiteFlowAI schema: this demo app does not gate source registration on
-- proven ownership, so any wallet-authenticated user can register any URL.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Profiles (extends auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    wallet_address TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Creator Profiles
CREATE TABLE public.creator_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    bio TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

-- 3. Sources (Registered Articles) — no ownership proof required
CREATE TABLE public.sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES public.creator_profiles(id) ON DELETE SET NULL,
    url TEXT NOT NULL UNIQUE,
    title TEXT,
    content_hash TEXT,
    price_usdc NUMERIC(10, 6) DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, extracted, failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Source Chunks
CREATE TABLE public.source_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Research Sessions
CREATE TABLE public.research_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    budget_usdc NUMERIC(10, 6) DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'active',
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Citation Decisions — logs what the GenLayer contract returned per source
CREATE TABLE public.citation_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.research_sessions(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
    contribution_score NUMERIC(5, 4),
    accepted BOOLEAN NOT NULL DEFAULT false,
    reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Payment Authorizations
CREATE TABLE public.payment_authorizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.research_sessions(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
    authorization_id TEXT NOT NULL UNIQUE,
    amount_usdc NUMERIC(10, 6) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Payment Settlements
CREATE TABLE public.payment_settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    authorization_id TEXT NOT NULL REFERENCES public.payment_authorizations(authorization_id) ON DELETE CASCADE,
    gateway_settlement_id TEXT UNIQUE,
    transaction_hash TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Treasury Limits
CREATE TABLE public.treasury_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
    daily_limit_usdc NUMERIC(10, 6) NOT NULL DEFAULT 100.00,
    spent_today_usdc NUMERIC(10, 6) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. Audit Events
CREATE TABLE public.audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Creator profiles are viewable by everyone" ON public.creator_profiles FOR SELECT USING (true);
CREATE POLICY "Users can manage their creator profile" ON public.creator_profiles FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Sources are viewable by everyone" ON public.sources FOR SELECT USING (true);
CREATE POLICY "Users can insert sources" ON public.sources FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Source chunks are viewable by everyone" ON public.source_chunks FOR SELECT USING (true);

CREATE POLICY "Users can manage own sessions" ON public.research_sessions
FOR ALL TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can manage own citation decisions" ON public.citation_decisions
FOR ALL TO authenticated USING (
    session_id IN (SELECT id FROM public.research_sessions WHERE user_id = auth.uid())
);

CREATE POLICY "Users can manage own payment auths" ON public.payment_authorizations
FOR ALL TO authenticated USING (
    session_id IN (SELECT id FROM public.research_sessions WHERE user_id = auth.uid())
);

CREATE POLICY "Users can manage own settlements" ON public.payment_settlements
FOR ALL TO authenticated USING (
    authorization_id IN (
        SELECT authorization_id FROM public.payment_authorizations WHERE session_id IN (
            SELECT id FROM public.research_sessions WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Anyone can insert audit events" ON public.audit_events
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Anyone can view and update treasury" ON public.treasury_limits
FOR ALL TO authenticated USING (true);

-- Functions and Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_creator_profiles_updated_at BEFORE UPDATE ON public.creator_profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON public.sources FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);

  INSERT INTO public.creator_profiles (user_id)
  VALUES (new.id);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
