// Runs after `next build` in the Cloudflare build only (open-next.config.ts → buildCommand), before
// OpenNext bundles the Worker.
//
// Wijmo's React interop (@grapecity/wijmo.react.base) dynamically imports "react-dom/client" to render
// grid cell templates. That only ever runs in the browser, but the import also lands in the server (SSR)
// chunks, where Next's trace does not copy react-dom/client.js, so the Worker bundler fails with
// `Could not resolve "react-dom/client"`. Server chunks never execute it, so it is replaced there with a
// rejected promise. Browser chunks (.next/static) are untouched.
const fs = require("fs")
const path = require("path")

const serverDir = path.join(process.cwd(), ".next", "server")
const pattern = /import\(\s*["']react-dom\/client["']\s*\)/g
const replacement = 'Promise.reject(new Error("react-dom/client is browser-only"))'

let patchedFiles = 0
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(c|m)?js$/.test(entry.name)) {
      const code = fs.readFileSync(full, "utf8")
      if (!pattern.test(code)) continue
      pattern.lastIndex = 0
      fs.writeFileSync(full, code.replace(pattern, replacement))
      patchedFiles++
    }
  }
}

if (!fs.existsSync(serverDir)) {
  console.error("[cloudflare-postbuild] .next/server not found — run next build first")
  process.exit(1)
}
walk(serverDir)
console.log(`[cloudflare-postbuild] replaced server-side import("react-dom/client") in ${patchedFiles} file(s)`)
