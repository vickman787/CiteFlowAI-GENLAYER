'use client'

import { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { readApiJson } from '@/lib/http/client'

export default function ResearchWorkspacePage() {
  const [query, setQuery] = useState('')
  const [maxBudget, setMaxBudget] = useState('')
  const [loading, setLoading] = useState(false)
  const [progressLog, setProgressLog] = useState<string[]>([])
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [userToken, setUserToken] = useState<string | null>(null)
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null)
  const [sdk, setSdk] = useState<W3SSdk | null>(null)

  interface HistoryItem {
    id?: string;
    query: string;
    timestamp: string;
    result: any;
  }
  const [history, setHistory] = useState<HistoryItem[]>([])

  useEffect(() => {
    const savedAddress = localStorage.getItem('circle_wallet_address')
    const savedToken = localStorage.getItem('circle_user_token')
    const savedEncKey = localStorage.getItem('circle_encryption_key')

    if (savedAddress) setWalletAddress(savedAddress)
    if (savedToken) setUserToken(savedToken)
    if (savedEncKey) setEncryptionKey(savedEncKey)

    if (savedToken) {
      fetch('/api/research/history')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.history) setHistory(data.history)
        })
        .catch(e => console.warn('History fetch failed:', e))
    }

    if (!sdk) {
      const circleSdk = new W3SSdk({
        appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID as string }
      })
      setSdk(circleSdk)
    }
  }, [sdk])

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/research/history?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory(prev => prev.filter(item => item.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete history", err);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    setProgressLog([])

    try {
      if (!userToken || !walletAddress || !encryptionKey || !sdk) {
        throw new Error('Wallet not fully connected. Please disconnect and reconnect.');
      }

      setProgressLog(prev => [...prev, 'Initiating Pay-Per-Prompt transfer...'])

      const paymentRes = await fetch('/api/circle/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken, walletAddress: walletAddress, amount: maxBudget })
      })

      if (!paymentRes.ok) {
        const errText = await paymentRes.text()
        let parsedErrMsg = paymentRes.status === 404 && errText.includes('<!DOCTYPE html>')
          ? 'Payment endpoint was not found. Restart the Next.js development server and try again.'
          : errText;
        try {
          parsedErrMsg = JSON.parse(errText).error || errText;
        } catch {}
        throw new Error(parsedErrMsg || 'Payment challenge failed');
      }

      const { challengeId } = await readApiJson<{ challengeId: string }>(paymentRes)

      setProgressLog(prev => [...prev, 'Awaiting PIN authorization for upfront payment...'])

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const deadline = setTimeout(() => {
          if (!settled) {
            settled = true
            reject(new Error('Payment authorization timed out. Please try again.'))
          }
        }, 5 * 60 * 1000)

        sdk.setAuthentication({ userToken, encryptionKey })
        sdk.execute(challengeId, (err, result) => {
          if (settled) return
          if (err) {
            if ((err as { code?: number }).code === 155706) {
              setProgressLog(prev => [...prev, 'Secure payment window is taking longer than usual to load...'])
              return
            }
            settled = true
            clearTimeout(deadline)
            reject(new Error(err.message || 'Payment authorization failed'))
          } else {
            settled = true
            clearTimeout(deadline)
            resolve()
          }
        })
      })

      setProgressLog(prev => [...prev, 'Payment authorized successfully!', 'Booting research agent...'])

      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, maxBudget: parseFloat(maxBudget), challengeId, userToken })
      })

      if (!res.ok) {
        const errText = await res.text()
        let parsedErrMsg = errText;
        try {
          parsedErrMsg = JSON.parse(errText).error || errText;
        } catch {}
        throw new Error(parsedErrMsg || 'API Request Failed');
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            if (data.type === 'progress') {
              setProgressLog(prev => [...prev, data.payload])
            } else if (data.type === 'done') {
              const finalResult = data.payload.result;
              setResult(finalResult)
              setHistory(prev => {
                const newHistory = [{
                  query: query,
                  timestamp: new Date().toISOString(),
                  result: finalResult
                }, ...prev].slice(0, 20);
                return newHistory;
              });
            } else if (data.type === 'error') {
              setError(data.payload)
            }
          } catch (e) {
            console.error('Failed to parse stream chunk', e)
          }
        }
      }

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col pt-12 pb-24 content-container max-w-[1100px] mx-auto">
      <div className="mb-10">
        <div className="font-mono text-xs text-[var(--color-faint)] mb-3">
          <span className="text-[var(--color-signal-green)] font-bold">~/citeflow-genlayer</span> $ ask --consensus-grounded
        </div>
        <h1 className="font-mono font-semibold text-3xl md:text-4xl mb-4 text-[var(--color-ink)] tracking-tight">
          Research decided by <span className="text-[var(--color-signal-green)]">GenLayer consensus</span>.
        </h1>
        <p className="text-base text-[var(--color-soft-ink)] max-w-2xl leading-relaxed">
          Registered sources are ranked by relevance, then handed to a GenLayer Intelligent Contract, which reaches validator consensus on which of them actually ground the answer. Every source it cites gets paid in USDC. Receipts for everything.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-12">
        <div className={`flex flex-col md:flex-row bg-[var(--color-panel-deep)] border border-[var(--color-border-strong)] focus-within:border-[var(--color-signal-green)] focus-within:shadow-[0_0_0_1px_var(--color-signal-green),0_0_30px_var(--green-glow)] transition-all rounded-[2px]`}>
          <div className="hidden md:flex items-center pl-4 font-mono font-bold text-[var(--color-signal-green)]" aria-hidden="true">❯</div>
          <input
            id="query"
            type="text"
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="what do you want to know?"
            className="flex-1 bg-transparent border-0 outline-none px-4 py-4 font-mono text-sm text-[var(--color-ink)] placeholder:text-[var(--color-faint)]"
            disabled={loading}
          />
          <div className="flex items-center gap-1 border-t md:border-t-0 md:border-l border-[var(--color-border-subtle)] px-4 py-2 md:py-0 font-mono text-sm text-[var(--color-soft-ink)]">
            <span>$</span>
            <input
              id="budget"
              type="number"
              required
              min="0.01"
              step="0.01"
              max="100"
              value={maxBudget}
              onChange={(e) => setMaxBudget(e.target.value)}
              placeholder="0.50"
              className="w-16 bg-transparent border-0 outline-none font-mono text-[var(--color-ink)] placeholder:text-[var(--color-faint)]"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !walletAddress}
            className="font-mono font-bold text-sm bg-[var(--color-signal-green)] text-[var(--color-paper)] px-8 py-4 md:py-0 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all cursor-pointer"
          >
            {loading ? 'RUNNING…' : 'EXECUTE'}
          </button>
        </div>
        {!walletAddress && (
          <div className="mt-3 font-mono text-xs text-[var(--color-amber)]">
            ⚠ wallet not connected — connect to execute queries
          </div>
        )}
      </form>

      {history.length > 0 && !result && !loading && (
        <div className="mb-12 card-panel">
          <div className="panel-h">recent research <span className="ml-auto text-[var(--color-faint)]">{history.length} sessions</span></div>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {history.map((item, idx) => (
              <div key={item.id || idx} className="relative group w-full text-left p-4 hover:bg-[var(--color-panel-deep)] transition-colors flex items-center justify-between">
                <button
                  onClick={() => {
                    setQuery(item.query);
                    setResult(item.result);
                  }}
                  className="flex-1 flex flex-col gap-1 text-left outline-none pr-4 cursor-pointer"
                >
                  <div className="font-mono text-sm text-[var(--color-ink)] truncate max-w-[200px] sm:max-w-xs md:max-w-lg">{item.query}</div>
                  <div className="text-xs text-[var(--color-faint)] font-mono">{new Date(item.timestamp).toLocaleString()}</div>
                </button>
                {item.id && (
                  <button
                    onClick={(e) => handleDeleteHistory(item.id!, e)}
                    className="p-2 text-[var(--color-rust)] hover:bg-[var(--color-rust)]/10 rounded transition-colors opacity-60 hover:opacity-100"
                    title="Delete session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-8 p-4 border border-[var(--color-rust)] text-[var(--color-rust)] bg-[var(--color-rust)]/10 font-mono text-sm rounded-[2px]">
          ✗ ERROR: {error}
        </div>
      )}

      {progressLog.length > 0 && !result && (
        <div className="mb-12 card-panel font-mono text-sm">
          <div className="panel-h">
            <span className="glow-dot"></span>
            live execution
            <span className="ml-auto text-[var(--color-faint)]">streaming</span>
          </div>
          <div className="p-4 space-y-2.5 max-h-72 overflow-y-auto text-[0.8rem] leading-relaxed">
            {progressLog.map((log, index) => {
              const isSettle = /settled|refunded|authorized successfully|consensus reached/i.test(log)
              const isFail = /failed|warning|error/i.test(log)
              return (
                <div key={index} className="flex gap-4">
                  <span className="text-[var(--color-faint)] select-none flex-shrink-0">{String(index + 1).padStart(3, '0')}</span>
                  <span className={isSettle ? 'text-[var(--color-success)]' : isFail ? 'text-[var(--color-rust)]' : 'text-[var(--color-soft-ink)]'}>
                    {isSettle ? '✓ ' : isFail ? '✗ ' : ''}{log}
                  </span>
                </div>
              )
            })}
            <div className="flex gap-4">
              <span className="text-[var(--color-faint)] select-none">{String(progressLog.length + 1).padStart(3, '0')}</span>
              <span className="cursor-blink"></span>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-8">
          <section className="card-panel">
            <div className="panel-h">
              grounded answer
              <span className="ml-auto text-[var(--color-faint)]">{result.purchasedSources.length} paid citation{result.purchasedSources.length === 1 ? '' : 's'}</span>
            </div>
            <div className="p-6 sm:p-8 text-[var(--color-ink)] leading-[1.85] text-base whitespace-pre-wrap max-w-[75ch]">
              {result.answer}
            </div>
          </section>

          <section className="card-panel">
            <div className="panel-h">
              financial ledger
              <span className="ml-auto text-[var(--color-faint)]">arc testnet · usdc</span>
            </div>
            <div>
              {result.purchasedSources.length === 0 ? (
                <p className="font-mono text-sm text-[var(--color-soft-ink)] p-6">No paid sources were required for this answer. Full budget refunded.</p>
              ) : (
                result.purchasedSources.map((source: any, i: number) => (
                  <div key={i} className="border-b border-[var(--color-border-subtle)] last:border-0 p-5 font-mono text-sm flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div className="min-w-0">
                      <div className="font-sans font-semibold text-[var(--color-ink)] mb-1 truncate max-w-md text-base">{source.title}</div>
                      <div className="text-xs text-[var(--color-faint)] truncate max-w-md">{source.url}</div>
                    </div>
                    <div className="text-left md:text-right flex-shrink-0">
                      <div className="mb-2"><span className="tag">SETTLED ✓</span></div>
                      <div className="text-xs text-[var(--color-soft-ink)] break-all max-w-xs mb-1">
                        <span className="text-[var(--color-faint)]">auth</span> {source.receipt?.payload?.split(':')[1] || 'unknown'}
                      </div>
                      <div className="text-xs text-[var(--color-soft-ink)] break-all max-w-xs">
                        <span className="text-[var(--color-faint)]">batch</span> {source.receipt?.gatewaySettlementId || 'unknown'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
