// يبني معالج الترحيل من الشامل (NoonERP-ShamelMigration.exe) في launchers/shamel-migration/dist وينسخه إلى public/downloads
// ليُنزَّل من شاشة «ترحيل من الشامل». يحتاج ويندوز (csc.exe من .NET Framework 4). x86: تعريفات ODBC للشامل 32 بت.
// التشغيل: node launchers/shamel-migration/build.mjs
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..")
const dist = join(here, "dist")
mkdirSync(dist, { recursive: true })

const csc = ["Framework64", "Framework"].map((dir) => join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", dir, "v4.0.30319", "csc.exe")).find(existsSync)
if (!csc) throw new Error("csc.exe غير موجود — يلزم ويندوز مع .NET Framework 4")

const name = "NoonERP-ShamelMigration.exe"
const out = join(dist, name)
// يُبنى في ملف مؤقت: نسخة مفتوحة من المعالج تقفل الملف، فيُحدَّث ملف التنزيل على الأقل
const built = join(dist, `${name}.new`)
const icon = join(root, "launchers", "windows", "dist", "noonerp.ico")
execFileSync(csc, ["/nologo", "/target:winexe", "/optimize+", "/platform:x86", ...(existsSync(icon) ? [`/win32icon:${icon}`] : []), `/out:${built}`,
  "/r:System.dll", "/r:System.Data.dll", "/r:System.Windows.Forms.dll", "/r:System.Drawing.dll", "/r:System.Web.Extensions.dll",
  join(here, "ShamelMigration.cs")], { stdio: "inherit" })
const downloads = join(root, "public", "downloads")
mkdirSync(downloads, { recursive: true })
copyFileSync(built, join(downloads, name))
try {
  rmSync(out, { force: true })
  renameSync(built, out)
  console.log(`built ${out}`)
} catch {
  console.warn(`${out} قيد التشغيل — أغلقه وأعد البناء لتحديثه؛ النسخة الجديدة في ${built} و public/downloads`)
}
