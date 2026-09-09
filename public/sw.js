const CACHE_NAME = "shamel-app-v3"
const APP_SHELL = ["/", "/mobile", "/manifest.json"]

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
      await Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      await self.clients.claim()
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

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)))
})
