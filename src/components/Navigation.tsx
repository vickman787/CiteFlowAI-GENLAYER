"use client"

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Menu, X, LogIn, LogOut, Copy, Check, Droplet, Send, ChevronDown } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import SendModal from "./SendModal";
import WalletModal from "./WalletModal";

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="118" fill="#110FFF" />
      <path d="M133,172 h96 v72 h-48 v32 h48 v64 h-96 z" fill="#F5F5F5" />
      <path d="M283,172 h96 v72 h-48 v32 h48 v64 h-96 z" fill="#F5F5F5" />
    </svg>
  );
}

export function Navigation({ initialUser }: { initialUser?: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<any>(initialUser || null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (!isWalletMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (walletMenuRef.current && !walletMenuRef.current.contains(e.target as Node)) {
        setIsWalletMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsWalletMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isWalletMenuOpen]);

  useEffect(() => {
    setUser(initialUser || null);

    const token = localStorage.getItem('circle_user_token');
    if (!initialUser && token) {
      fetch('/api/circle/wallet-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken: token }),
      })
      .then(res => {
        if (res.ok) {
          router.refresh();
        } else {
          localStorage.removeItem('circle_wallet_address');
          localStorage.removeItem('circle_user_token');
          localStorage.removeItem('circle_encryption_key');
          window.dispatchEvent(new Event('wallet_changed'));
        }
      })
      .catch(console.error);
    }
  }, [initialUser, router]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    const fetchBalance = async (token: string) => {
      try {
        const res = await fetch('/api/circle/wallet', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          if (data.balance) setWalletBalance(data.balance)
        } else if (res.status === 401) {
          handleWalletLogout()
        }
      } catch(e) {
        console.warn('Wallet balance fetch failed:', e)
      }
    }

    const initWallet = () => {
      setWalletAddress(localStorage.getItem('circle_wallet_address'));
      const token = localStorage.getItem('circle_user_token');
      if (token) fetchBalance(token); else setWalletBalance(null);
    }

    initWallet();

    const handleStorage = () => initWallet();
    const handleCustom = () => initWallet();

    window.addEventListener('storage', handleStorage);
    window.addEventListener('wallet_changed', handleCustom);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('wallet_changed', handleCustom);
    };
  }, [supabase]);

  const handleLogout = async () => {
    handleWalletLogout();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleWalletLogout = () => {
    setWalletAddress(null);
    setWalletBalance(null);
    localStorage.removeItem('circle_wallet_address');
    localStorage.removeItem('circle_user_token');
    localStorage.removeItem('circle_encryption_key');
    window.dispatchEvent(new Event('wallet_changed'));
  };

  const handleCopy = () => {
    if (walletAddress) {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(walletAddress)
      } else {
        const textArea = document.createElement("textarea")
        textArea.value = walletAddress
        document.body.appendChild(textArea)
        textArea.select()
        try {
          document.execCommand('copy')
        } catch (err) {
          console.error('Copy failed', err)
        }
        document.body.removeChild(textArea)
      }
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    }
  };

  const navLinks = [
    { href: "/research", label: "agent" },
    { href: "/register-article", label: "register" },
    { href: "/dashboard", label: "dashboard" },
    { href: "/docs", label: "docs" },
  ];

  return (
    <nav className="w-full bg-[var(--color-paper)] border-b border-[var(--color-border-subtle)] sticky top-0 z-40">
      <div className="content-container h-16 flex items-center gap-6 xl:gap-8">

        <Link href="/" className="flex items-center gap-3 flex-shrink-0 font-mono">
          <LogoMark />
          <span className="font-bold text-lg tracking-tight text-[var(--color-ink)]">
            citeflow<span className="text-[var(--color-signal-green)]">_genlayer</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-5 lg:gap-7 flex-shrink-0 ml-2">
          {navLinks.map((link) => {
            const active = pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-mono transition-colors ${
                  active
                    ? 'text-[var(--color-signal-green)]'
                    : 'text-[var(--color-soft-ink)] hover:text-[var(--color-ink)]'
                }`}
              >
                {active && <span aria-hidden="true">▸ </span>}
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="hidden md:flex items-center ml-auto flex-shrink-0">
          {walletAddress ? (
            <div className="relative" ref={walletMenuRef}>
              <button
                type="button"
                onClick={() => setIsWalletMenuOpen((v) => !v)}
                aria-expanded={isWalletMenuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2.5 text-sm text-[var(--color-soft-ink)] font-mono bg-[var(--color-panel-deep)] px-3.5 py-2 border border-[var(--color-border-strong)] rounded-[2px] whitespace-nowrap cursor-pointer hover:border-[var(--color-signal-green)] transition-colors"
              >
                <span className="glow-dot animate-pulse"></span>
                <span>{walletAddress.substring(0, 4)}…{walletAddress.substring(walletAddress.length - 4)}</span>
                {walletBalance && (
                  <>
                    <span className="text-[var(--color-faint)]">·</span>
                    <span className="font-bold text-[var(--color-ink)]">${Number(walletBalance).toFixed(2)} USDC</span>
                  </>
                )}
                <ChevronDown size={13} className={`text-[var(--color-faint)] transition-transform ${isWalletMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isWalletMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+6px)] w-56 bg-[var(--color-panel)] border border-[var(--color-border-strong)] rounded-[2px] shadow-[0_12px_40px_rgba(0,0,0,0.6)] z-50 font-mono text-sm overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
                    <div className="text-[0.6rem] uppercase tracking-[0.16em] text-[var(--color-faint)] mb-1">connected wallet</div>
                    <div className="text-xs text-[var(--color-soft-ink)] break-all">{walletAddress}</div>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleCopy}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[var(--color-ink)] hover:bg-[var(--color-panel-deep)] hover:text-[var(--color-signal-green)] transition-colors text-left"
                  >
                    {isCopied ? <Check size={14} className="text-[var(--color-signal-green)]" /> : <Copy size={14} />}
                    {isCopied ? 'copied!' : 'copy address'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setIsWalletMenuOpen(false); setIsSendModalOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[var(--color-ink)] hover:bg-[var(--color-panel-deep)] hover:text-[var(--color-signal-green)] transition-colors text-left"
                  >
                    <Send size={14} />
                    send usdc
                  </button>
                  <a
                    role="menuitem"
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsWalletMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[var(--color-ink)] hover:bg-[var(--color-panel-deep)] hover:text-[var(--color-signal-green)] transition-colors"
                  >
                    <Droplet size={14} />
                    faucet
                  </a>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setIsWalletMenuOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[var(--color-rust)] hover:bg-[var(--color-rust)]/10 transition-colors text-left border-t border-[var(--color-border-subtle)]"
                  >
                    <LogOut size={14} />
                    disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="flex items-center gap-2 text-sm font-mono font-bold bg-[var(--color-signal-green)] text-[var(--color-paper)] px-4 py-2 rounded-[2px] hover:brightness-110 transition-all whitespace-nowrap"
            >
              connect_wallet
            </button>
          )}
        </div>

        <button
          className="md:hidden ml-auto p-2 text-[var(--color-ink)]"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle Menu"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {isOpen && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-[var(--color-panel)] border-b border-[var(--color-border-subtle)] px-6 py-4 flex flex-col gap-4 shadow-lg z-40">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-base font-mono text-[var(--color-ink)] py-2"
              onClick={() => setIsOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="h-px w-full bg-[var(--color-border-subtle)] my-2"></div>
          {!walletAddress && (
            <button
              onClick={() => {
                setIsOpen(false);
                setIsWalletModalOpen(true);
              }}
              className="flex items-center gap-2 text-base font-mono font-bold text-[var(--color-signal-green)] py-2 text-left"
            >
              <LogIn size={18} />
              connect_wallet
            </button>
          )}

          {walletAddress && (
            <>
              <div className="h-px w-full bg-[var(--color-border-subtle)] my-2"></div>
              <div className="flex flex-col gap-3 py-2">
                <div className="text-xs uppercase tracking-wider font-bold font-mono text-[var(--color-faint)]">Connected Wallet</div>
                <div className="flex items-center justify-between bg-[var(--color-panel-deep)] px-3 py-2 border border-[var(--color-border-strong)] rounded-[2px]">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 font-mono text-sm text-[var(--color-soft-ink)]">
                      <span className="glow-dot animate-pulse"></span>
                      {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 4)}
                    </div>
                    {walletBalance && (
                      <div className="font-bold font-mono text-[var(--color-ink)]">${Number(walletBalance).toFixed(2)} USDC</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 border-l border-[var(--color-border-subtle)] pl-3">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="p-2 hover:text-[var(--color-signal-green)] rounded transition-colors"
                      title="Copy Address"
                    >
                      {isCopied ? <Check size={16} className="text-[var(--color-signal-green)]" /> : <Copy size={16} />}
                    </button>
                    <a
                      href="https://faucet.circle.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:text-[var(--color-signal-green)] rounded transition-colors"
                      title="Get Testnet USDC from Circle Faucet"
                    >
                      <Droplet size={16} />
                    </a>
                    <button
                      type="button"
                      onClick={() => setIsSendModalOpen(true)}
                      className="p-2 hover:text-[var(--color-signal-green)] rounded transition-colors"
                      title="Send USDC"
                    >
                      <Send size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleLogout();
                        setIsOpen(false);
                      }}
                      className="p-2 hover:text-[var(--color-rust)] rounded transition-colors"
                      title="Logout Wallet"
                    >
                      <LogOut size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {walletAddress && (
        <SendModal
          isOpen={isSendModalOpen}
          onClose={() => setIsSendModalOpen(false)}
          userToken={typeof window !== 'undefined' ? localStorage.getItem('circle_user_token') || '' : ''}
          encryptionKey={typeof window !== 'undefined' ? localStorage.getItem('circle_encryption_key') || '' : ''}
          onSuccess={() => {
            setIsSendModalOpen(false);
            window.dispatchEvent(new Event('wallet_changed'));
          }}
        />
      )}

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        onSuccess={(address, token, encKey) => {
          setIsWalletModalOpen(false);
          localStorage.setItem('circle_wallet_address', address);
          localStorage.setItem('circle_user_token', token);
          localStorage.setItem('circle_encryption_key', encKey);
          window.dispatchEvent(new Event('wallet_changed'));
          router.refresh();
        }}
      />
    </nav>
  );
}
