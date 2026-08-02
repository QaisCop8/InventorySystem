import JsBarcode from "jsbarcode"

// يستنسخ نمط الطباعة الفعلي بالمشروع (window.open + document.write + print()، انظر
// components/inventory/batch-print-dialog.tsx) لطباعة ملصق باركود لصنف طلبية واحد بعد فحصه بخطوة
// التحميل. الباركود نفسه يُرسَم على canvas غير مرئي عبر jsbarcode ثم يُضمَّن كصورة (لا مكتبة رسم
// باركود حقيقية كانت موجودة بالمشروع سابقاً).
export function printItemBarcode(item: { item_code: string; title: string; qty: number | null; prepared_qty: number | null }) {
  const canvas = document.createElement("canvas")
  JsBarcode(canvas, item.item_code, {
    format: "CODE128",
    displayValue: true,
    fontSize: 14,
    height: 50,
    margin: 4,
  })
  const barcodeDataUrl = canvas.toDataURL("image/png")

  const printContent = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>ملصق الصنف ${item.item_code}</title>
      <style>
        @page { size: 80mm 50mm; margin: 2mm; }
        body {
          font-family: 'Arial', sans-serif;
          margin: 0;
          padding: 2mm;
          direction: rtl;
          text-align: center;
        }
        .label {
          width: 76mm;
          height: 46mm;
          border: 1px solid #000;
          box-sizing: border-box;
          padding: 2mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
        }
        .title { font-weight: bold; font-size: 12px; }
        .qty-row { display: flex; justify-content: space-around; width: 100%; font-size: 10px; }
        img { max-width: 100%; }
      </style>
    </head>
    <body>
      <div class="label">
        <div class="title">${item.title}</div>
        <img src="${barcodeDataUrl}" alt="${item.item_code}" />
        <div class="qty-row">
          <span>الكمية المطلوبة: ${item.qty ?? "-"}</span>
          <span>الكمية المجهزة: ${item.prepared_qty ?? "-"}</span>
        </div>
      </div>
    </body>
    </html>
  `

  const printWindow = window.open("", "_blank")
  if (!printWindow) return
  printWindow.document.write(printContent)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 500)
}
