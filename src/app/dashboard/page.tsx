'use client'

import Link from 'next/link'
import { LockKeyhole, Wallet, ExternalLink, ArrowUpRight, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { readApiJson } from '@/lib/http/client'

type DashboardData = {
  walletAddress: string | null
  sources: Array<{
    id: string
    title: string | null
    url: string
    price_usdc: number | string
    status: string
    created_at: string
  }>
  earnings: Array<{
    authorization_id: string
    source_id: string
    amount_usdc: number | string
    creatorAmount: number
    created_at: string
  }>
  stats: {
    sourceCount: number
    settledCitations: number
    grossEarnings: number
    creatorEarnings: number
  }
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatUsdc(value: number) {
  return value.toFixed(4)
}

export default function DashboardPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/creator/dashboard', { cache: 'no-store' })
      const result = await readApiJson<any>(response)
      if (!response.ok) throw new Error(result.error || 'Failed to load dashboard')
      setData(result)
    } catch (loadError: any) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const syncWallet = () => {
      const address = localStorage.getItem('circle_wallet_address')
      setWalletAddress(address)
      if (address) void loadDashboard()
      else setData(null)
    }

    syncWallet()
    window.addEventListener('storage', syncWallet)
    window.addEventListener('wallet_changed', syncWallet)
    return () => {
      window.removeEventListener('storage', syncWallet)
      window.removeEventListener('wallet_changed', syncWallet)
    }
  }, [])

  if (!walletAddress) {
    return (
      <main className="flex-1 content-container py-16 md:py-24">
        <div className="max-w-xl mx-auto card-panel p-8 md:p-12 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--color-amber)]" />
          <LockKeyhole size={30} className="mx-auto mb-6 text-[var(--color-amber)]" />
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-amber)] mb-4">dashboard_locked</p>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Connect to access creator mode</h1>
          <p className="text-[var(--color-soft-ink)] leading-relaxed mb-8">
            Your registered sources and earnings are tied to your connected wallet. Connect it from the top navigation, then return here to open your creator dashboard.
          </p>
          <div className="flex items-center justify-center gap-3 font-mono text-xs text-[var(--color-faint)]">
            <Wallet size={15} />
            <span>WALLET AUTH REQUIRED</span>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 content-container py-10 md:py-16">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-signal-green)] mb-4">
              <span className="glow-dot" /> creator_console / live
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Your sources, earning.</h1>
            <p className="mt-3 text-[var(--color-soft-ink)] font-mono text-sm">
              {shortAddress(walletAddress)} · creator share 80% · settled on GenLayer network
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => void loadDashboard()} disabled={loading} className="btn btn-secondary gap-2">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> refresh
            </button>
            <Link href="/register-article" className="btn btn-primary gap-2">
              register source <ArrowUpRight size={15} />
            </Link>
          </div>
        </header>

        {error && <div className="mb-6 p-4 border border-[var(--color-rust)] text-[var(--color-rust)] font-mono text-sm">ERROR: {error}</div>}
        {loading && !data && <div className="card-panel p-8 font-mono text-sm text-[var(--color-soft-ink)]">Loading creator ledger...</div>}

        {data && (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[var(--color-border-subtle)] border border-[var(--color-border-subtle)] mb-10">
              <div className="bg-[var(--color-panel)] p-6">
                <p className="label-text">creator earnings</p>
                <p className="text-3xl font-mono text-[var(--color-success)]">${formatUsdc(data.stats.creatorEarnings)}</p>
                <p className="mt-2 text-xs font-mono text-[var(--color-faint)]">USDC · after platform share</p>
              </div>
              <div className="bg-[var(--color-panel)] p-6">
                <p className="label-text">settled citations</p>
                <p className="text-3xl font-mono">{data.stats.settledCitations}</p>
                <p className="mt-2 text-xs font-mono text-[var(--color-faint)]">paid source uses</p>
              </div>
              <div className="bg-[var(--color-panel)] p-6">
                <p className="label-text">registered sources</p>
                <p className="text-3xl font-mono">{data.stats.sourceCount}</p>
                <p className="mt-2 text-xs font-mono text-[var(--color-faint)]">available to research</p>
              </div>
            </section>

            <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
              <div className="card-panel overflow-hidden">
                <div className="panel-h justify-between"><span>registered_sources</span><span className="tag ghost">{data.sources.length} total</span></div>
                {data.sources.length === 0 ? (
                  <div className="p-8 text-sm text-[var(--color-soft-ink)]">No sources registered yet. Add your first source to start building a citation income stream.</div>
                ) : (
                  <div className="divide-y divide-[var(--color-border-subtle)]">
                    {data.sources.map((source) => (
                      <div key={source.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="font-semibold truncate">{source.title || 'Untitled source'}</h2>
                          <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs font-mono text-[var(--color-olive)] hover:text-[var(--color-signal-green)] truncate">
                            {source.url} <ExternalLink size={11} className="flex-shrink-0" />
                          </a>
                          <p className="mt-2 text-[0.65rem] font-mono uppercase tracking-wider text-[var(--color-faint)]">registered {formatDate(source.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="tag ghost">{source.status}</span>
                          <span className="font-mono text-[var(--color-success)]">${Number(source.price_usdc).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card-panel overflow-hidden">
                <div className="panel-h justify-between"><span>earnings_ledger</span><span className="tag ghost">80% creator</span></div>
                {data.earnings.length === 0 ? (
                  <div className="p-8 text-sm text-[var(--color-soft-ink)]">No settled citations yet. Your earnings will appear here when research uses a paid source.</div>
                ) : (
                  <div className="divide-y divide-[var(--color-border-subtle)]">
                    {data.earnings.map((earning) => (
                      <div key={earning.authorization_id} className="p-5 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-mono text-sm">{shortAddress(earning.authorization_id)}</p>
                          <p className="mt-1 text-xs text-[var(--color-faint)]">{formatDate(earning.created_at)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-[var(--color-success)]">+${formatUsdc(earning.creatorAmount)}</p>
                          <p className="text-[0.65rem] font-mono text-[var(--color-faint)]">USDC settled</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
