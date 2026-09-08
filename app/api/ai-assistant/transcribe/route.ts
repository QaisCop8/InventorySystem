import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ error: "لم يتم إعداد مفتاح Gemini" }, { status: 503 })

    const formData = await request.formData()
    const audio = formData.get("audio")
    if (!(audio instanceof File)) return NextResponse.json({ error: "ملف الصوت مطلوب" }, { status: 400 })
    if (audio.size > 10 * 1024 * 1024) return NextResponse.json({ error: "التسجيل الصوتي طويل جداً" }, { status: 413 })

    const bytes = Buffer.from(await audio.arrayBuffer()).toString("base64")
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "حوّل التسجيل الصوتي إلى نص عربي كما نطقه المستخدم، بدون شرح أو علامات اقتباس." },
            { inline_data: { mime_type: audio.type || "audio/webm", data: bytes } },
          ],
        }],
      }),
    })
    const data = await response.json()
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || "تعذر تحويل الصوت إلى نص" }, { status: 502 })

    const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim()
    if (!text) return NextResponse.json({ error: "لم يتم التعرف على كلام في التسجيل" }, { status: 422 })
    return NextResponse.json({ text })
  } catch (error) {
    console.error("AI transcription error", error)
    return NextResponse.json({ error: "تعذر قراءة التسجيل الصوتي" }, { status: 500 })
  }
}
