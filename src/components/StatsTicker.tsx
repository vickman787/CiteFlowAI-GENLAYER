import type { NetworkStats } from '@/lib/stats'

// Terminal ticker tape — scrolls live ledger stats across the top of every page.
export default function StatsTicker({ stats }: { stats: NetworkStats }) {
  const items = [
    <span key="net" className="flex items-center gap-2">
      <span className="glow-dot"></span>
       <span className="text-[var(--color-success)]">ARC-TESTNET · GENLAYER · LIVE</span>
    </span>,
    <span key="ans">ANSWERS SERVED: <b className="text-[var(--color-ink)]">{stats.answersServed.toLocaleString('en-US')}</b></span>,
     <span key="paid">PAID TO CREATORS: <b className="text-[var(--color-success)]">${stats.paidToCreators.toFixed(2)} USDC</b></span>,
    <span key="avg">AVG ANSWER COST: <b className="text-[var(--color-ink)]">${stats.avgAnswerCost.toFixed(2)}</b></span>,
    <span key="src">REGISTERED SOURCES: <b className="text-[var(--color-ink)]">{stats.registeredSources.toLocaleString('en-US')}</b></span>,
    <span key="ppp">PAY-PER-PROMPT · NO SUBSCRIPTIONS</span>,
    <span key="w3s">CIRCLE W3S · USDC SETTLEMENTS</span>,
  ]

  const half = (keyPrefix: string) => (
    <div className="flex items-center flex-shrink-0" aria-hidden={keyPrefix === 'b'}>
      {items.map((item, i) => (
        <span key={`${keyPrefix}${i}`} className="flex items-center">
          <span className="px-5 flex items-center gap-2">{item}</span>
          <span className="text-[var(--color-faint)]">✦</span>
        </span>
      ))}
    </div>
  )

  return (
    <div className="ticker-wrap w-full border-b border-[var(--color-border-subtle)] font-mono text-[0.62rem] uppercase tracking-[0.12em] text-[var(--color-soft-ink)] py-2">
      <div className="ticker-track">
        {half('a')}
        {half('b')}
      </div>
    </div>
  )
}
