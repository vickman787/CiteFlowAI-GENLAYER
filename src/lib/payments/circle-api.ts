import crypto from 'crypto'
import dns from 'dns'

dns.setDefaultResultOrder('ipv4first')

export async function generateDynamicCiphertext(rawEntitySecretHex: string): Promise<string> {
  const apiKey = process.env.CIRCLE_API_KEY
  if (!apiKey) throw new Error('CIRCLE_API_KEY missing')

  const response = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}` }
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Failed to fetch Circle Public Key: ${err.message}`)
  }

  const data = await response.json()
  const publicKeyPem = data.data.publicKey

  const encryptedData = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    Buffer.from(rawEntitySecretHex, 'hex') // Must be 32 bytes!
  )

  return encryptedData.toString('base64')
}

export async function executeGatewayTransfer(destinationAddress: string, amountUsdc: string): Promise<string> {
  const apiKey = process.env.CIRCLE_API_KEY
  const walletId = process.env.CIRCLE_WALLET_ID
  const rawSecret = process.env.RAW_ENTITY_SECRET

  if (!apiKey || !walletId || !rawSecret) {
    throw new Error('Circle configuration is incomplete. Ensure CIRCLE_API_KEY, CIRCLE_WALLET_ID, and RAW_ENTITY_SECRET are set.')
  }

  const ciphertext = await generateDynamicCiphertext(rawSecret)

  const payload = {
    idempotencyKey: crypto.randomUUID(),
    entitySecretCiphertext: ciphertext,
    amounts: [amountUsdc.toString()],
    destinationAddress: destinationAddress,
    feeLevel: 'HIGH',
    walletId: walletId,
    tokenId: 'ef87c8c3-85de-598a-af50-c5135eecfa74' // Arc Testnet USDC Token ID
  }

  const response = await fetch('https://api.circle.com/v1/w3s/developer/transactions/transfer', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const result = await response.json()

  if (!response.ok) {
    console.error('CIRCLE API ERROR RESPONSE:', JSON.stringify(result, null, 2))
    throw new Error(JSON.stringify(result) || 'Circle API transaction failed')
  }

  return result.data.id
}
