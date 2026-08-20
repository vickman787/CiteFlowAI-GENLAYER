import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import StatCounter from '@/components/StatCounter'
import { getNetworkStats } from '@/lib/stats'

function timeAgo(dateString: string) {
  const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default async function LandingPage() {
  const supabase = await createClient()

  const { data: recentPayments } = await supabase
    .from('payment_authorizations')
    .select(`
      authorization_id,
      amount_usdc,
      created_at,
      sources (
        title
      )
    `)
    .eq('status', 'settled')
    .order('created_at', { ascending: false })
    .limit(3)

  const { count: totalPaidCitations } = await supabase
    .from('payment_authorizations')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'settled')

  const hasLiveActivity = recentPayments && recentPayments.length > 0

  const { answersServed, paidToCreators, avgAnswerCost, registeredSources } = await getNetworkStats()

  return (
    <div className="flex-1 flex flex-col pt-12 md:pt-24 section-spacing content-container">
      <div className="flex flex-col lg:flex-row justify-between items-center lg:items-start gap-16 lg:gap-8 w-full">

        <section className="flex flex-col max-w-[620px]">
          <div className="font-mono text-xs text-[var(--color-faint)] mb-4">
            <span className="text-[var(--color-signal-green)] font-bold">~/citeflow-genlayer</span> $ init --consensus-grounded
          </div>
          <h1 className="font-mono font-semibold text-3xl md:text-4xl lg:text-[2.6rem] leading-[1.15] tracking-tight mb-5 text-[var(--color-ink)]">
            Every citation <span className="text-[var(--color-signal-green)]">decided by consensus</span>.
          </h1>
          <p className="text-base md:text-lg font-sans text-[var(--color-soft-ink)] mb-9 leading-relaxed">
            Ask a question. A GenLayer Intelligent Contract reads the registered corpus and reaches validator consensus on which sources actually ground the answer — and USDC lands in creators&apos; wallets the moment their work gets cited.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/research"
              className="btn btn-primary"
            >
              Start researching
            </Link>
            <Link
              href="/register-article"
              className="btn btn-secondary"
            >
              Register your work
            </Link>
          </div>
        </section>

        <section className="w-full lg:max-w-[480px] lg:ml-auto">
          <div className="card-panel shadow-sm overflow-hidden flex flex-col">
            <div className="bg-[var(--color-panel-deep)] text-[var(--color-ink)] p-4 flex items-center justify-between border-b border-[var(--color-border-subtle)]">
              <span className="font-mono font-medium text-sm">Live Citations {totalPaidCitations ? `(${totalPaidCitations})` : ''}</span>
              <span className="font-mono text-xs text-[var(--color-signal-green)] border border-[var(--color-signal-green)]/40 bg-[var(--color-signal-green)]/10 px-2 py-1 rounded-[2px]">GenLayer</span>
            </div>
            <div className="flex flex-col divide-y divide-[var(--color-border-subtle)] bg-[var(--color-panel)]">
              {hasLiveActivity ? (
                recentPayments.map((payment: any, index: number) => (
                  <div key={payment.authorization_id} className={`p-4 flex items-start justify-between ${index === 2 ? 'opacity-60' : ''}`}>
                    <div className="overflow-hidden pr-4">
                      <p className="font-sans font-medium text-sm text-[var(--color-ink)] mb-1 truncate" title={payment.sources?.title || 'Unknown Source'}>
                        {payment.sources?.title || 'Unknown Source'}
                      </p>
                      <p className="font-mono text-xs text-[var(--color-olive)] truncate">
                        Tx: {payment.authorization_id.substring(0, 10)}...
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-medium text-sm text-[var(--color-ink)]">
                        +{(parseFloat(payment.amount_usdc) * 0.80).toFixed(2)} USDC
                      </p>
                      <p className="font-sans text-xs text-[var(--color-soft-ink)]">
                        {timeAgo(payment.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-[var(--color-olive)] font-mono text-sm">
                  Waiting for first network transaction...
                </div>
              )}
            </div>
            <div className="bg-[var(--color-paper)] p-3 text-center border-t border-[var(--color-border-subtle)]">
              <span className="font-mono text-xs text-[var(--color-olive)] uppercase tracking-wider">
                {hasLiveActivity ? 'Live Network Activity' : 'Simulated Network Activity'}
              </span>
            </div>
          </div>
        </section>

      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mt-16 md:mt-24 w-full">
        <div className="bg-[var(--color-panel-deep)] border border-[var(--color-border-subtle)] rounded-[2px] p-5">
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[var(--color-faint)]">Answers served</div>
          <div className="font-mono font-bold text-2xl md:text-3xl mt-2 text-[var(--color-ink)]">
            <StatCounter value={answersServed || 0} />
          </div>
        </div>
        <div className="bg-[var(--color-panel-deep)] border border-[var(--color-border-subtle)] rounded-[2px] p-5">
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[var(--color-faint)]">Paid to creators</div>
             <div className="font-mono font-bold text-2xl md:text-3xl mt-2 text-[var(--color-success)]">
            <StatCounter value={paidToCreators} prefix="$" decimals={2} />
          </div>
        </div>
        <div className="bg-[var(--color-panel-deep)] border border-[var(--color-border-subtle)] rounded-[2px] p-5">
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[var(--color-faint)]">Avg answer cost</div>
          <div className="font-mono font-bold text-2xl md:text-3xl mt-2 text-[var(--color-ink)]">
            <StatCounter value={avgAnswerCost} prefix="$" decimals={2} />
          </div>
        </div>
        <div className="bg-[var(--color-panel-deep)] border border-[var(--color-border-subtle)] rounded-[2px] p-5">
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[var(--color-faint)]">Registered sources</div>
          <div className="font-mono font-bold text-2xl md:text-3xl mt-2 text-[var(--color-ink)]">
            <StatCounter value={registeredSources || 0} />
          </div>
        </div>
      </div>
    </div>
  )
}
