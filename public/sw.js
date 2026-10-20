const CACHE_NAME = "shamel-app-v4"
const APP_SHELL = ["/", "/mobile", "/manifest.json", "/icon-192.jpg"]

// حفظ كل ملفات الواجهة المبنية مسبقاً (قائمتها من /api/offline/assets) — بدونها لا يعمل دون اتصال إلا ما فُتح
// سابقاً متصلاً، فيفشل تحميل شاشة/نافذة لم تُفتح منذ آخر نشر ("Failed to load chunk"). يتخطّى المحفوظ، 6 طلبات معاً.
let precaching = null
async function precacheAppAssets() {
  if (precaching) return precaching
  precaching = (async () => {
    try {
      const response = await fetch("/api/offline/assets", { cache: "no-store" })
      if (!response.ok) return
      const { urls = [] } = await response.json()
      const cache = await caches.open(CACHE_NAME)
      const queue = urls.filter((url) => typeof url === "string" && url.startsWith("/_next/static/"))
      const worker = async () => {
        while (queue.length) {
          const url = queue.shift()
          if (await cache.match(url)) continue
          try {
            const asset = await fetch(url)
            if (asset.ok) await cache.put(url, asset)
          } catch { /* دون اتصال أثناء الحفظ: يُكمَل في المرة القادمة */ }
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker))
    } catch { /* دون اتصال */ } finally {
      precaching = null
    }
  })()
  return precaching
}

// API responses depend on the signed-in user and must never be pre-cached.
// Cache shell resources independently so one unavailable URL cannot reject
// the entire service-worker installation (as cache.addAll would do).
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)

      await Promise.allSettled(
        APP_SHELL.map(async (url) => {
          const response = await fetch(url, { cache: "reload" })
          if (response.ok) await cache.put(url, response)
        }),
      )

      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.filter((name) => name.startsWith("shamel-app-") && name !== CACHE_NAME).map((name) => caches.delete(name)))
      await self.clients.claim()
      // في الخلفية — لا يؤخر تفعيل العامل
      void precacheAppAssets()
    })(),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME)
            await cache.put(request, response.clone())
          }
          return response
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(url.pathname.startsWith("/mobile") ? "/mobile" : "/")) || Response.error()),
    )
    return
  }

  // Persist lazy-loaded cashier chunks as well as the initial application assets.
  if (!["script", "style", "font", "image", "audio"].includes(request.destination)) return
  event.respondWith((async () => {
    const cached = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }))
    if (cached) return cached
    try {
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    } catch {
      // دون اتصال وغير محفوظ: فشل هادئ بدل خطأ "Uncaught (in promise) Failed to fetch" في sw.js
      return new Response("", { status: 504, statusText: "Offline" })
    }
  })())
})

// The first page can load before the worker takes control. Cache its already
// downloaded bundles too, so its first offline reload can boot.
self.addEventListener("message", (event) => {
  // الكاشير (نقطة تعمل دون اتصال) يطلب حفظ كل ملفات الواجهة — يلتقط ملفات أي نشر جديد
  if (event.data?.type === "PRECACHE_APP") { event.waitUntil(precacheAppAssets()); return }
  if (event.data?.type !== "CACHE_ASSETS") return
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await Promise.allSettled((event.data.urls || []).map(async (value) => {
      const url = new URL(value, self.location.origin)
      if (url.origin !== self.location.origin || !url.pathname.startsWith("/_next/static/")) return
      const response = await fetch(url.href)
      if (response.ok) await cache.put(url.href, response)
    }))
  })())
})
