export interface PosQueuedSale {
  id: string
  tenantKey: string
  createdAt: string
  payload: Record<string, unknown>
  attempts: number
  lastError?: string
}

const DB_NAME = "shamel-pos-offline"
const DB_VERSION = 1
const CATALOG_STORE = "catalog"
const QUEUE_STORE = "salesQueue"

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CATALOG_STORE)) db.createObjectStore(CATALOG_STORE)
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: "id" })
        store.createIndex("tenantKey", "tenantKey", { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function currentPosTenantKey(userId?: string | null) {
  if (typeof window === "undefined") return "server"
  const tenant = sessionStorage.getItem("active_tenant_db") || localStorage.getItem("active_tenant_db") || "default"
  return `${tenant}:${userId || "anonymous"}`
}

export async function savePosCatalog(tenantKey: string, catalog: unknown) {
  const db = await openDb()
  const tx = db.transaction(CATALOG_STORE, "readwrite")
  tx.objectStore(CATALOG_STORE).put({ catalog, savedAt: new Date().toISOString() }, tenantKey)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadPosCatalog<T>(tenantKey: string): Promise<{ catalog: T; savedAt: string } | null> {
  const db = await openDb()
  const tx = db.transaction(CATALOG_STORE, "readonly")
  const value = await requestValue<any>(tx.objectStore(CATALOG_STORE).get(tenantKey))
  db.close()
  return value || null
}

export async function queuePosSale(sale: PosQueuedSale) {
  const db = await openDb()
  const tx = db.transaction(QUEUE_STORE, "readwrite")
  tx.objectStore(QUEUE_STORE).put(sale)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function listPosSales(tenantKey: string): Promise<PosQueuedSale[]> {
  const db = await openDb()
  const tx = db.transaction(QUEUE_STORE, "readonly")
  const index = tx.objectStore(QUEUE_STORE).index("tenantKey")
  const rows = await requestValue<PosQueuedSale[]>(index.getAll(tenantKey))
  db.close()
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function removePosSale(id: string) {
  const db = await openDb()
  const tx = db.transaction(QUEUE_STORE, "readwrite")
  tx.objectStore(QUEUE_STORE).delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function markPosSaleFailed(sale: PosQueuedSale, error: string) {
  return queuePosSale({ ...sale, attempts: sale.attempts + 1, lastError: error })
}
