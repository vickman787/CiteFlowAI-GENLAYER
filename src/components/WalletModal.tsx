'use client';

import React, { useState, useEffect } from 'react';
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';
import { readApiJson } from '@/lib/http/client';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (walletAddress: string, userToken: string, encryptionKey: string) => void;
}

type ModalState = 'EMAIL_INPUT' | 'LOADING' | 'VERIFY_OTP' | 'SET_PIN' | 'COMPLETED';

export default function WalletModal({ isOpen, onClose, onSuccess }: WalletModalProps) {
  const [email, setEmail] = useState('');
  const [modalState, setModalState] = useState<ModalState>('EMAIL_INPUT');
  const [error, setError] = useState<string | null>(null);
  const [sdk, setSdk] = useState<W3SSdk | null>(null);

  const [userToken, setUserToken] = useState<string | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const circleSdk = new W3SSdk({
        appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID as string }
      });
      setSdk(circleSdk);
      setModalState('EMAIL_INPUT');
      setEmail('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const errMessage = (err: unknown): string =>
    typeof err === 'string' ? err : (err as { message?: string })?.message || 'Something went wrong';

  const getDeviceIdWithRetry = async (circleSdk: W3SSdk, attempts = 3): Promise<string> => {
    let lastErr: unknown
    for (let i = 0; i < attempts; i++) {
      try {
        return await circleSdk.getDeviceId();
      } catch (err) {
        lastErr = err
        console.warn(`getDeviceId attempt ${i + 1}/${attempts} failed:`, err);
      }
    }
    throw new Error(`Could not reach Circle's secure service (${errMessage(lastErr)}). Please check your connection and try again.`);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setModalState('LOADING');

    try {
      if (!sdk) throw new Error('Circle SDK not initialized');
      const deviceId = await getDeviceIdWithRetry(sdk);

      const res = await fetch('/api/circle/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, deviceId }),
      });

      const data = await readApiJson<any>(res);
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

      const { deviceToken, deviceEncryptionKey, otpToken } = data;

      setModalState('VERIFY_OTP');

      if (sdk) {
        sdk.updateConfigs({
          appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID as string },
          loginConfigs: {
            deviceToken: deviceToken,
            deviceEncryptionKey: deviceEncryptionKey || '',
            otpToken: otpToken
          }
        }, (error, result) => {
          if (error) {
            console.error('OTP Error', error);
            setError(error.message || 'OTP Verification Failed');
            setModalState('EMAIL_INPUT');
            return;
          }

          if (result && result.userToken) {
            setUserToken(result.userToken);
            setEncryptionKey(result.encryptionKey);
            handleInitializeWallet(result.userToken, result.encryptionKey);
          }
        });

        sdk.verifyOtp();
      }

    } catch (err: any) {
      setError(errMessage(err));
      setModalState('EMAIL_INPUT');
    }
  };

  const handleInitializeWallet = async (token: string, encKey: string) => {
    setModalState('LOADING');
    try {
      const res = await fetch('/api/circle/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken: token }),
      });

      const data = await readApiJson<any>(res);
      if (!res.ok) throw new Error(data.error || 'Failed to initialize wallet challenge');

      if (data.address) {
        await fetch('/api/circle/wallet-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userToken: token }),
        });

        setModalState('COMPLETED');
        onSuccess(data.address, token, encKey);
        return;
      }

      const challengeId = data.challengeId;

      setModalState('SET_PIN');

      if (sdk) {
        sdk.setAuthentication({
          userToken: token,
          encryptionKey: encKey
        });

        sdk.execute(challengeId, async (error, result) => {
          if (error) {
            console.error('Challenge Error', error);
            setError(error.message || 'PIN Setup Failed');
            setModalState('EMAIL_INPUT');
            return;
          }

          if (result) {
            let loginData: any = null;
            let loginOk = false;
            for (let i = 0; i < 4 && !loginOk; i++) {
              if (i > 0) await new Promise((r) => setTimeout(r, 1000));
              const loginRes = await fetch('/api/circle/wallet-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userToken: token }),
              });
              loginData = await readApiJson<any>(loginRes);
              loginOk = loginRes.ok && !!loginData.walletAddress;
            }

            if (!loginOk) {
              setError('Wallet was created but we could not confirm its address yet. Please close this dialog and reconnect.');
              setModalState('EMAIL_INPUT');
              return;
            }

            setModalState('COMPLETED');
            onSuccess(loginData.walletAddress, token, encKey);
          }
        });
      }

    } catch (err: any) {
      setError(err.message);
      setModalState('EMAIL_INPUT');
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
            {modalState === 'EMAIL_INPUT' ? 'Connect Wallet' :
             modalState === 'VERIFY_OTP' ? 'Enter Code' :
             modalState === 'SET_PIN' ? 'Secure Your Wallet' :
             modalState === 'LOADING' ? 'Please Wait' : 'Success!'}
          </h2>
          <p className="text-sm text-[var(--color-soft-ink)]">
            {modalState === 'EMAIL_INPUT' && 'Enter your email to connect or create a wallet.'}
            {modalState === 'VERIFY_OTP' && `We sent a code to ${email}`}
            {modalState === 'SET_PIN' && 'Set a secure PIN for your new wallet.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[var(--color-rust)]/10 text-[var(--color-rust)] text-sm rounded-[2px] border border-[var(--color-rust)]">
            {error}
          </div>
        )}

        {modalState === 'EMAIL_INPUT' && (
          <form onSubmit={handleSendOtp}>
            <div className="mb-4">
              <label className="label-text">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
              />
            </div>
            <button type="submit" className="btn btn-primary w-full">
              Continue
            </button>
          </form>
        )}

        {modalState === 'LOADING' && (
          <div className="py-8 flex flex-col items-center justify-center text-[var(--color-soft-ink)]">
             <svg className="animate-spin h-8 w-8 mb-4 text-[var(--color-signal-green)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Processing...</span>
          </div>
        )}

        <div className={`w-full ${(modalState === 'VERIFY_OTP' || modalState === 'SET_PIN') ? 'block' : 'hidden'}`}>
           <div id="circle-ui-container" className="min-h-[300px] w-full border border-[var(--color-border-subtle)] rounded-lg bg-[var(--color-panel-deep)]"></div>
        </div>

        {modalState === 'COMPLETED' && (
           <div className="py-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-[var(--color-success)]/15 text-[var(--color-success)] rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
               </div>
               <h3 className="font-medium text-lg">Wallet Connected</h3>
               <button onClick={onClose} className="mt-6 btn btn-highlight w-full">
                   Start Using CiteFlow
               </button>
           </div>
        )}
      </div>
    </div>
  );
}
