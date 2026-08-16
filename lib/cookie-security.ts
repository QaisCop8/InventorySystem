import { headers } from "next/headers"

/**
 * Secure cookies are mandatory on HTTPS but are rejected by browsers on a raw
 * LAN HTTP origin (for example http://192.168.1.20:5000). Respect the protocol
 * reported by the reverse proxy instead of assuming every production build is HTTPS.
 */
export async function shouldUseSecureCookies(): Promise<boolean> {
  const requestHeaders = await headers()
  const forwarded = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase()
  if (forwarded) return forwarded === "https"
  const protocol = requestHeaders.get("x-forwarded-protocol")?.toLowerCase()
  if (protocol) return protocol === "https"
  const origin = requestHeaders.get("origin") || requestHeaders.get("referer")
  if (origin) {
    try { return new URL(origin).protocol === "https:" } catch { /* malformed proxy header */ }
  }
  return false
}
