import Link from 'next/link'
import { ArrowRight, BookOpen, CircleHelp, Coins, FileText, LockKeyhole, Search, Wallet } from 'lucide-react'

const steps = [
  {
    icon: Wallet,
    number: '01',
    title: 'Connect a wallet',
    body: 'Use connect_wallet in the top navigation. CiteFlow uses Circle Programmable Wallets and creates a Supabase session associated with your wallet address.',
  },
  {
    icon: Search,
    number: '02',
    title: 'Ask a question',
    body: 'The agent embeds your query, ranks registered source chunks, and sends the strongest candidates to the GenLayer Intelligent Contract.',
  },
  {
    icon: Coins,
    number: '03',
    title: 'Fund the request',
    body: 'Your selected USDC budget is transferred to the treasury on Arc Testnet after Circle PIN authorization. Unused funds are refunded when possible.',
  },
  {
    icon: FileText,
    number: '04',
    title: 'Receive the result',
    body: 'GenLayer validators reach consensus on the grounded answer and its citations. Successfully cited paid sources receive their creator share.',
  },
]

function GuideCard({ icon: Icon, label, title, children }: { icon: typeof Search, label: string, title: string, children: React.ReactNode }) {
  return (
    <section className="card-panel overflow-hidden">
      <div className="panel-h gap-3"><Icon size={15} className="text-[var(--color-signal-green)]" /><span>{label}</span></div>
      <div className="p-6 md:p-8">
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <div className="text-[var(--color-soft-ink)] leading-relaxed space-y-4">{children}</div>
      </div>
    </section>
  )
}

export default function DocsPage() {
  return (
    <main className="flex-1 content-container py-12 md:py-20">
      <div className="max-w-6xl mx-auto">
        <header className="max-w-3xl mb-14">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-success)] mb-5">
            <BookOpen size={15} /> citeflow / documentation
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-5">Research that pays its sources.</h1>
          <p className="text-lg text-[var(--color-soft-ink)] leading-relaxed">
            CiteFlow connects researchers with creator-owned sources. Research questions are ranked locally, decided through GenLayer consensus, and settled in USDC when a source is cited.
          </p>
        </header>

        <section className="grid md:grid-cols-2 xl:grid-cols-4 gap-px bg-[var(--color-border-subtle)] border border-[var(--color-border-subtle)] mb-14">
          {steps.map(({ icon: Icon, number, title, body }) => (
            <div key={number} className="bg-[var(--color-panel)] p-6">
              <div className="flex items-center justify-between mb-8">
                <Icon size={21} className="text-[var(--color-signal-green)]" />
                <span className="font-mono text-xs text-[var(--color-faint)]">{number}</span>
              </div>
              <h2 className="font-mono font-bold mb-3">{title}</h2>
              <p className="text-sm text-[var(--color-soft-ink)] leading-relaxed">{body}</p>
            </div>
          ))}
        </section>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <GuideCard icon={Search} label="for researchers" title="Run grounded research">
            <p>Researchers pay for a request budget, not a subscription. The budget is used to license sources that GenLayer actually cites in the final answer.</p>
            <ol className="space-y-3 font-mono text-sm text-[var(--color-ink)]">
              <li><span className="text-[var(--color-signal-green)]">01</span> Connect your wallet.</li>
              <li><span className="text-[var(--color-signal-green)]">02</span> Open agent and enter a question.</li>
              <li><span className="text-[var(--color-signal-green)]">03</span> Set a budget large enough for relevant paid sources.</li>
              <li><span className="text-[var(--color-signal-green)]">04</span> Authorize the Circle payment with your PIN.</li>
              <li><span className="text-[var(--color-signal-green)]">05</span> Read the consensus-grounded answer and receipts.</li>
            </ol>
            <p className="text-sm">Free sources may be selected before paid sources. To test a specific paid source, use a question that directly matches it and temporarily remove competing free sources.</p>
            <Link href="/research" className="btn btn-primary gap-2">open agent <ArrowRight size={15} /></Link>
          </GuideCard>

          <GuideCard icon={FileText} label="for creators" title="Earn from your sources">
            <p>Creators register public URLs and set a citation licence price in USDC. When a settled research answer cites your source, you receive 80% of its price.</p>
            <ol className="space-y-3 font-mono text-sm text-[var(--color-ink)]">
              <li><span className="text-[var(--color-signal-green)]">01</span> Connect the wallet that should receive earnings.</li>
              <li><span className="text-[var(--color-signal-green)]">02</span> Open register and submit a public article URL.</li>
              <li><span className="text-[var(--color-signal-green)]">03</span> Set the citation licence price.</li>
              <li><span className="text-[var(--color-signal-green)]">04</span> Monitor registered sources in dashboard.</li>
              <li><span className="text-[var(--color-signal-green)]">05</span> Review settled citations and creator earnings.</li>
            </ol>
            <p className="text-sm">The current demo does not verify URL ownership. Register only content you are authorized to license.</p>
            <div className="flex gap-3 flex-wrap"><Link href="/register-article" className="btn btn-primary gap-2">register source <ArrowRight size={15} /></Link><Link href="/dashboard" className="btn btn-secondary">open dashboard</Link></div>
          </GuideCard>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <GuideCard icon={Wallet} label="wallets and payments" title="What happens to USDC?">
            <p>Circle handles user-controlled wallet login, PIN authorization, upfront funding, creator transfers, and refunds. The payment network shown in this demo is Arc Testnet.</p>
            <p>Creators receive 80% of a settled source price. The platform retains the remaining 20%. A failed paid settlement does not count as a successful citation.</p>
            <div className="p-4 bg-[var(--color-panel-deep)] border border-[var(--color-border-subtle)] font-mono text-xs text-[var(--color-ink)]">No wallet connected = no research funding, source registration, or creator dashboard access.</div>
          </GuideCard>

          <GuideCard icon={CircleHelp} label="consensus and troubleshooting" title="When something goes wrong">
            <p>GenLayer execution can take time because multiple validators must reach consensus. StudioNet is a shared test network and may occasionally delay or fail model execution.</p>
            <ul className="space-y-3 text-sm">
              <li><strong className="text-[var(--color-ink)]">Payment endpoint 404:</strong> stop and restart <code>npm run dev</code>.</li>
              <li><strong className="text-[var(--color-ink)]">Empty model response:</strong> retry with a shorter question or smaller source set.</li>
              <li><strong className="text-[var(--color-ink)]">Dashboard locked:</strong> reconnect the wallet, then refresh the page.</li>
              <li><strong className="text-[var(--color-ink)]">No citation:</strong> check that the question matches the registered source and that the budget covers its price.</li>
            </ul>
          </GuideCard>
        </div>

        <section className="border border-[var(--color-amber)]/40 bg-[var(--color-amber)]/5 p-6 md:p-8 flex gap-4">
          <LockKeyhole size={20} className="text-[var(--color-amber)] flex-shrink-0 mt-1" />
          <div>
            <h2 className="font-mono font-bold text-[var(--color-amber)] mb-2">demo status / know before using</h2>
            <p className="text-sm text-[var(--color-soft-ink)] leading-relaxed">This is a working prototype. Source ownership verification, production treasury controls, and a fully managed deployment are not yet included. Use testnet funds only and verify every settlement before treating an earnings balance as production revenue.</p>
          </div>
        </section>
      </div>
    </main>
  )
}
