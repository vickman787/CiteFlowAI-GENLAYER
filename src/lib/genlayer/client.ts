// Thin wrapper around GenLayer's JS SDK. Centralized here so the rest of the
// app never imports `genlayer-js` directly — if the SDK's API shifts, this is
// the one file that needs to change.
//
// STILL UNVERIFIED — confirm against a real `npm install genlayer-js` before
// relying on this, but this version is grounded in the genlayer-js README
// (github.com/genlayerlabs/genlayer-js), not a guess:
//   import { studionet } from 'genlayer-js/chains'
//   import { createClient } from 'genlayer-js'
//   const client = createClient({ chain: studionet })
// There is no raw RPC URL to hunt down — the network is selected by importing
// a named chain preset, which has its RPC endpoint baked in. Available
// presets per the README: localnet, studionet, testnetAsimov, testnetBradbury.
//
// Using studionet (GenLayer's hosted Studio network) rather than
// testnetBradbury — Bradbury was unreliable when this was set up, and
// studionet matches the studio.genlayer.com deploy flow already in use.
// Trade-off worth knowing: studionet is a shared hosted simulator, not
// confirmed here to have the same persistence/uptime guarantees as a real
// testnet — if a demo recording session hits flakiness, that's a plausible
// cause. Re-check docs.genlayer.com if Bradbury's issues clear up later.

import { createClient } from 'genlayer-js'
import * as chains from 'genlayer-js/chains'

let cachedClient: ReturnType<typeof createClient> | null = null

export function getGenLayerClient() {
  if (cachedClient) return cachedClient

  const networkName = process.env.GENLAYER_NETWORK || 'studionet'
  const chain = (chains as Record<string, unknown>)[networkName]
  if (!chain) {
    throw new Error(
      `Unknown GENLAYER_NETWORK "${networkName}". Expected one of: localnet, studionet, testnetAsimov, testnetBradbury.`
    )
  }

  cachedClient = createClient({ chain: chain as any })

  return cachedClient
}
