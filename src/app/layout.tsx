import type { Metadata } from "next";
import { validateEnv } from "@/lib/env";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Navigation } from "@/components/Navigation";
import StatsTicker from "@/components/StatsTicker";
import { getNetworkStats } from "@/lib/stats";
import "./globals.css";

const sans = IBM_Plex_Sans({
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "citeflow_genlayer | Arc Testnet + GenLayer",
  description: "Research that pays its sources — grounded and cited by a GenLayer Intelligent Contract, settled in USDC on Arc Testnet.",
};

import { createClient } from "@/utils/supabase/server";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const stats = await getNetworkStats().catch(() => null);

  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[var(--color-paper)] text-[var(--color-ink)]">
        {(() => {
          const env = validateEnv();
          if (!env.isValid) {
            return (
              <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--color-paper)]">
                <div className="card-panel p-10 max-w-2xl w-full">
                  <h1 className="text-3xl font-serif font-bold text-[var(--color-ink)] mb-6 border-b border-[var(--color-border-subtle)] pb-4">
                    Setup Required
                  </h1>
                  <p className="text-lg mb-6 text-[var(--color-soft-ink)]">
                    The application is missing critical environment variables. Please configure the following in your <code className="text-[var(--color-olive)] font-mono bg-[var(--color-panel-deep)] px-2 py-1 rounded">.env.local</code> file:
                  </p>
                  <ul className="space-y-3 mb-8">
                    {env.errors.map((err: string) => (
                      <li key={err} className="font-mono text-sm text-[var(--color-rust)] bg-[var(--color-panel-deep)] p-3 rounded border border-[var(--color-border-subtle)]">
                        {err}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-[var(--color-olive)]">
                    After adding these variables, restart the Next.js development server to continue.
                  </p>
                </div>
              </div>
            );
          }

          return (
            <>
              {stats ? (
                <StatsTicker stats={stats} />
              ) : (
                <div className="w-full border-b border-[var(--color-border-subtle)] font-mono text-[0.62rem] uppercase tracking-[0.12em] text-[var(--color-soft-ink)]">
                  <div className="content-container flex items-center justify-between py-2">
                    <span className="flex items-center gap-2">
                      <span className="glow-dot"></span>
                       <span className="text-[var(--color-success)]">ARC-TESTNET · GENLAYER · LIVE</span>
                    </span>
                    <span>CIRCLE W3S</span>
                  </div>
                </div>
              )}

              <Navigation initialUser={data?.user} />

              <div className="flex-1 flex flex-col">
                {children}
              </div>
            </>
          );
        })()}
      </body>
    </html>
  );
}
