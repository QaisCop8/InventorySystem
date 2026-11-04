// إصلاح: الكود المضغوط return"نص" صار returntr("نص") بعد الـ codemod — يُضاف فراغ بعد الكلمة المحجوزة.
import fs from "node:fs"
import { execSync } from "node:child_process"

const files = execSync("git diff --name-only", { encoding: "utf8" }).split("\n").filter((file) => /\.(tsx?|mjs)$/.test(file) && fs.existsSync(file))
const glued = /\b(return|typeof|case|in|of|else|throw|void|yield|await|delete)(tr|trText)\(/g
let fixed = 0
for (const file of files) {
  const source = fs.readFileSync(file, "utf8")
  const out = source.replace(glued, (whole, keyword, name) => { fixed++; return `${keyword} ${name}(` })
  if (out !== source) fs.writeFileSync(file, out)
}
console.log("fixed", fixed)
