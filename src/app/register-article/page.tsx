'use client'

import { useState, useEffect } from 'react'
import { readApiJson } from '@/lib/http/client'

export default function RegisterArticlePage() {
  const [url, setUrl] = useState('')
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)

  useEffect(() => {
    const syncWallet = () => setWalletAddress(localStorage.getItem('circle_wallet_address'))
    syncWallet()
    window.addEventListener('storage', syncWallet)
    window.addEventListener('wallet_changed', syncWallet)
    return () => {
      window.removeEventListener('storage', syncWallet)
      window.removeEventListener('wallet_changed', syncWallet)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!walletAddress) {
      setError('Connect your wallet before registering a source.')
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch('/api/sources/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, price: parseFloat(price) }),
      })

      const data = await readApiJson<any>(res)

      if (!res.ok) {
        throw new Error(data.error || 'Failed to register article')
      }

      setSuccess(true)
      setUrl('')

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center pt-12 md:pt-24 content-container">
      <div className="w-full max-w-2xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-serif font-bold mb-4 text-[var(--color-ink)]">Register Article</h1>
          <p className="text-lg text-[var(--color-soft-ink)]">
            Submit your work to the network. Set a citation-licence price in USDC.
          </p>
          <p className="text-sm text-[var(--color-olive)] mt-3 font-mono">
            Demo mode: any connected wallet can register any public URL — no ownership proof required here.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card-panel p-8 sm:p-10">
          {!walletAddress && (
            <div className="mb-6 p-4 border border-[var(--color-amber)] text-[var(--color-amber)] bg-[var(--color-amber)]/10 font-mono text-sm rounded flex items-center gap-2">
              <span>⚠</span>
              <span>Connect your wallet from the top navigation bar to register a source.</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 border border-[var(--color-rust)] text-[var(--color-rust)] bg-[var(--color-rust)]/5 font-mono text-sm rounded">
              ERROR: {error}
            </div>
          )}

          {success && (
             <div className="mb-6 p-4 border border-[var(--color-success)] text-[var(--color-ink)] bg-[var(--color-success)]/10 font-mono text-sm rounded">
              SUCCESS: Article registered and extracted successfully.
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label htmlFor="url" className="label-text">
                Public Article URL
              </label>
              <input
                id="url"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-domain.com/article"
                className="input-field"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="price" className="label-text">
                Citation Licence Price (USDC)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[var(--color-soft-ink)]">$</span>
                <input
                  id="price"
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.05"
                  className="input-field font-mono"
                  style={{ paddingLeft: '2.5rem' }}
                  disabled={loading}
                />
              </div>
              <p className="mt-2 text-xs text-[var(--color-olive)]">
                Amount paid to your wallet each time the GenLayer contract cites this source.
              </p>
            </div>

            <div className="pt-6 border-t border-[var(--color-border-subtle)]">
              <button
                type="submit"
                disabled={loading || !walletAddress}
                title={!walletAddress ? 'Connect your wallet first' : undefined}
                className="btn btn-primary w-full"
              >
                {loading ? 'Extracting...' : !walletAddress ? 'Connect wallet to register' : 'Register Source'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
