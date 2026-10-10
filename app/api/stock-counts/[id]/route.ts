import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import {
  STOCK_COUNT_STATUS,
  insertCountLine,
  jsonError,
  lineDifference,
  lineLotLabel,
  loadCountHeader,
  loadProductMeta,
  quantityFromPieces,
  refreshSystemQuantities,
  requireStockCountPermission,
  scopeOf,
  variantLabels,
  warehouseBalancesAt,
  type ProductMeta,
} from "@/lib/stock-counts"
import { lotBalances, lotKey, normalizeExpiry } from "@/lib/stock-lots"
import {
  hasRequiredDimensions,
  isMeasuredProduct,
  measurementRequiresHeight,
  measurementRequiresLength,
  measurementRequiresWidth,
} from "@/lib/measurement-formula"
import {
  STOCK_IN_VCH_TYPE,
  STOCK_OUT_VCH_TYPE,
  buildVoucherCode,
  getStockVoucherNumberSettings,
  nextVoucherSequence,
  resolveVoucherBookName,
} from "@/app/api/stock-vouchers/_lib"
import { POST as createStockVoucher, PUT as updateStockVoucher } from "@/app/api/stock-vouchers/route"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> | { id: string } }
const countIdOf = async (context: RouteContext) => Number((await context.params).id)
const round6 = (value: number) => Math.round(value * 1e6) / 1e6
const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}
const positiveDimension = (value: unknown) => (Number(value) > 0 ? round6(Number(value)) : null)

async function productAttributes(productId: number) {
  const exists = Boolean(((await sql`SELECT to_regclass('product_atrributes_values_tbl') IS NOT NULL AS ok`) as any[])[0]?.ok)
  if (!exists) return []
  const rows = (await sql`
    SELECT pav.id, a.id AS attribute_id, a.name AS attribute_name, av.name AS value_name
    FROM product_atrributes_values_tbl pav
    JOIN attributes_tbl a ON a.id = pav.attr_id
    JOIN attribute_values_tbl av ON av.id = pav.value_id
    WHERE pav.product_id = ${productId}
    ORDER BY a.name, av.name
  `) as any[]
  const groups = new Map<number, { id: number; name: string; values: { id: number; name: string }[] }>()
  for (const row of rows) {
    const group = groups.get(Number(row.attribute_id)) || { id: Number(row.attribute_id), name: String(row.attribute_name), values: [] as { id: number; name: string }[] }
    group.values.push({ id: Number(row.id), name: row.value_name })
    groups.set(Number(row.attribute_id), group)
  }
  return [...groups.values()]
}

// GET: الوثيقة + أسطرها (+ سيريالاتها). جرد أعمى قيد الجرد ⇐ لا تُرسَل الدفترية ولا التكلفة ولا السيريالات
// الدفترية غير المجرودة إطلاقاً (لا مجرد إخفاء بالواجهة).
// ?item_options=ID ⇐ بيانات صنف لإضافة دفعة/مقاس/متغير أثناء الجرد.
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const permission = await requireStockCountPermission(request, "view")
    if (!permission.ok) return permission.response
    const countId = await countIdOf(context)
    const header = await loadCountHeader(countId)
    if (!header) return jsonError("وثيقة الجرد غير موجودة", 404)

    const optionsFor = Number(request.nextUrl.searchParams.get("item_options"))
    if (optionsFor > 0) {
      const [product] = await loadProductMeta({ productIds: [optionsFor] })
      if (!product) return jsonError("الصنف غير موجود", 404)
      return NextResponse.json({ product, attributes: await productAttributes(optionsFor) })
    }

    const hideSystem = Boolean(header.blind) && Number(header.status) === STOCK_COUNT_STATUS.COUNTING
    const lines = (await sql`
      SELECT * FROM stock_count_items WHERE count_id = ${countId}
      ORDER BY product_code, product_name, expiry_date NULLS FIRST, batch_no NULLS FIRST, variant_label NULLS FIRST, length NULLS FIRST, width NULLS FIRST
    `) as any[]
    const serials = (await sql`SELECT line_id, serial, in_system, counted FROM stock_count_serials WHERE count_id = ${countId} ORDER BY serial`) as any[]
    const productIds = [...new Set(lines.filter((line) => isMeasuredProduct(line.measurment_id)).map((line) => Number(line.item_id)))]
    const measured = productIds.length ? await loadProductMeta({ productIds }) : []
    const shaped = lines.map((line) => {
      const product = measured.find((entry) => entry.id === Number(line.item_id))
      const lineSerials = serials
        .filter((serial) => Number(serial.line_id) === Number(line.id))
        .filter((serial) => !hideSystem || serial.counted)
        .map((serial) => ({ serial: serial.serial, in_system: hideSystem ? null : Boolean(serial.in_system), counted: Boolean(serial.counted) }))
      return {
        id: Number(line.id),
        item_id: Number(line.item_id),
        product_code: line.product_code,
        product_name: line.product_name,
        barcode: line.barcode,
        unit_name: line.unit_name,
        system_qty: hideSystem ? null : Number(line.system_qty),
        counted_qty: line.counted_qty == null ? null : Number(line.counted_qty),
        unit_cost: hideSystem ? null : Number(line.unit_cost),
        has_serial: Boolean(line.has_serial),
        has_expiry: Boolean(line.has_expiry),
        has_batch: Boolean(line.has_batch),
        has_variants: Boolean(line.has_variants),
        measurment_id: Number(line.measurment_id || 1),
        product_length: product?.length ?? 0,
        product_width: product?.width ?? 0,
        product_density: product?.density ?? 0,
        expiry_date: normalizeExpiry(line.expiry_date),
        batch_no: line.batch_no || "",
        variant_label: line.variant_label || "",
        length: line.length == null ? null : Number(line.length),
        width: line.width == null ? null : Number(line.width),
        height: line.height == null ? null : Number(line.height),
        system_pieces: hideSystem || line.system_pieces == null ? null : Number(line.system_pieces),
        counted_pieces: line.counted_pieces == null ? null : Number(line.counted_pieces),
        manual: Boolean(line.manual),
        note: line.note || "",
        serials: line.has_serial ? lineSerials : [],
      }
    })
    return NextResponse.json({ ...header, system_hidden: hideSystem, lines: shaped }, { headers: { "Cache-Control": "no-store" } })
  } catch (error: any) {
    console.error("Error loading stock count:", error)
    return jsonError(error?.message || "تعذر تحميل وثيقة الجرد", 500)
  }
}

// يُعيد حساب الكمية المجرودة لسطر سيريال = عدد السيريالات المجرودة
async function syncSerialCount(lineId: number, userId: string) {
  await sql`
    UPDATE stock_count_items SET counted_qty = (SELECT COUNT(*) FROM stock_count_serials WHERE line_id = ${lineId} AND counted),
      counted_by = ${userId}, counted_at = CURRENT_TIMESTAMP
    WHERE id = ${lineId}
  `
}

async function setSerial(countId: number, lineId: number, serial: string, counted: boolean, userId: string) {
  if (counted) {
    await sql`
      INSERT INTO stock_count_serials (count_id, line_id, serial, in_system, counted, counted_at)
      VALUES (${countId}, ${lineId}, ${serial}, false, true, CURRENT_TIMESTAMP)
      ON CONFLICT (line_id, serial) DO UPDATE SET counted = true, counted_at = CURRENT_TIMESTAMP
    `
  } else {
    await sql`UPDATE stock_count_serials SET counted = false, counted_at = NULL WHERE line_id = ${lineId} AND serial = ${serial}`
    await sql`DELETE FROM stock_count_serials WHERE line_id = ${lineId} AND serial = ${serial} AND in_system = false`
  }
  await syncSerialCount(lineId, userId)
}

// PATCH: { action, ... } — كل عمليات الوثيقة
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const data = await request.json().catch(() => ({}))
    const action = String(data.action || "")
    const permissionAction = action === "post" ? "post" : "edit"
    const permission = await requireStockCountPermission(request, permissionAction)
    if (!permission.ok) return permission.response
    const userId = String((permission as any).user?.user_id ?? "")

    const countId = await countIdOf(context)
    const header = await loadCountHeader(countId)
    if (!header) return jsonError("وثيقة الجرد غير موجودة", 404)
    const status = Number(header.status)
    const scope = scopeOf(header)
    const counting = status === STOCK_COUNT_STATUS.COUNTING
    const notCounting = () => jsonError("لا يمكن التعديل — الجرد ليس قيد الجرد")

    if (action === "save_counts") {
      if (!counting) return notCounting()
      const inputs = Array.isArray(data.lines) ? data.lines : []
      const ids = inputs.map((line: any) => Number(line?.id)).filter((id: number) => id > 0)
      const existing = ids.length ? ((await sql`SELECT * FROM stock_count_items WHERE count_id = ${countId} AND id = ANY(${ids}::int[])`) as any[]) : []
      const measuredIds = [...new Set(existing.filter((line) => isMeasuredProduct(line.measurment_id)).map((line) => Number(line.item_id)))]
      const products = measuredIds.length ? await loadProductMeta({ productIds: measuredIds }) : []
      let updated = 0
      for (const input of inputs) {
        const line = existing.find((entry) => Number(entry.id) === Number(input?.id))
        if (!line) continue
        if (line.has_serial) {
          // الكمية المجرودة لصنف بسيريال = عدد السيريالات المجرودة؛ الملاحظة فقط قابلة للتعديل هنا
          await sql`UPDATE stock_count_items SET note = ${String(input.note ?? "")} WHERE id = ${Number(line.id)}`
          continue
        }
        let counted: number | null
        let pieces: number | null = null
        if (isMeasuredProduct(line.measurment_id)) {
          pieces = numberOrNull(input.counted_pieces)
          if (pieces != null && (!Number.isFinite(pieces) || pieces < 0)) return jsonError(`عدد القطع غير صالح للصنف ${line.product_code}`)
          const product = products.find((entry) => entry.id === Number(line.item_id))
          counted = product ? quantityFromPieces(product, line, pieces) : null
        } else {
          counted = numberOrNull(input.counted_qty)
          if (counted != null && (!Number.isFinite(counted) || counted < 0)) return jsonError(`الكمية المجرودة غير صالحة للصنف ${line.product_code}`)
        }
        await sql`
          UPDATE stock_count_items
          SET counted_qty = ${counted}, counted_pieces = ${pieces}, note = ${String(input.note ?? "")},
            counted_by = CASE WHEN ${counted}::numeric IS NULL THEN NULL ELSE ${userId} END,
            counted_at = CASE WHEN ${counted}::numeric IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END
          WHERE id = ${Number(line.id)}
        `
        updated++
      }
      await sql`UPDATE stock_counts SET updated_at = CURRENT_TIMESTAMP WHERE id = ${countId}`
      return NextResponse.json({ updated })
    }

    if (action === "set_serial") {
      if (!counting) return notCounting()
      const lineId = Number(data.line_id)
      const serial = String(data.serial || "").trim()
      if (!serial) return jsonError("أدخل الرقم التسلسلي")
      const line = ((await sql`SELECT id, item_id, has_serial FROM stock_count_items WHERE id = ${lineId} AND count_id = ${countId}`) as any[])[0]
      if (!line?.has_serial) return jsonError("السطر غير موجود أو الصنف لا يتتبّع أرقاماً تسلسلية")
      if (data.counted !== false) {
        // السيريال نفسه لا يُعدّ مرتين ولا لصنفين بنفس الجرد
        const elsewhere = ((await sql`
          SELECT i.product_code FROM stock_count_serials s JOIN stock_count_items i ON i.id = s.line_id
          WHERE s.count_id = ${countId} AND s.serial = ${serial} AND s.counted AND s.line_id <> ${lineId} LIMIT 1
        `) as any[])[0]
        if (elsewhere) return jsonError(`الرقم ${serial} مجرود مسبقاً على الصنف ${elsewhere.product_code}`)
      }
      await setSerial(countId, lineId, serial, data.counted !== false, userId)
      return NextResponse.json({ ok: true })
    }

    // مسح سيريال من شريط الباركود: سيريال دفتري بالوثيقة ⇐ يُعلَّم مجروداً؛ سيريال معروف لصنف آخر
    // (موجود بمستودع آخر أو خارج المخزون) ⇐ يُضاف لسطر صنفه كزيادة. غير معروف ⇐ not_found.
    if (action === "scan_serial") {
      if (!counting) return notCounting()
      const code = String(data.code || "").trim()
      if (!code) return jsonError("أدخل الرقم")
      const known = ((await sql`SELECT line_id FROM stock_count_serials WHERE count_id = ${countId} AND serial = ${code} LIMIT 1`) as any[])[0]
      if (known) {
        await setSerial(countId, Number(known.line_id), code, true, userId)
        return NextResponse.json({ line_id: Number(known.line_id), serial: code })
      }
      const registered = ((await sql`SELECT item_id FROM items_serials_tbl WHERE serial = ${code} LIMIT 1`) as any[])[0]
      if (!registered) return NextResponse.json({ not_found: true })
      let line = ((await sql`SELECT id FROM stock_count_items WHERE count_id = ${countId} AND item_id = ${Number(registered.item_id)} LIMIT 1`) as any[])[0]
      if (!line) {
        const [product] = await loadProductMeta({ productIds: [Number(registered.item_id)] })
        if (!product?.has_serial) return NextResponse.json({ not_found: true })
        const lineId = await insertCountLine(countId, { product, lot_key: "", system_qty: 0, unit_cost: 0, manual: true })
        line = { id: lineId }
      }
      await setSerial(countId, Number(line.id), code, true, userId)
      return NextResponse.json({ line_id: Number(line.id), serial: code, extra: true })
    }

    if (action === "add_item") {
      // صنف خارج الوثيقة (رصيد دفتري صفر غير مُدرَج) — صنف عادي/سيريال يُضاف بسطر؛ صنف دفعات/مقاسات
      // يحتاج تحديد الدفعة ⇐ need_lot لتفتح الواجهة نافذة الدفعة.
      if (!counting) return notCounting()
      const code = String(data.code || "").trim()
      if (!code) return jsonError("أدخل رقم الصنف أو الباركود")
      const [product] = await loadProductMeta({ code })
      if (!product) return jsonError(`لا يوجد صنف بالرقم أو الباركود ${code}`, 404)
      const lotProduct = !product.has_serial && (product.has_expiry || product.has_batch || product.has_variants || isMeasuredProduct(product.measurment_id))
      if (lotProduct) return NextResponse.json({ need_lot: true, item_id: product.id })
      const existing = ((await sql`SELECT id FROM stock_count_items WHERE count_id = ${countId} AND item_id = ${product.id} AND lot_key = '' LIMIT 1`) as any[])[0]
      if (existing) return NextResponse.json({ line_id: Number(existing.id) })
      const balance = (await warehouseBalancesAt(scope, [product.id])).get(product.id)
      const lineId = await insertCountLine(countId, {
        product, lot_key: "", system_qty: product.has_serial ? 0 : balance?.balance ?? 0, unit_cost: balance?.average_cost ?? 0, manual: true,
      })
      return NextResponse.json({ line_id: lineId })
    }

    // إضافة دفعة/مقاس/متغير لصنف أثناء الجرد (وُجد بالرف وليس بالدفتر، أو بلا رصيد دفتري)
    if (action === "add_lot") {
      if (!counting) return notCounting()
      const [product] = await loadProductMeta({ productIds: [Number(data.item_id)] })
      if (!product) return jsonError("الصنف غير موجود", 404)
      if (product.has_serial) return jsonError("الأصناف ذات الأرقام التسلسلية تُجرد بمسح أرقامها")
      const expiry = normalizeExpiry(data.expiry_date)
      const batch = String(data.batch_no || "").trim()
      if (product.has_expiry && !expiry) return jsonError("يجب إدخال تاريخ الصلاحية")
      if (product.has_batch && !batch) return jsonError("يجب إدخال الرقم التشغيلي")
      const attributes = product.has_variants ? await productAttributes(product.id) : []
      const valueIds = (Array.isArray(data.attribute_value_ids) ? data.attribute_value_ids : []).map(Number).filter((id: number) => id > 0)
      for (const attribute of attributes) {
        const chosen = attribute.values.filter((value) => valueIds.includes(value.id))
        if (chosen.length !== 1) return jsonError(`اختر قيمة واحدة للخاصية «${attribute.name}»`)
      }
      const measured = isMeasuredProduct(product.measurment_id)
      const dims = measured
        ? { length: positiveDimension(data.length), width: positiveDimension(data.width), height: positiveDimension(data.height) }
        : { length: null, width: null, height: null }
      if (measured) {
        if (measurementRequiresLength(product.measurment_id) && !dims.length) return jsonError("يجب إدخال الطول")
        if (measurementRequiresWidth(product.measurment_id) && !dims.width) return jsonError("يجب إدخال العرض")
        if (measurementRequiresHeight(product.measurment_id) && !dims.height) return jsonError("يجب إدخال الارتفاع")
      }
      const lot = { expiry_date: expiry, batch_no: batch, attribute_value_ids: valueIds.sort((a: number, b: number) => a - b), ...dims }
      const key = lotKey(lot)
      const existing = ((await sql`SELECT id FROM stock_count_items WHERE count_id = ${countId} AND item_id = ${product.id} AND lot_key = ${key}`) as any[])[0]
      if (existing) return NextResponse.json({ line_id: Number(existing.id), existed: true })
      const lots = await lotBalances({ warehouseId: scope.warehouseId, branchId: scope.branchId, toDate: scope.countDate, productIds: [product.id], mode: "posted", splitDimensions: measured })
      const match = lots.find((entry) => lotKey(measured ? entry : { ...entry, length: null, width: null, height: null }) === key)
      const cost = (await warehouseBalancesAt(scope, [product.id])).get(product.id)?.average_cost ?? 0
      const labels = await variantLabels(lot.attribute_value_ids)
      const lineId = await insertCountLine(countId, {
        product,
        lot_key: key,
        system_qty: match?.quantity ?? 0,
        unit_cost: cost,
        expiry_date: expiry,
        batch_no: batch,
        attribute_value_ids: lot.attribute_value_ids,
        variant_label: lot.attribute_value_ids.map((id: number) => labels.get(id)).filter(Boolean).map((entry: any) => `${entry.attribute}: ${entry.value}`).join("، "),
        ...dims,
        system_pieces: measured ? match?.pieces ?? 0 : null,
        manual: true,
      })
      return NextResponse.json({ line_id: lineId })
    }

    if (action === "import") {
      // استيراد Excel: المطابقة برقم الصنف/الباركود ثم بالدفعة (صلاحية/رقم تشغيلي/متغير/مقاس) عند تعدد الأسطر
      if (!counting) return notCounting()
      const lines = (await sql`SELECT * FROM stock_count_items WHERE count_id = ${countId}`) as any[]
      const measuredIds = [...new Set(lines.filter((line) => isMeasuredProduct(line.measurment_id)).map((line) => Number(line.item_id)))]
      const products = measuredIds.length ? await loadProductMeta({ productIds: measuredIds }) : []
      let updated = 0
      const notFound: string[] = []
      const same = (a: unknown, b: unknown) => String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase()
      const sameNumber = (a: unknown, b: unknown) => (Number(a) || 0) === (Number(b) || 0)
      for (const row of Array.isArray(data.rows) ? data.rows : []) {
        const code = String(row?.code ?? "").trim()
        if (!code) continue
        let candidates = lines.filter((line) => same(line.product_code, code) || String(line.barcode || "") === code)
        if (candidates.length > 1) {
          candidates = candidates.filter((line) =>
            (normalizeExpiry(line.expiry_date) ?? "") === (normalizeExpiry(row.expiry_date) ?? "") &&
            same(line.batch_no, row.batch_no) &&
            same(line.variant_label, row.variant) &&
            sameNumber(line.length, row.length) && sameNumber(line.width, row.width) && sameNumber(line.height, row.height))
        }
        const line = candidates.length === 1 ? candidates[0] : null
        if (!line) { notFound.push(code); continue }
        if (line.has_serial) { notFound.push(`${code} (سيريال — يُجرد بالمسح)`); continue }
        if (isMeasuredProduct(line.measurment_id)) {
          const pieces = numberOrNull(row.counted_pieces)
          if (pieces == null || !Number.isFinite(pieces) || pieces < 0) { notFound.push(`${code} (عدد القطع)`); continue }
          const product = products.find((entry) => entry.id === Number(line.item_id)) as ProductMeta
          await sql`UPDATE stock_count_items SET counted_pieces = ${pieces}, counted_qty = ${quantityFromPieces(product, line, pieces)}, counted_by = ${userId}, counted_at = CURRENT_TIMESTAMP WHERE id = ${Number(line.id)}`
        } else {
          const counted = numberOrNull(row.counted_qty)
          if (counted == null || !Number.isFinite(counted) || counted < 0) { notFound.push(`${code} (كمية غير صالحة)`); continue }
          await sql`UPDATE stock_count_items SET counted_qty = ${counted}, counted_by = ${userId}, counted_at = CURRENT_TIMESTAMP WHERE id = ${Number(line.id)}`
        }
        updated++
      }
      await sql`UPDATE stock_counts SET updated_at = CURRENT_TIMESTAMP WHERE id = ${countId}`
      return NextResponse.json({ updated, not_found: notFound })
    }

    if (action === "remove_line") {
      // حذف سطر دفعة أُضيف يدوياً أثناء الجرد (خطأ إدخال) — أسطر الدفتر لا تُحذف (تُترك بلا عدّ)
      if (!counting) return notCounting()
      const removed = await sql`DELETE FROM stock_count_items WHERE id = ${Number(data.line_id)} AND count_id = ${countId} AND manual = true AND ABS(system_qty) < 0.000001 RETURNING id`
      if (!removed.length) return jsonError("يمكن حذف الأسطر المضافة يدوياً بلا رصيد دفتري فقط")
      return NextResponse.json({ ok: true })
    }

    if (action === "finish") {
      if (!counting) return jsonError("الجرد ليس قيد الجرد")
      await refreshSystemQuantities(countId, scope)
      await sql`UPDATE stock_counts SET status = ${STOCK_COUNT_STATUS.FINISHED}, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ${countId}`
      return NextResponse.json({ ok: true })
    }

    if (action === "reopen") {
      if (status !== STOCK_COUNT_STATUS.FINISHED) return jsonError("يمكن إعادة فتح جرد منتهٍ غير مرحّل فقط")
      await sql`UPDATE stock_counts SET status = ${STOCK_COUNT_STATUS.COUNTING}, finished_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ${countId}`
      return NextResponse.json({ ok: true })
    }

    if (action === "refresh") {
      if (status !== STOCK_COUNT_STATUS.FINISHED && status !== STOCK_COUNT_STATUS.COUNTING) return jsonError("لا يمكن تحديث جرد مرحّل أو ملغى")
      await refreshSystemQuantities(countId, scope)
      return NextResponse.json({ ok: true })
    }

    if (action === "cancel") {
      if (status === STOCK_COUNT_STATUS.POSTED) return jsonError("لا يمكن إلغاء جرد مرحّل — ألغِ سندات التسوية الخاصة به أولاً")
      await sql`UPDATE stock_counts SET status = ${STOCK_COUNT_STATUS.CANCELLED}, updated_at = CURRENT_TIMESTAMP WHERE id = ${countId}`
      return NextResponse.json({ ok: true })
    }

    if (action === "post") {
      if (status !== STOCK_COUNT_STATUS.FINISHED) return jsonError("يجب إنهاء الجرد ومراجعة الفروقات قبل الترحيل")
      return await postCount(request, countId, header, data, userId)
    }

    return jsonError("عملية غير معروفة")
  } catch (error: any) {
    console.error("Error updating stock count:", error)
    return jsonError(error?.message || "تعذر تنفيذ العملية", 500)
  }
}

// DELETE: حذف وثيقة لم تُرحَّل (قيد الجرد/منتهية/ملغاة)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const permission = await requireStockCountPermission(request, "edit")
    if (!permission.ok) return permission.response
    const countId = await countIdOf(context)
    const header = await loadCountHeader(countId)
    if (!header) return jsonError("وثيقة الجرد غير موجودة", 404)
    if (Number(header.status) === STOCK_COUNT_STATUS.POSTED) return jsonError("لا يمكن حذف جرد مرحّل")
    await sql`DELETE FROM stock_counts WHERE id = ${countId}`
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return jsonError(error?.message || "تعذر حذف وثيقة الجرد", 500)
  }
}

// ── الترحيل ─────────────────────────────────────────────────────────────────────────────────
// سند اخراج للعجز ثم سند ادخال للزيادة، عبر مسار POST لسندات المخزون نفسه (نفس الصلاحيات والتحقق
// والأثر المخزني). كل سطر تسوية يحمل دفعته: الصلاحية والرقم التشغيلي والمتغير، والأبعاد مع عدد القطع
// لأصناف القياس (الكمية = معادلة نوع القياس)، والسيريالات المفقودة (اخراج) أو الزائدة (ادخال).
// إن نجح الأول وفشل الثاني يُلغى الأول تلقائياً (PUT status=3) فلا يبقى ترحيل جزئي.
type AdjustmentRow = { line: any; quantity: number; pieces?: number; serials?: string[] }

async function postCount(request: NextRequest, countId: number, header: any, data: any, userId: string) {
  const uncounted: "skip" | "zero" = data.uncounted === "zero" ? "zero" : "skip"
  const scope = scopeOf(header)
  const warehouseId = scope.warehouseId

  // الكمية الدفترية بتاريخ القطع لحظة الترحيل (سندات بتاريخ سابق أُدخلت بعد إنهاء الجرد)
  await refreshSystemQuantities(countId, scope)
  const lines = (await sql`SELECT * FROM stock_count_items WHERE count_id = ${countId}`) as any[]
  const serialRows = (await sql`SELECT line_id, serial, in_system, counted FROM stock_count_serials WHERE count_id = ${countId}`) as any[]
  const productIds = [...new Set(lines.map((line) => Number(line.item_id)))]
  const products = new Map((await loadProductMeta({ productIds })).map((product) => [product.id, product]))

  const shortages: AdjustmentRow[] = []
  const surpluses: AdjustmentRow[] = []
  const problems: string[] = []
  for (const line of lines) {
    const isUncounted = line.counted_qty == null
    if (isUncounted && uncounted === "skip") continue
    const product = products.get(Number(line.item_id))
    const label = `${line.product_code} ${line.product_name}${lineLotLabel(line) ? ` (${lineLotLabel(line)})` : ""}`

    if (line.has_serial) {
      const own = serialRows.filter((serial) => Number(serial.line_id) === Number(line.id))
      const missing = own.filter((serial) => serial.in_system && (isUncounted || !serial.counted)).map((serial) => String(serial.serial))
      const extra = isUncounted ? [] : own.filter((serial) => serial.counted && !serial.in_system).map((serial) => String(serial.serial))
      if (missing.length) shortages.push({ line, quantity: missing.length, serials: missing })
      if (extra.length) surpluses.push({ line, quantity: extra.length, serials: extra })
      continue
    }

    if (isMeasuredProduct(line.measurment_id)) {
      const countedPieces = isUncounted ? 0 : Number(line.counted_pieces || 0)
      const diffPieces = round6(countedPieces - Number(line.system_pieces || 0))
      if (Math.abs(diffPieces) < 0.000001) continue
      if (!product || !hasRequiredDimensions(line.measurment_id, line)) {
        problems.push(`${label}: مقاس بلا أبعاد كاملة`)
        continue
      }
      const pieces = Math.abs(diffPieces)
      const quantity = quantityFromPieces(product, line, pieces) ?? 0
      ;(diffPieces < 0 ? shortages : surpluses).push({ line, quantity, pieces })
      continue
    }

    const diff = lineDifference(line, uncounted)
    if (Math.abs(diff) < 0.000001) continue
    ;(diff < 0 ? shortages : surpluses).push({ line, quantity: Math.abs(diff) })
  }

  if (problems.length) {
    return jsonError(`لا يمكن ترحيل: ${problems.slice(0, 5).join("، ")}${problems.length > 5 ? ` و${problems.length - 5} غيرها` : ""} — أضف الدفعة بمقاسها الصحيح وأعد العدّ`)
  }
  if (!shortages.length && !surpluses.length) {
    await sql`UPDATE stock_counts SET status = ${STOCK_COUNT_STATUS.POSTED}, posted_at = CURRENT_TIMESTAMP, posted_by = ${userId}, updated_at = CURRENT_TIMESTAMP WHERE id = ${countId}`
    return NextResponse.json({ ok: true, message: "لا توجد فروقات — رُحّل الجرد دون سندات تسوية" })
  }

  const outBookId = Number(data.out_book_id) || null
  const inBookId = Number(data.in_book_id) || null
  if (shortages.length && !outBookId) return jsonError("اختر دفتر سندات الإخراج (للعجز)")
  if (surpluses.length && !inBookId) return jsonError("اختر دفتر سندات الإدخال (للزيادة)")

  const labels = await variantLabels(lines.flatMap((line) => (line.attribute_value_ids || []).map(Number)))
  const selectedAttributes = (line: any) => {
    const result: Record<string, string> = {}
    for (const id of (line.attribute_value_ids || []).map(Number)) {
      const entry = labels.get(id)
      if (entry) result[entry.attribute] = entry.value
    }
    return Object.keys(result).length ? result : undefined
  }

  const note = `تسوية جرد المخازن رقم ${header.count_no} — ${header.branch_name || ""} / ${header.warehouse_name || ""} بتاريخ ${scope.countDate}`
  const buildPayload = async (vchType: number, bookId: number, rows: AdjustmentRow[]) => {
    const bookName = await resolveVoucherBookName(bookId)
    if (!bookName) throw new Error("دفتر السندات المختار غير صالح")
    const { prefix, startNumber } = await getStockVoucherNumberSettings(request.url, vchType)
    const sequence = await nextVoucherSequence(vchType, `${prefix}${bookName}`, startNumber)
    return {
      vch_type: vchType,
      vch_code: buildVoucherCode(prefix, bookName, sequence),
      vch_date: scope.countDate,
      vch_book_id: bookId,
      branch_id: scope.branchId || undefined,
      currency_id: null,
      rate: 1,
      to_store_id: warehouseId,
      note,
      status: 2,
      insert_user: Number(userId) || null,
      items: rows.map(({ line, quantity, pieces, serials }) => {
        const price = Number(line.unit_cost || 0)
        const measured = isMeasuredProduct(line.measurment_id)
        return {
          product_id: Number(line.item_id),
          product_name: line.product_name,
          unit_id: line.unit_id,
          unit: line.unit_name,
          quantity: round6(quantity),
          unit_price: price,
          total_price: Math.round(quantity * price * 1000) / 1000,
          store_id: warehouseId,
          expiry_date: normalizeExpiry(line.expiry_date) || undefined,
          batch_number: line.batch_no || undefined,
          selected_attributes: selectedAttributes(line),
          ...(measured ? { length: line.length, width: line.width, height: line.height, count: pieces } : {}),
          ...(serials?.length ? { serials } : {}),
          note: line.has_serial
            ? `جرد ${header.count_no}: ${serials?.length || 0} رقم تسلسلي`
            : measured
              ? `جرد ${header.count_no}: قطع دفترية ${Number(line.system_pieces || 0)} — مجرودة ${Number(line.counted_pieces || 0)}`
              : `جرد ${header.count_no}: دفتري ${Number(line.system_qty)} — مجرود ${line.counted_qty == null ? 0 : Number(line.counted_qty)}`,
        }
      }),
    }
  }

  const callHandler = async (handler: (req: NextRequest) => Promise<Response>, payload: any, method: "POST" | "PUT") => {
    const headers = new Headers(request.headers)
    headers.delete("content-length")
    headers.set("content-type", "application/json")
    if (scope.branchId) headers.set("x-branch-id", String(scope.branchId))
    const response = await handler(new NextRequest(new URL("/api/stock-vouchers", request.url), { method, headers, body: JSON.stringify(payload) }))
    const body = await response.json().catch(() => ({}))
    return { ok: response.ok, body }
  }

  let outVoucher: any = null
  let outPayload: any = null
  if (shortages.length) {
    outPayload = await buildPayload(STOCK_OUT_VCH_TYPE, outBookId!, shortages)
    const result = await callHandler(createStockVoucher, outPayload, "POST")
    if (!result.ok) return jsonError(`تعذر إنشاء سند الإخراج (العجز): ${result.body?.error || "خطأ غير معروف"}`)
    outVoucher = result.body
  }

  let inVoucher: any = null
  if (surpluses.length) {
    const inPayload = await buildPayload(STOCK_IN_VCH_TYPE, inBookId!, surpluses)
    const result = await callHandler(createStockVoucher, inPayload, "POST")
    if (!result.ok) {
      if (outVoucher?.id) {
        // تعويض: إلغاء سند الإخراج الذي أُنشئ للتو كي لا يبقى ترحيل جزئي
        await callHandler(updateStockVoucher, { ...outPayload, id: outVoucher.id, vch_code: outVoucher.vch_code, status: 3 }, "PUT").catch(() => null)
      }
      return jsonError(`تعذر إنشاء سند الإدخال (الزيادة): ${result.body?.error || "خطأ غير معروف"}${outVoucher?.id ? " — أُلغي سند الإخراج المرتبط" : ""}`)
    }
    inVoucher = result.body
  }

  await sql`
    UPDATE stock_counts SET status = ${STOCK_COUNT_STATUS.POSTED}, posted_at = CURRENT_TIMESTAMP, posted_by = ${userId},
      in_voucher_id = ${inVoucher?.id ?? null}, out_voucher_id = ${outVoucher?.id ?? null}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${countId}
  `
  return NextResponse.json({
    ok: true,
    in_voucher: inVoucher ? { id: inVoucher.id, vch_code: inVoucher.vch_code } : null,
    out_voucher: outVoucher ? { id: outVoucher.id, vch_code: outVoucher.vch_code } : null,
  })
}
