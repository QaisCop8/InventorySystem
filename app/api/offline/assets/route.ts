import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

// قائمة ملفات الواجهة المبنية (/_next/static) — يحفظها عامل الخدمة (public/sw.js) كلها مسبقاً حتى يعمل الكاشير
// دون اتصال حتى لشاشات/نوافذ لم تُفتح بعد منذ آخر نشر (كان يظهر "Failed to load chunk … .css" دون اتصال).
// أسماء الملفات عامة أصلاً (تُحمَّل بلا تسجيل دخول) فلا حاجة لصلاحية.
export const dynamic = "force-dynamic"

const ASSET_EXTENSIONS = /\.(js|css|woff2?|ttf|otf|png|jpe?g|svg|gif|webp|ico)$/i
const MAX_FILES = 5000

async function walk(dir: string, prefix: string, out: string[]) {
  let entries: import("fs").Dirent[] = []
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return
    // ملفات وضع التطوير لا تُخدَم في الإنتاج
    if (entry.isDirectory()) { if (entry.name !== "development") await walk(path.join(dir, entry.name), `${prefix}/${entry.name}`, out) }
    else if (ASSET_EXTENSIONS.test(entry.name)) out.push(`${prefix}/${entry.name}`)
  }
}

export async function GET() {
  const urls: string[] = []
  // next start: ./.next/static — نسخة standalone (Docker): نفس المسار بجانب server.js
  for (const base of [path.join(process.cwd(), ".next", "static"), path.join(process.cwd(), "static")]) {
    await walk(base, "/_next/static", urls)
    if (urls.length) break
  }
  return NextResponse.json({ urls }, { headers: { "Cache-Control": "no-store" } })
}
