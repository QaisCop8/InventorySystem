"use client"

// أصوات تنبيه كاشير نقطة البيع (Web Audio — بلا ملفات صوت، تعمل دون اتصال):
//   success   إضافة صنف بنجاح: نغمة قصيرة حادة واحدة
//   notFound  باركود غير موجود: نغمة منخفضة طويلة
//   noPrice   صنف بلا سعر: نغمتان متتاليتان متوسطتان
// سياق صوت واحد مشترك (المتصفح يسمح بتشغيله بعد أول تفاعل للمستخدم — مسح باركود/ضغطة مفتاح).

type Tone = { frequency: number; duration: number; type: OscillatorType; gain: number; delay?: number }

const PATTERNS: Record<"success" | "notFound" | "noPrice", Tone[]> = {
  success: [{ frequency: 1320, duration: 0.07, type: "sine", gain: 0.25 }],
  notFound: [{ frequency: 280, duration: 0.75, type: "square", gain: 0.18 }],
  noPrice: [
    { frequency: 760, duration: 0.13, type: "sawtooth", gain: 0.2 },
    { frequency: 760, duration: 0.13, type: "sawtooth", gain: 0.2, delay: 0.2 },
  ],
}

let context: AudioContext | null = null

function audioContext() {
  if (typeof window === "undefined") return null
  const Ctor = window.AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null
  if (!context) context = new Ctor()
  if (context.state === "suspended") void context.resume().catch(() => undefined)
  return context
}

export function playPosBeep(kind: keyof typeof PATTERNS) {
  try {
    const ctx = audioContext()
    if (!ctx) return
    const start = ctx.currentTime + 0.01
    for (const tone of PATTERNS[kind]) {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      const at = start + (tone.delay || 0)
      oscillator.type = tone.type
      oscillator.frequency.setValueAtTime(tone.frequency, at)
      // تلاشٍ قصير في البداية والنهاية لتجنّب "طقطقة" الصوت
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(tone.gain, at + 0.01)
      gain.gain.setValueAtTime(tone.gain, at + Math.max(0.01, tone.duration - 0.03))
      gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.duration)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(at)
      oscillator.stop(at + tone.duration + 0.02)
    }
  } catch {
    // الصوت تحسين فقط — لا يمنع البيع
  }
}
