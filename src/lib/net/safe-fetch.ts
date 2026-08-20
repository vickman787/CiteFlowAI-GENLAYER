import dns from 'dns'
import { promisify } from 'util'

const lookupAsync = promisify(dns.lookup)

// SSRF Protection: Check if IP is private
export function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length === 4) {
    if (parts[0] === 10) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 127) return true // localhost
    if (parts[0] === 169 && parts[1] === 254) return true // link-local
  }

  if (ip.includes(':')) {
    if (ip === '::1') return true // localhost
    if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true // Unique local
    if (ip.toLowerCase().startsWith('fe80')) return true // Link-local
  }

  return false
}

// Fetch with redirect limit and SSRF protection
export async function safeFetch(targetUrl: string, maxRedirects = 5): Promise<Response> {
  let currentUrl = targetUrl
  let redirects = 0

  while (redirects < maxRedirects) {
    const parsedUrl = new URL(currentUrl)

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Invalid protocol')
    }

    const { address } = await lookupAsync(parsedUrl.hostname)
    if (isPrivateIP(address)) {
      throw new Error(`Access to private IP ${address} is blocked`)
    }

    const response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    })

    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      const location = response.headers.get('location')!
      currentUrl = new URL(location, currentUrl).toString()
      redirects++
    } else {
      return response
    }
  }

  throw new Error('Too many redirects')
}
