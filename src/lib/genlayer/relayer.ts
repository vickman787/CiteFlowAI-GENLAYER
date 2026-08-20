// The relayer: a backend-held GenLayer account that signs and submits
// transactions on behalf of website users, so no end user ever needs their
// own GenLayer wallet or native token. Same "hide the chain" philosophy as
// the Circle Programmable Wallets flow — the user pays in USDC on Arc, this
// backend account pays GenLayer gas.
//
// VERIFY BEFORE FIRST RUN: the README shows `createAccount()` importable
// directly from `genlayer-js` (not a `/accounts` subpath) taking no required
// args for the basic case — confirm whether passing a private key positionally
// like this is actually supported, or whether keys are supplied differently
// (e.g. via a signer object), before relying on it.

import { createAccount } from 'genlayer-js'
import { getGenLayerClient } from './client'

let cachedAccount: ReturnType<typeof createAccount> | null = null

export function getRelayerAccount() {
  if (cachedAccount) return cachedAccount

  const key = process.env.GENLAYER_RELAYER_PRIVATE_KEY
  if (!key) throw new Error('GENLAYER_RELAYER_PRIVATE_KEY is not set')

  cachedAccount = createAccount(key as `0x${string}`)
  return cachedAccount
}

export function getRelayerClient() {
  const client = getGenLayerClient()
  const account = getRelayerAccount()
  return { client, account }
}
