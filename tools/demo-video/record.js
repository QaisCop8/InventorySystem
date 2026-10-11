// تسجيل فيديو عرض حقيقي للنظام (1920×1080، MP4) بالتنقل الفعلي داخل الشاشات مع عناوين عربية ومؤشر ماوس ظاهر.
// الاستخدام (PowerShell) من مجلد tools/demo-video بعد تشغيل النظام (npm run dev):
//   $env:DEMO_USER="admin"; $env:DEMO_PASS="****"; node record.js
// متغيرات اختيارية: DEMO_URL (افتراضي http://localhost:5000) · DEMO_BRAND · DEMO_TAGLINE · DEMO_CONTACT
//   DEMO_ONLY="pos-cashier,shifts" لتسجيل مشاهد محددة فقط · DEMO_HEADED=1 لمشاهدة المتصفح أثناء التسجيل
// ضع ملف music.mp3 بجانب السكربت لإضافة موسيقى خلفية تلقائياً.

const fs = require("fs")
const path = require("path")
const os = require("os")
const { spawnSync } = require("child_process")
const { chromium } = require("playwright")
const ffmpeg = require("ffmpeg-static")
const scenes = require("./scenes")

const BASE = (process.env.DEMO_URL || "http://localhost:5000").replace(/\/$/, "")
const USER = process.env.DEMO_USER
const PASS = process.env.DEMO_PASS
const BRAND = process.env.DEMO_BRAND || "نظام إدارة المخزون والطلبيات"
const TAGLINE = process.env.DEMO_TAGLINE || "نظام ERP عربي متكامل: مبيعات، محاسبة، مخزون، موارد بشرية وذكاء اصطناعي"
const CONTACT = process.env.DEMO_CONTACT || ""
const ONLY = (process.env.DEMO_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean)
const W = 1920, H = 1080, SIDEBAR = 360

if (!USER || !PASS) { console.error("حدد DEMO_USER و DEMO_PASS (مستخدم عرض بصلاحيات القراءة يفضَّل)"); process.exit(1) }

// متصفح Chromium المخزّن مسبقاً على هذا الجهاز إن وُجد، وإلا متصفح Playwright الافتراضي (npx playwright install chromium)
const cachedChrome = path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe")
const chromePath = process.env.DEMO_CHROME || (fs.existsSync(cachedChrome) ? cachedChrome : undefined)
const outDir = path.join(__dirname, "out")
const framesDir = path.join(outDir, "frames")
fs.rmSync(framesDir, { recursive: true, force: true })
fs.mkdirSync(framesDir, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ── طبقة العرض داخل الصفحة: مؤشر ماوس، شريط عنوان، بطاقات فصول ──
const overlayScript = () => {
  const css = `
    nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }
    #__demo_cursor { position: fixed; z-index: 2147483647; width: 26px; height: 26px; pointer-events: none; transform: translate(-4px,-3px); transition: transform .08s; left: -50px; top: -50px; }
    #__demo_cursor svg { width: 100%; height: 100%; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    #__demo_cursor.down { transform: translate(-4px,-3px) scale(.85); }
    .__demo_ripple { position: fixed; z-index: 2147483646; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 3px solid rgba(16,185,129,.9); pointer-events: none; animation: __demo_rip .55s ease-out forwards; }
    @keyframes __demo_rip { to { transform: scale(4.5); opacity: 0; } }
    #__demo_caption { position: fixed; z-index: 2147483645; left: 40px; right: ${360 + 40}px; bottom: 40px; display: flex; justify-content: center; pointer-events: none; direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif; }
    #__demo_caption .box { display: flex; align-items: stretch; gap: 18px; max-width: 1100px; padding: 18px 30px 18px 26px; border-radius: 22px; background: linear-gradient(135deg, rgba(15,23,42,.94), rgba(6,78,59,.92)); color: #fff; box-shadow: 0 25px 60px -15px rgba(0,0,0,.55); opacity: 0; transform: translateY(30px); transition: all .55s cubic-bezier(.2,.8,.2,1); }
    #__demo_caption.show .box { opacity: 1; transform: none; }
    #__demo_caption .bar { width: 6px; border-radius: 6px; background: linear-gradient(#34d399, #14b8a6); }
    #__demo_caption .t { font-size: 34px; font-weight: 800; line-height: 1.25; }
    #__demo_caption .s { font-size: 22px; opacity: .88; margin-top: 4px; line-height: 1.5; }
    #__demo_card { position: fixed; inset: 0; z-index: 2147483646; display: flex; flex-direction: column; align-items: center; justify-content: center; direction: rtl; text-align: center; font-family: 'Segoe UI', Tahoma, sans-serif; color: #fff;
      background: radial-gradient(circle at 30% 20%, #10b981 0%, transparent 45%), radial-gradient(circle at 80% 85%, #0ea5e9 0%, transparent 40%), linear-gradient(135deg, #022c22, #0f172a 60%, #082f49); opacity: 0; pointer-events: none; transition: opacity .7s; }
    #__demo_card.show { opacity: 1; }
    #__demo_card .k { font-size: 26px; letter-spacing: 6px; color: #6ee7b7; font-weight: 700; margin-bottom: 18px; opacity: 0; transform: translateY(15px); transition: all .7s .15s; }
    #__demo_card .t { font-size: 84px; font-weight: 900; line-height: 1.2; max-width: 1500px; opacity: 0; transform: translateY(25px); transition: all .8s .3s; }
    #__demo_card .s { font-size: 34px; margin-top: 22px; color: #cbd5e1; max-width: 1300px; line-height: 1.6; opacity: 0; transform: translateY(25px); transition: all .8s .5s; }
    #__demo_card .line { width: 0; height: 5px; border-radius: 5px; margin-top: 34px; background: linear-gradient(90deg, #34d399, #38bdf8); transition: width 1s .7s; }
    #__demo_card.show .k, #__demo_card.show .t, #__demo_card.show .s { opacity: 1; transform: none; }
    #__demo_card.show .line { width: 260px; }
  `
  const ensure = () => {
    if (document.getElementById("__demo_style") || !document.body) return
    const style = document.createElement("style"); style.id = "__demo_style"; style.textContent = css
    const cursor = document.createElement("div"); cursor.id = "__demo_cursor"
    cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.5-3.5 6.5z" fill="#fff" stroke="#0f172a" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    const caption = document.createElement("div"); caption.id = "__demo_caption"
    caption.innerHTML = '<div class="box"><div class="bar"></div><div><div class="t"></div><div class="s"></div></div></div>'
    const card = document.createElement("div"); card.id = "__demo_card"
    card.innerHTML = '<div class="k"></div><div class="t"></div><div class="s"></div><div class="line"></div>'
    document.documentElement.append(style, card, caption, cursor)
    const last = window.__demoLastPointer
    if (last) { cursor.style.left = last[0] + "px"; cursor.style.top = last[1] + "px" }
  }
  document.addEventListener("mousemove", (e) => {
    ensure(); window.__demoLastPointer = [e.clientX, e.clientY]
    const c = document.getElementById("__demo_cursor"); if (c) { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px" }
  }, true)
  document.addEventListener("mousedown", (e) => {
    ensure(); document.getElementById("__demo_cursor")?.classList.add("down")
    const r = document.createElement("div"); r.className = "__demo_ripple"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px"
    document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600)
  }, true)
  document.addEventListener("mouseup", () => document.getElementById("__demo_cursor")?.classList.remove("down"), true)
  window.__demo = {
    caption(t, s) { ensure(); const c = document.getElementById("__demo_caption"); c.querySelector(".t").textContent = t; c.querySelector(".s").textContent = s || ""; c.classList.add("show") },
    hideCaption() { document.getElementById("__demo_caption")?.classList.remove("show") },
    card(k, t, s) { ensure(); const c = document.getElementById("__demo_card"); c.querySelector(".k").textContent = k || ""; c.querySelector(".t").textContent = t; c.querySelector(".s").textContent = s || ""; c.classList.remove("show"); void c.offsetWidth; c.classList.add("show") },
    hideCard() { document.getElementById("__demo_card")?.classList.remove("show") },
  }
  document.addEventListener("DOMContentLoaded", ensure)
}

;(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: !process.env.DEMO_HEADED, args: [`--window-size=${W},${H}`, "--hide-scrollbars", "--force-device-scale-factor=1"] })
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: "ar", colorScheme: "light" })
  await context.addInitScript(overlayScript)
  const page = await context.newPage()
  page.on("dialog", (d) => d.dismiss().catch(() => {})) // أي تأكيد (حذف/خروج...) يُلغى — أمان للبيانات
  page.setDefaultTimeout(15000)

  // ── تسجيل الإطارات عبر CDP screencast ──
  const cdp = await context.newCDPSession(page)
  const frames = []
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = path.join(framesDir, `f${String(frames.length).padStart(6, "0")}.jpg`)
    fs.writeFileSync(file, Buffer.from(data, "base64"))
    frames.push({ file, ts: metadata.timestamp })
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {})
  })
  const startRec = () => cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 })

  const demo = (fn, ...args) => page.evaluate(([fn, args]) => window.__demo && window.__demo[fn](...args), [fn, args]).catch(() => {})
  let pointer = [W / 2, H / 2]
  const moveTo = async (x, y, steps = 28) => { await page.mouse.move(x, y, { steps }); pointer = [x, y] }
  const moveToLocator = async (loc) => {
    const box = await loc.boundingBox(); if (!box) return false
    await moveTo(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20)); await wait(180); return true
  }
  const clickLocator = async (loc) => { if (!(await moveToLocator(loc))) return false; await page.mouse.down(); await wait(70); await page.mouse.up(); return true }
  const contentCenter = () => [(W - SIDEBAR) / 2, H / 2]
  const settle = async (ms = 1200) => { await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {}); await wait(ms) }

  // عناصر ظاهرة داخل منطقة المحتوى (خارج القائمة الجانبية اليمنى)
  const visibleInContent = async (selector, limit) => {
    const all = page.locator(selector)
    const n = Math.min(await all.count(), 60)
    const found = []
    for (let i = 0; i < n && found.length < limit * 3; i++) {
      const loc = all.nth(i)
      const box = await loc.boundingBox().catch(() => null)
      if (box && box.width > 8 && box.height > 8 && box.x + box.width < W - SIDEBAR && box.y > 60 && box.y < H - 160) found.push(loc)
    }
    if (found.length <= limit) return found
    const step = found.length / limit
    return Array.from({ length: limit }, (_, i) => found[Math.floor(i * step)])
  }

  const runAction = async (a) => {
    if (a.do === "wait") return wait(a.ms || 1000)
    if (a.do === "scroll") {
      const [x, y] = contentCenter(); await moveTo(x, y, 20)
      const steps = 24
      for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, a.amount / steps); await wait(35) }
      return wait(600)
    }
    if (a.do === "hover") {
      for (const loc of await visibleInContent(a.selector, a.count || 3)) { await moveToLocator(loc); await wait(650) }
      return
    }
    if (a.do === "type") {
      const [loc] = await visibleInContent(a.selector, 1)
      if (!loc) return log("   (لم يُعثر على حقل الكتابة)")
      await clickLocator(loc); await wait(300)
      await loc.pressSequentially(a.text, { delay: 55 })
      if (a.submit) { await wait(500); await page.keyboard.press("Enter") }
    }
  }

  const sidebar = () => page.locator('[aria-label="القائمة الرئيسية"]').first()
  const openSection = async (scene) => {
    let done = false
    const search = sidebar().locator('input[placeholder="ابحث في القائمة..."]')
    if (scene.menu && (await search.isVisible().catch(() => false))) {
      await clickLocator(search); await search.fill("")
      await search.pressSequentially(scene.menu, { delay: 65 }); await wait(700)
      const link = sidebar().locator(`a[href="/?section=${scene.section}"]`).first()
      if (await link.isVisible().catch(() => false)) { await clickLocator(link); done = true }
      await wait(300); await search.fill("").catch(() => {})
    }
    if (!done) await page.goto(`${BASE}/?section=${scene.section}`, { waitUntil: "domcontentloaded" })
    await settle(1400)
  }

  try {
    log("فتح النظام", BASE)
    await page.goto(BASE, { waitUntil: "domcontentloaded" })
    await settle(800)
    await startRec()

    // بطاقة الافتتاح
    await demo("card", "ERP", BRAND, TAGLINE); await wait(5200); await demo("hideCard"); await wait(900)

    // تسجيل الدخول
    const username = page.locator("#login-username")
    if (await username.isVisible().catch(() => false)) {
      await demo("caption", "تسجيل دخول آمن", "دخول متعدد الشركات بصلاحيات حسب الدور الوظيفي")
      await clickLocator(username); await username.pressSequentially(USER, { delay: 90 })
      const password = page.locator("#login-password")
      await clickLocator(password); await password.pressSequentially(PASS, { delay: 70 })
      await wait(400); await clickLocator(page.locator('button[type="submit"]').first())
      await sidebar().waitFor({ state: "visible", timeout: 60000 }).catch(async () => {
        await page.screenshot({ path: path.join(outDir, "login-failed.png") })
        throw new Error("لم تظهر القائمة بعد تسجيل الدخول — راجع out/login-failed.png (بيانات الدخول أو اختيار الشركة)")
      })
      await demo("hideCaption"); await settle(1500)
    }

    const list = ONLY.length ? scenes.filter((s) => ONLY.includes(s.section)) : scenes
    for (const [index, scene] of list.entries()) {
      log(`مشهد ${index + 1}/${list.length}:`, scene.section)
      try {
        await demo("hideCaption")
        if (scene.chapter) { await demo("card", `${String(index + 1).padStart(2, "0")}`, scene.chapter.title, scene.chapter.subtitle); await wait(3200); await demo("hideCard"); await wait(800) }
        await openSection(scene)
        await demo("caption", scene.title, scene.subtitle); await wait(900)
        for (const action of scene.actions || []) await runAction(action)
        await wait(1200)
      } catch (error) {
        log("   تخطّي المشهد:", error.message.split("\n")[0])
      }
    }

    await demo("hideCaption")
    await demo("card", "شكراً لمتابعتكم", BRAND, CONTACT || TAGLINE); await wait(6000)
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => {})
    await wait(300)
    await browser.close()
  }

  // ── تجميع الفيديو ──
  if (frames.length < 2) { console.error("لم تُلتقط إطارات"); process.exit(1) }
  const listFile = path.join(outDir, "frames.txt")
  const lines = []
  frames.forEach((f, i) => {
    const next = frames[i + 1]
    const dur = next ? Math.max(0.001, next.ts - f.ts) : 1.5
    lines.push(`file '${f.file.replace(/\\/g, "/")}'`, `duration ${dur.toFixed(4)}`)
  })
  lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, "/")}'`)
  fs.writeFileSync(listFile, lines.join("\n"))
  const total = frames[frames.length - 1].ts - frames[0].ts + 1.5
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")
  const outFile = path.join(outDir, `system-demo-${stamp}.mp4`)
  const music = path.join(__dirname, "music.mp3")
  const args = ["-y", "-f", "concat", "-safe", "0", "-i", listFile]
  if (fs.existsSync(music)) args.push("-stream_loop", "-1", "-i", music)
  args.push("-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart")
  if (fs.existsSync(music)) args.push("-af", `volume=0.35,afade=t=in:d=2,afade=t=out:st=${Math.max(0, total - 3).toFixed(1)}:d=3`, "-c:a", "aac", "-b:a", "192k", "-shortest")
  args.push(outFile)
  log(`ترميز ${frames.length} إطار (${total.toFixed(0)} ثانية)...`)
  const result = spawnSync(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] })
  if (result.status !== 0) { console.error(result.stderr.toString().slice(-2000)); process.exit(1) }
  fs.rmSync(framesDir, { recursive: true, force: true })
  log("✔ الفيديو جاهز:", outFile)
})().catch((error) => { console.error("✖", error.message); process.exit(1) })
