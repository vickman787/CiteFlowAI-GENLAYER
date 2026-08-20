'use client';

import React, { useState, useEffect } from 'react';
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';

interface SendModalProps {
  isOpen: boolean;
  onClose: () => void;
  userToken: string;
  encryptionKey: string;
  onSuccess: () => void;
}

type ModalState = 'INPUT' | 'LOADING' | 'AUTHORIZING' | 'COMPLETED';

export default function SendModal({ isOpen, onClose, userToken, encryptionKey, onSuccess }: SendModalProps) {
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [modalState, setModalState] = useState<ModalState>('INPUT');
  const [error, setError] = useState<string | null>(null);
  const [sdk, setSdk] = useState<W3SSdk | null>(null);

  useEffect(() => {
    if (isOpen && !sdk) {
      const circleSdk = new W3SSdk({
        appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID as string }
      });
      setSdk(circleSdk);
    }

    if (isOpen) {
        setModalState('INPUT');
        setAddress('');
        setAmount('');
        setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setModalState('LOADING');

    try {
      if (!sdk) throw new Error('Circle SDK not initialized');

      const res = await fetch('/api/circle/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userToken,
            amount,
            destinationAddress: address
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initiate transfer');

      const challengeId = data.challengeId;
      if (!challengeId) throw new Error('No challenge ID received');

      setModalState('AUTHORIZING');

      sdk.setAuthentication({
        userToken,
        encryptionKey
      });

      sdk.execute(challengeId, (error, result) => {
        if (error) {
          console.error('Challenge Error', error);
          setError(error.message || 'Transaction Authorization Failed');
          setModalState('INPUT');
          return;
        }

        if (result) {
          setModalState('COMPLETED');
          setTimeout(() => {
            onSuccess();
          }, 2000);
        }
      });

    } catch (err: any) {
      setError(err.message);
      setModalState('INPUT');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="card-panel w-full max-w-md p-6 shadow-xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--color-soft-ink)] hover:text-[var(--color-ink)]"
        >
          ✕
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-1">
            {modalState === 'INPUT' ? 'Send USDC' :
             modalState === 'AUTHORIZING' ? 'Authorize Transfer' :
             modalState === 'LOADING' ? 'Preparing Transaction' : 'Transaction Complete!'}
          </h2>
          <p className="text-sm text-[var(--color-soft-ink)]">
            {modalState === 'INPUT' && 'Withdraw your USDC to any EVM-compatible wallet on Arc Testnet.'}
            {modalState === 'AUTHORIZING' && 'Enter your PIN to securely sign the transaction on the blockchain.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[var(--color-rust)]/10 text-[var(--color-rust)] text-sm rounded-[2px] border border-[var(--color-rust)]">
            {error}
          </div>
        )}

        {modalState === 'INPUT' && (
          <form onSubmit={handleSend}>
            <div className="mb-4">
              <label className="label-text">Destination Address</label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="input-field font-mono text-sm"
                placeholder="0x..."
                pattern="^0x[a-fA-F0-9]{40}$"
                title="Must be a valid 42-character hex address starting with 0x"
              />
            </div>
            <div className="mb-6">
              <label className="label-text">Amount (USDC)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-field"
                placeholder="0.00"
              />
            </div>
            <button type="submit" className="btn btn-primary w-full">
              Send Now
            </button>
          </form>
        )}

        {modalState === 'LOADING' && (
          <div className="py-8 flex flex-col items-center justify-center text-[var(--color-soft-ink)]">
             <svg className="animate-spin h-8 w-8 mb-4 text-[var(--color-signal-green)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Generating Smart Contract Intent...</span>
          </div>
        )}

        <div className={`w-full ${(modalState === 'AUTHORIZING') ? 'block' : 'hidden'}`}>
           <div id="circle-ui-container" className="min-h-[300px] w-full border border-[var(--color-border-subtle)] rounded-lg bg-[var(--color-panel-deep)]"></div>
        </div>

        {modalState === 'COMPLETED' && (
           <div className="py-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-[var(--color-success)]/15 text-[var(--color-success)] rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
               </div>
               <h3 className="font-medium text-lg">Transfer Submitted!</h3>
               <p className="text-sm text-[var(--color-soft-ink)] mt-2">Your USDC is on its way across the Arc Testnet.</p>
           </div>
        )}
      </div>
    </div>
  );
}
