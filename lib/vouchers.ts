import { Pool } from "pg"

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
})

function getVoucherPrefix(vchType: number, vchBook: string) {
	if (vchType === 1) return `O${vchBook}`
	if (vchType === 2) return `T${vchBook}`
	if (vchType === 3 || vchType === 5) return `I${vchBook}`
	return `V${vchType}${vchBook}`
}

async function generateVoucherNumber(vchType: number, vchBook: string) {
	const normalizedBook = String(vchBook || "").trim().toUpperCase()
	if (!normalizedBook || normalizedBook === "0") {
		throw new Error("vch_book is required")
	}

	const settingsResult = await pool.query(
		`
			SELECT invoice_prefix, invoice_start, order_prefix, order_start, purchase_prefix, purchase_start
			FROM system_settings
			WHERE id = 1
			LIMIT 1
		`,
	)

	const settings = settingsResult.rows?.[0] ?? {}
	const configuredPrefix =
		vchType === 5
			? settings.invoice_prefix
			: vchType === 1
				? settings.order_prefix
				: vchType === 2
					? settings.purchase_prefix
					: null

	const configuredStart = Number(
		vchType === 5
			? settings.invoice_start
			: vchType === 1
				? settings.order_start
				: vchType === 2
					? settings.purchase_start
					: 1,
	)

	const basePrefix = String(configuredPrefix || getVoucherPrefix(vchType, ""))
	const prefix = `${basePrefix}${normalizedBook}`

	const result = await pool.query(
		`
			SELECT COALESCE(
				MAX(
					CASE
						WHEN RIGHT(voucher_code, 5) ~ '^[0-9]{5}$'
							THEN CAST(RIGHT(voucher_code, 5) AS BIGINT)
						ELSE 0
					END
				),
				0
			) AS max_seq
			FROM vouchers
			WHERE voucher_code LIKE $1
			  AND COALESCE(vch_type, 0) = $2
			  AND COALESCE(vch_book, '') = $3
			  AND deleted = false
		`,
		[`${prefix}%`, vchType, normalizedBook],
	)

	const maxSeq = Number(result.rows?.[0]?.max_seq ?? 0)
	const startSeq = Number.isFinite(configuredStart) && configuredStart > 0 ? configuredStart : 1
	const nextNumber = Math.max(maxSeq + 1, startSeq)
	return `${prefix}${nextNumber.toString().padStart(5, "0")}`
}

export async function getSalesVouchers(filters: any = {}) {
	const {
		search = null,
		status = null,
		salesman = null,
		dateFrom = null,
		dateTo = null,
		customerId = null,
		voucher_type = null,
		vch_type = null,
	} = filters

	const normalizedVoucherType = voucher_type ?? vch_type

	const whereClauses: string[] = ["v.deleted = false"]
	const params: any[] = []
	let paramIndex = 1

	if (normalizedVoucherType !== null && normalizedVoucherType !== undefined) {
		whereClauses.push(`v.vch_type = $${paramIndex}`)
		params.push(Number(normalizedVoucherType))
		paramIndex++
	}

	if (search) {
		whereClauses.push(`(v.voucher_code ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`)
		params.push(`%${search}%`)
		paramIndex++
	}

	if (status && status !== "all") {
		whereClauses.push(`v.vch_status = $${paramIndex}`)
		params.push(Number(status))
		paramIndex++
	}

	if (salesman && salesman !== "all") {
		whereClauses.push(`v.salesman_id = $${paramIndex}`)
		params.push(Number(salesman))
		paramIndex++
	}

	if (dateFrom) {
		whereClauses.push(`v.voucher_date >= $${paramIndex}`)
		params.push(dateFrom)
		paramIndex++
	}

	if (dateTo) {
		whereClauses.push(`v.voucher_date <= $${paramIndex}`)
		params.push(dateTo)
		paramIndex++
	}

	if (customerId) {
		whereClauses.push(`v.customer_id = $${paramIndex}`)
		params.push(Number(customerId))
		paramIndex++
	}

	const queryText = `
		SELECT
			v.*,
			v.vch_type AS voucher_type,
			v.voucher_code AS order_number,
			v.voucher_date AS order_date,
			v.vch_status AS order_status,
			v.vch_status AS order_status2,
			0 AS order_decision,
			COALESCE(c.name, '') AS customer_name,
			COALESCE(COUNT(vi.id), 0) AS item_count,
			COALESCE(SUM(vi.quantity), 0) AS total_quantity
		FROM vouchers v
		LEFT JOIN customers c ON v.customer_id = c.id
		LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
		WHERE ${whereClauses.join(" AND ")}
		GROUP BY v.id, c.name
		ORDER BY v.created_at DESC
	`

	const result = await pool.query(queryText, params)
	return result.rows
}

export async function createVoucher(voucherData: any, items: any[]) {
	const client = await pool.connect()

	try {
		await client.query("BEGIN")

		await client.query(`
			ALTER TABLE vouchers
			ADD COLUMN IF NOT EXISTS vch_book character varying(20) DEFAULT 'R'
		`)

		await client.query(`
			ALTER TABLE vouchers
			ADD COLUMN IF NOT EXISTS reference_number_date timestamp without time zone
		`)

		await client.query(`
			ALTER TABLE vouchers
			ADD COLUMN IF NOT EXISTS exported_sales boolean DEFAULT false
		`)

		await client.query(`
			ALTER TABLE vouchers
			ADD COLUMN IF NOT EXISTS tax_classification integer DEFAULT 1
		`)

		await client.query(`
			ALTER TABLE vouchers
			ADD COLUMN IF NOT EXISTS invoice_type integer DEFAULT 1
		`)

		await client.query(`
			ALTER TABLE vouchers
			ADD COLUMN IF NOT EXISTS is_offset boolean DEFAULT false
		`)

		await client.query(`
			ALTER TABLE vouchers
			ADD COLUMN IF NOT EXISTS offset_code integer
		`)

		const vchType = Number(voucherData.voucher_type ?? voucherData.vch_type ?? voucherData.order_type ?? 5)
		const vchBook = String(voucherData.vch_book ?? "R").trim().toUpperCase()

		if (voucherData.reference_number && voucherData.reference_number.trim() !== "") {
			const refExists = await client.query(
				`
					SELECT id
					FROM vouchers
					WHERE reference_number = $1 AND deleted = false AND id != $2
					LIMIT 1
				`,
				[voucherData.reference_number.trim(), voucherData.id || 0],
			)

			if (refExists.rows.length > 0) {
				throw new Error(`السند اليدوي ${voucherData.reference_number} موجود مسبقا.`)
			}
		}

		for (const item of items || []) {
			if (!item.batch_number || item.batch_number.trim() === "") continue

			const batchExists = await client.query(
				`
					SELECT vi.id
					FROM voucher_items vi
					INNER JOIN vouchers v ON v.id = vi.voucher_id
					WHERE vi.batch_number = $1 AND vi.voucher_id <> $2 AND v.deleted = false
					LIMIT 1
				`,
				[item.batch_number.trim(), voucherData.id || 0],
			)

			if (batchExists.rows.length > 0) {
				throw new Error(`الرقم التشغيلي ${item.batch_number} موجود مسبقا.`)
			}
		}

		if (!voucherData.order_number || voucherData.order_number.length < 2) {
			voucherData.order_number = await generateVoucherNumber(vchType, vchBook)
		}

		const voucherCode = voucherData.voucher_code || voucherData.order_number
		const voucherDate = voucherData.voucher_date || voucherData.order_date
		const referenceNumberDate = voucherData.reference_number_date || voucherDate || new Date()
		const exportedSales = Boolean(voucherData.exported_sales)

		const voucherStatus = Number(voucherData.vch_status ?? voucherData.order_status2 ?? voucherData.order_status ?? 1)
		const rawTaxClassification = voucherData.tax_classification
		let taxClassification: number | null = null

		if (rawTaxClassification === "ضريبية") taxClassification = 1
		else if (rawTaxClassification === "معفاه") taxClassification = 2
		else if (rawTaxClassification === "صفرية") taxClassification = 3
		else {
			const parsedTaxClassification = Number(rawTaxClassification)
			taxClassification = Number.isFinite(parsedTaxClassification) && parsedTaxClassification > 0
				? parsedTaxClassification
				: null
		}

		const rawInvoiceType = voucherData.invoice_type
		let invoiceType: number | null = null

		if (rawInvoiceType === "للتجارة") invoiceType = 1
		else if (rawInvoiceType === "خدمات") invoiceType = 2
		else if (rawInvoiceType === "أصول") invoiceType = 3
		else {
			const parsedInvoiceType = Number(rawInvoiceType)
			invoiceType = Number.isFinite(parsedInvoiceType) && parsedInvoiceType > 0
				? parsedInvoiceType
				: null
		}

		taxClassification = taxClassification ?? 1
		invoiceType = invoiceType ?? 1
		const isOffset = Boolean(voucherData.is_offset)
		const rawOffsetCode = voucherData.offset_code
		let normalizedOffsetCode: number | null = null

		if (rawOffsetCode === "تجارية") normalizedOffsetCode = 1
		else if (rawOffsetCode === "أصول") normalizedOffsetCode = 2
		else if (rawOffsetCode === "خدمات") normalizedOffsetCode = 3
		else {
			const parsedOffsetCode = Number(rawOffsetCode)
			normalizedOffsetCode = Number.isFinite(parsedOffsetCode) && parsedOffsetCode > 0 ? parsedOffsetCode : null
		}

		const offsetCode = isOffset ? normalizedOffsetCode ?? 1 : null

		let voucher: any

		if (voucherData.id && Number(voucherData.id) > 0) {
			const updateQuery = `
				UPDATE vouchers
				SET
					voucher_code = $1,
					voucher_date = $2,
					customer_id = $3,
					customer_name = $4,
					customer_phone = $5,
					salesman_id = $6,
					currency_id = $7,
					exchange_rate = $8,
					discount_amount = $9,
					discount_type = $10,
					vat_amount = $11,
					vat_percent = $12,
					total_amount = $13,
					vch_type = $14,
					vch_status = $15,
					vch_book = $16,
					delivery_address = $17,
					reference_number = $18,
					reference_number_date = $19,
					delivery_date = $20,
					shipping_cost = $21,
					other_charges = $22,
					general_notes = $23,
					internal_notes = $24,
					delivery_notes = $25,
					received_by = $26,
					customer_order_no = $27,
					exported_sales = $28,
					tax_classification = $29,
					invoice_type = $30,
					is_offset = $31,
					offset_code = $32,
					updated_at = NOW()
				WHERE id = $33
				RETURNING *
			`

			const updateValues = [
				voucherCode,
				voucherDate || new Date(),
				voucherData.customer_id || null,
				voucherData.customer_name || "",
				voucherData.customer_phone || null,
				voucherData.salesman_id || null,
				voucherData.currency_id || null,
				voucherData.exchange_rate || 1,
				voucherData.discount_amount || 0,
				voucherData.discount_type || null,
				voucherData.vat_amount || 0,
				voucherData.vat_percent || 0,
				voucherData.total_amount || 0,
				vchType,
				voucherStatus,
				vchBook,
				voucherData.delivery_address || "",
				voucherData.reference_number || "",
				referenceNumberDate,
				voucherData.delivery_date || new Date(),
				voucherData.shipping_cost || 0,
				voucherData.other_charges || 0,
				voucherData.general_notes || "",
				voucherData.internal_notes || "",
				voucherData.delivery_notes || "",
				voucherData.received_by || "",
				voucherData.customer_order_no || "",
				exportedSales,
				taxClassification,
				invoiceType,
				isOffset,
				offsetCode,
				voucherData.id,
			]

			const result = await client.query(updateQuery, updateValues)
			voucher = { ...result.rows[0], voucher_type: result.rows[0]?.vch_type }
		} else {
			const insertQuery = `
				INSERT INTO vouchers (
					voucher_code, voucher_date, customer_id, customer_name, customer_phone,
					salesman_id, currency_id, exchange_rate, discount_amount, discount_type,
					vat_amount, vat_percent, total_amount, vch_type, vch_status,
					vch_book, delivery_address, reference_number, reference_number_date, delivery_date,
					shipping_cost, other_charges, general_notes, internal_notes,
					delivery_notes, received_by, customer_order_no, user_id,
					printed, printed_count, is_exported, exported_sales,
					tax_classification, invoice_type, is_offset, offset_code,
					created_at, updated_at
				) VALUES (
					$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
					$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
					$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
					$31,$32,$33,$34,$35,$36,NOW(),NOW()
				)
				RETURNING *
			`

			const insertValues = [
				voucherCode,
				voucherDate || new Date(),
				voucherData.customer_id || null,
				voucherData.customer_name || "",
				voucherData.customer_phone || null,
				voucherData.salesman_id || null,
				voucherData.currency_id || null,
				voucherData.exchange_rate || 1,
				voucherData.discount_amount || 0,
				voucherData.discount_type || null,
				voucherData.vat_amount || 0,
				voucherData.vat_percent || 0,
				voucherData.total_amount || 0,
				vchType,
				voucherStatus,
				vchBook,
				voucherData.delivery_address || "",
				voucherData.reference_number || "",
				referenceNumberDate,
				voucherData.delivery_date || new Date(),
				voucherData.shipping_cost || 0,
				voucherData.other_charges || 0,
				voucherData.general_notes || "",
				voucherData.internal_notes || "",
				voucherData.delivery_notes || "",
				voucherData.received_by || "",
				voucherData.customer_order_no || "",
				voucherData.user_id || "",
				voucherData.printed || 0,
				voucherData.printed_count || 0,
				voucherData.is_exported || 0,
				exportedSales,
				taxClassification,
				invoiceType,
				isOffset,
				offsetCode,
			]

			const result = await client.query(insertQuery, insertValues)
			voucher = { ...result.rows[0], voucher_type: result.rows[0]?.vch_type }
		}

		await client.query("DELETE FROM voucher_items WHERE voucher_id = $1", [voucher.id])

		for (const item of items || []) {
			if (!item.product_name || (!item.quantity && !item.delivered_quantity)) continue

			await client.query(
				`
					INSERT INTO voucher_items (
						voucher_id, product_id, product_name, quantity, bonus, price, discount,
						order_item_id, delivery_item_id, barcode, unit_id, store_id, delivered_quantity,
						expiry_date, batch_number, item_status, created_at, updated_at
					) VALUES (
						$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW()
					)
				`,
				[
					voucher.id,
					item.product_id || null,
					item.product_name,
					item.quantity || 0,
					item.bonus || 0,
					item.price || 0,
					item.discount || 0,
					item.order_item_id || null,
					item.delivery_item_id || null,
					item.barcode || null,
					item.unit_id || null,
					item.store_id || null,
					item.delivered_quantity || 0,
					item.expiry_date || null,
					item.batch_number || null,
					item.item_status || 0,
				],
			)
		}

		await client.query("COMMIT")
		return voucher
	} catch (error) {
		await client.query("ROLLBACK")
		throw error
	} finally {
		client.release()
	}
}

export async function deleteSalesVoucher(voucherId: number) {
	await pool.query(`UPDATE vouchers SET deleted = true WHERE id = $1`, [voucherId])
	return { success: true }
}

export async function updatePrintSalesVoucher(voucherId: number) {
	await pool.query(
		`
			UPDATE vouchers
			SET printed = 1,
					printed_count = COALESCE(printed_count, 0) + 1,
					updated_at = NOW()
			WHERE id = $1
		`,
		[voucherId],
	)

	return { success: true }
}
