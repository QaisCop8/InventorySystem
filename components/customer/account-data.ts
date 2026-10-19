type AccountListCacheEntry = {
  accounts: any[]
  expiresAt: number
}

const ACCOUNT_LIST_CACHE_TTL_MS = 30_000
const accountListCache = new Map<string, AccountListCacheEntry>()
const accountListRequests = new Map<string, Promise<any[]>>()

const storageValue = (key: string) => {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || ""
  } catch {
    return ""
  }
}

const branchScope = () => {
  const raw = storageValue("erp_active_branch")
  if (!raw) return ""
  try {
    return String(JSON.parse(raw)?.id ?? "")
  } catch {
    return ""
  }
}

const cacheKeyFor = (url: string) => {
  const normalizedUrl = new URL(url, window.location.origin).toString()
  const tenant = storageValue("active_tenant_db")
  const user = storageValue("erp_user")
  let userId = ""
  try {
    const parsedUser = JSON.parse(user)
    userId = String(parsedUser?.id ?? parsedUser?.user_id ?? "")
  } catch {
    userId = ""
  }
  return `${normalizedUrl}|tenant=${tenant}|branch=${branchScope()}|user=${userId}`
}

/** Share recent account-list responses between autocomplete fields and their search dialogs. */
export async function getAccountList(url: string, forceRefresh = false): Promise<any[]> {
  const key = cacheKeyFor(url)
  const cached = accountListCache.get(key)
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.accounts

  const pending = accountListRequests.get(key)
  if (pending) return pending

  const request = fetch(new URL(url, window.location.origin).toString(), { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load accounts: ${response.status}`)
      const data = await response.json()
      const accounts = Array.isArray(data) ? data : []
      accountListCache.set(key, { accounts, expiresAt: Date.now() + ACCOUNT_LIST_CACHE_TTL_MS })
      return accounts
    })
    .finally(() => {
      accountListRequests.delete(key)
    })

  accountListRequests.set(key, request)
  return request
}

export function clearAccountListCache() {
  accountListCache.clear()
}
