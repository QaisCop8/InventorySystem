"use client"

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Camera, Loader2, X } from "lucide-react"
import { tr, appDir } from "@/lib/i18n"

/**
 * قراءة الباركود بكاميرا الجهاز (الجوال/التابلت) — 2026-11-21.
 * BarcodeDetector الأصلي في المتصفح (أندرويد كروم/WebView) أولاً لأنه الأسرع، وإلا @zxing/browser (آيفون/سفاري).
 * الكاميرا الخلفية، وتُغلق فور قراءة أول باركود وتعيده عبر onDetected.
 */
export function CameraBarcodeScanner({ open, onClose, onDetected }: { open: boolean; onClose: () => void; onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState("")
  const [starting, setStarting] = useState(true)
  const detectedRef = useRef(onDetected)
  detectedRef.current = onDetected

  useEffect(() => {
    if (!open) return
    let stopped = false
    let stream: MediaStream | null = null
    let frame = 0
    let zxingControls: { stop: () => void } | null = null
    setError("")
    setStarting(true)
    const finish = (code: string) => {
      if (stopped || !code) return
      stopped = true
      try { navigator.vibrate?.(60) } catch { /* غير مدعوم */ }
      detectedRef.current(code.trim())
    }
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(tr("الكاميرا غير متاحة في هذا المتصفح (تحتاج اتصال آمن https)"))
      const video = videoRef.current
      if (!video) return
      const Detector = (window as any).BarcodeDetector
      if (Detector) {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        if (stopped) return
        video.srcObject = stream
        await video.play().catch(() => undefined)
        setStarting(false)
        const formats: string[] = await Detector.getSupportedFormats?.().catch(() => []) || []
        const detector = new Detector(formats.length ? { formats } : undefined)
        let busy = false
        const tick = async () => {
          if (stopped) return
          if (!busy && video.readyState >= 2) {
            busy = true
            try {
              const codes = await detector.detect(video)
              if (codes?.[0]?.rawValue) { finish(String(codes[0].rawValue)); return }
            } catch { /* إطار غير صالح */ }
            busy = false
          }
          frame = requestAnimationFrame(() => void tick())
        }
        void tick()
        return
      }
      const { BrowserMultiFormatReader } = await import("@zxing/browser")
      if (stopped) return
      const reader = new BrowserMultiFormatReader()
      zxingControls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video, (result) => {
        if (result) finish(result.getText())
      })
      if (stopped) zxingControls.stop()
      setStarting(false)
    }
    start().catch((reason) => {
      setStarting(false)
      const name = reason?.name
      setError(name === "NotAllowedError" ? tr("لم يُسمح باستخدام الكاميرا — اسمح بها من إعدادات المتصفح") : name === "NotFoundError" ? tr("لا توجد كاميرا في هذا الجهاز") : reason instanceof Error ? reason.message : tr("تعذر تشغيل الكاميرا"))
    })
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      zxingControls?.stop()
      stream?.getTracks().forEach((track) => track.stop())
      const video = videoRef.current
      if (video?.srcObject) {
        ;(video.srcObject as MediaStream).getTracks?.().forEach((track) => track.stop())
        video.srcObject = null
      }
    }
  }, [open])

  if (!open) return null
  return (
    <div dir={appDir()} role="dialog" aria-modal="true" aria-label={tr("قراءة الباركود بالكاميرا")} className="fixed inset-0 z-[300] flex flex-col bg-black/90 text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-black"><Camera className="h-5 w-5" />{tr("وجّه الكاميرا نحو الباركود")}</span>
        <button type="button" onClick={onClose} aria-label={tr("إغلاق")} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 hover:bg-white/25"><X className="h-5 w-5" /></button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        {/* إطار التصويب */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative h-40 w-[78%] max-w-md rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
            <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-rose-500" />
          </div>
        </div>
        {starting && !error && <div className="absolute inset-0 grid place-items-center"><Loader2 className="h-9 w-9 animate-spin" /></div>}
        {error && <div className="absolute inset-x-4 bottom-6 rounded-xl bg-rose-600 px-4 py-3 text-center text-sm font-bold">{error}</div>}
      </div>
    </div>
  )
}

/** جهاز لمس (جوال/تابلت) — مؤشر خشن */
export const isTouchDevice = () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent))

/**
 * حقل يأخذ التركيز تلقائياً دون فتح لوحة مفاتيح الجوال: inputMode="none" حتى يلمسه المستخدم بنفسه،
 * فتعمل قارئات الباركود ولوحة الأرقام في الشاشة ولا تغطي لوحة المفاتيح الشاشة.
 */
export function useNoAutoKeyboard(mode: "text" | "decimal" | "numeric" = "text") {
  const [touch, setTouch] = useState(false)
  const [userTapped, setUserTapped] = useState(false)
  useEffect(() => { setTouch(isTouchDevice()) }, [])
  return {
    touch,
    props: {
      inputMode: (touch && !userTapped ? "none" : mode) as "none" | "text" | "decimal" | "numeric",
      // الحقل مركّز أصلاً بلا لوحة مفاتيح: نزيل التركيز فيعيده اللمس نفسه مع inputMode العادي فتظهر اللوحة
      onPointerDown: (event: ReactPointerEvent<HTMLInputElement>) => {
        if (!touch) return
        if (document.activeElement === event.currentTarget) event.currentTarget.blur()
        setUserTapped(true)
      },
      onBlur: () => setUserTapped(false),
    },
  }
}
