// Cloudflare Workers build only, server side (next.config.mjs → CLOUDFLARE_BUILD): Wijmo's React interop
// dynamically imports "react-dom/client" for cell templates. That only runs in the browser; on the server
// the import is never executed, but the Workers bundler must still resolve it.
const unavailable = () => {
  throw new Error("react-dom/client is not available during server rendering")
}
module.exports = { createRoot: unavailable, hydrateRoot: unavailable }
