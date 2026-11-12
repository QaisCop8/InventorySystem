// يبني مشغّلَي ويندوز (نافذة WebView2 — مكتبات launchers/windows/sdk من حزمة NuGet Microsoft.Web.WebView2 مضمّنة كموارد): NoonERP-Cashier.exe و NoonERP-Restaurant.exe في launchers/windows/dist، وينسخهما إلى
// public/downloads ليُنزَّلا من الخادم. يحتاج ويندوز (csc.exe من .NET Framework 4) و sharp لصنع الأيقونة.
// التشغيل: node launchers/windows/build.mjs
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..")
const dist = join(here, "dist")
mkdirSync(dist, { recursive: true })

const csc = ["Framework64", "Framework"].map((dir) => join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", dir, "v4.0.30319", "csc.exe")).find(existsSync)
if (!csc) throw new Error("csc.exe غير موجود — يلزم ويندوز مع .NET Framework 4")

// أيقونة ICO بصورة PNG مضمّنة (مدعومة منذ ويندوز فيستا) من أيقونة تطبيق أندرويد
async function writeIcon(target) {
  const sizes = [256, 64, 48, 32, 16]
  const images = await Promise.all(sizes.map((size) => sharp(join(root, "android-app", "assets", "icon.png")).resize(size, size).png().toBuffer()))
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16
    header.writeUInt8(size >= 256 ? 0 : size, entry); header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt8(0, entry + 2); header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(images[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12)
    offset += images[index].length
  })
  writeFileSync(target, Buffer.concat([header, ...images]))
}

// حزمة WebView2 (NuGet Microsoft.Web.WebView2 1.0.4191.47) مستخرجة في launchers/windows/sdk/pkg
const sdk = join(here, "sdk", "pkg")
const core = join(sdk, "lib", "net462", "Microsoft.Web.WebView2.Core.dll")
const winforms = join(sdk, "lib", "net462", "Microsoft.Web.WebView2.WinForms.dll")
if (!existsSync(core)) throw new Error("WebView2 SDK مفقود: نزّل microsoft.web.webview2.1.0.4191.47.nupkg من nuget.org واستخرجه إلى launchers/windows/sdk/pkg")

const icon = join(dist, "noonerp.ico")
await writeIcon(icon)

const downloads = join(root, "public", "downloads")
mkdirSync(downloads, { recursive: true })
for (const [name, defines] of [["NoonERP-Cashier.exe", []], ["NoonERP-Restaurant.exe", ["/define:RESTAURANT"]]]) {
  const out = join(dist, name)
  // يُبنى في ملف مؤقت: نسخة مفتوحة من المشغّل تقفل الملف، فيُحدَّث ملف التنزيل على الأقل مع تنبيه
  const built = join(dist, `${name}.new`)
  execFileSync(csc, ["/nologo", "/target:winexe", "/optimize+", "/platform:anycpu", `/win32icon:${icon}`, `/out:${built}`,
    "/r:System.Windows.Forms.dll", "/r:System.Drawing.dll", "/r:System.Web.Extensions.dll", `/r:${core}`, `/r:${winforms}`,
    `/resource:${core},Microsoft.Web.WebView2.Core.dll`, `/resource:${winforms},Microsoft.Web.WebView2.WinForms.dll`,
    `/resource:${join(sdk, "runtimes", "win-x64", "native", "WebView2Loader.dll")},WebView2Loader.x64.dll`,
    `/resource:${join(sdk, "runtimes", "win-x86", "native", "WebView2Loader.dll")},WebView2Loader.x86.dll`,
    ...defines, join(here, "Launcher.cs"), join(here, "Printing.cs")], { stdio: "inherit" })
  copyFileSync(built, join(downloads, name))
  try {
    renameSync(built, out)
    console.log(`built ${out}`)
  } catch {
    console.warn(`${out} قيد التشغيل — أغلقه وأعد البناء لتحديثه؛ النسخة الجديدة في ${built} و public/downloads`)
  }
}
