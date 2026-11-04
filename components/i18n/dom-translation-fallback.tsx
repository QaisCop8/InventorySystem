"use client"

import { useEffect } from "react"
import { isEnglish, translateText } from "@/lib/i18n"

// شبكة أمان للإنجليزية: نص عربي يظهر على الشاشة ولم يمر بـ tr() (تسميات محفوظة في مصفوفات/أزواج، رؤوس أعمدة
// شبكات Wijmo المرسومة خارج React...) يُترجم هنا من القاموس نفسه. يغيّر نص العرض فقط: لا يلمس قيم الحقول
// (input/textarea/contenteditable) ولا البيانات المرسلة للخادم. النص غير الموجود في القاموس يبقى كما هو.
const ARABIC = /[؀-ۿ]/
const ATTRIBUTES = ["placeholder", "title", "aria-label"]
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "NOSCRIPT"])

function skipped(element: Element | null) {
  for (let current = element; current; current = current.parentElement) {
    if (SKIP_TAGS.has(current.tagName) || (current as HTMLElement).isContentEditable || current.hasAttribute("data-no-translate")) return true
  }
  return false
}

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.nodeValue || ""
    if (!ARABIC.test(value) || skipped(node.parentElement)) return
    const translated = translateText(value.trim())
    if (translated !== value.trim()) node.nodeValue = value.replace(value.trim(), translated)
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const element = node as Element
  if (SKIP_TAGS.has(element.tagName) && element.tagName !== "INPUT" && element.tagName !== "TEXTAREA") return
  for (const attribute of ATTRIBUTES) {
    const value = element.getAttribute(attribute)
    if (value && ARABIC.test(value)) {
      const translated = translateText(value)
      if (translated !== value) element.setAttribute(attribute, translated)
    }
  }
  if (SKIP_TAGS.has(element.tagName)) return
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current.nodeType === Node.TEXT_NODE) translateNode(current)
    else for (const attribute of ATTRIBUTES) {
      const value = (current as Element).getAttribute(attribute)
      if (value && ARABIC.test(value)) {
        const translated = translateText(value)
        if (translated !== value) (current as Element).setAttribute(attribute, translated)
      }
    }
  }
}

export function DomTranslationFallback() {
  useEffect(() => {
    if (!isEnglish()) return
    translateNode(document.body)
    const pending = new Set<Node>()
    let scheduled = false
    const flush = () => {
      scheduled = false
      const nodes = [...pending]
      pending.clear()
      for (const node of nodes) if (node.isConnected) translateNode(node)
    }
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") pending.add(mutation.target)
        else if (mutation.type === "attributes") pending.add(mutation.target)
        else mutation.addedNodes.forEach((node) => pending.add(node))
      }
      if (!scheduled && pending.size) {
        scheduled = true
        requestAnimationFrame(flush)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES })
    return () => observer.disconnect()
  }, [])
  return null
}
