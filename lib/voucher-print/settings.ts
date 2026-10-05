export type PaperKey = "A3" | "A4" | "A5" | "A6" | "B5" | "Letter" | "Legal" | "Receipt80" | "Receipt58" | "Custom"
export type PrintMethod = "auto" | "service" | "browser"
export type PrintTemplate = "modern" | "classic" | "minimal"
export type VoucherFamily = "items" | "journal" | "finance"

export type VoucherPrintSettings = {
  paper_size: PaperKey
  orientation: "portrait" | "landscape"
  custom_width_mm: number
  custom_height_mm: number
  margin_top_mm: number
  margin_right_mm: number
  margin_bottom_mm: number
  margin_left_mm: number
  print_method: PrintMethod
  printer_name: string
  copies: number
  copy_labels: string
  template: PrintTemplate
  font_family: string
  font_size: number
  accent_color: string
  show_logo: boolean
  show_company_info: boolean
  header_text: string
  show_fields: boolean
  show_row_numbers: boolean
  hidden_columns: string[]
  show_totals: boolean
  show_amount_in_words: boolean
  show_notes: boolean
  show_barcode: boolean
  show_signatures: boolean
  signatures: string
  show_footer: boolean
  footer_text: string
  show_print_date: boolean
  show_printed_by: boolean
  show_page_numbers: boolean
}

export const PAPER_SIZES: Record<Exclude<PaperKey, "Custom">, { label: string; width: number; height: number; receipt?: boolean }> = {
  A3: { label: "A3 (297 × 420 مم)", width: 297, height: 420 },
  A4: { label: "A4 (210 × 297 مم)", width: 210, height: 297 },
  A5: { label: "A5 (148 × 210 مم)", width: 148, height: 210 },
  A6: { label: "A6 (105 × 148 مم)", width: 105, height: 148 },
  B5: { label: "B5 (176 × 250 مم)", width: 176, height: 250 },
  Letter: { label: "Letter (216 × 279 مم)", width: 215.9, height: 279.4 },
  Legal: { label: "Legal (216 × 356 مم)", width: 215.9, height: 355.6 },
  Receipt80: { label: "رول 80 مم", width: 80, height: 297, receipt: true },
  Receipt58: { label: "رول 58 مم", width: 58, height: 297, receipt: true },
}

export const PAPER_OPTIONS = [
  ...Object.entries(PAPER_SIZES).map(([value, paper]) => ({ value: value as PaperKey, label: paper.label })),
  { value: "Custom" as PaperKey, label: "مقاس مخصص" },
]

export const DEFAULT_PRINT_SETTINGS: VoucherPrintSettings = {
  paper_size: "A4",
  orientation: "portrait",
  custom_width_mm: 210,
  custom_height_mm: 297,
  margin_top_mm: 10,
  margin_right_mm: 10,
  margin_bottom_mm: 12,
  margin_left_mm: 10,
  print_method: "auto",
  printer_name: "",
  copies: 1,
  copy_labels: "",
  template: "modern",
  font_family: "Cairo",
  font_size: 12,
  accent_color: "#0f766e",
  show_logo: true,
  show_company_info: true,
  header_text: "",
  show_fields: true,
  show_row_numbers: true,
  hidden_columns: [],
  show_totals: true,
  show_amount_in_words: true,
  show_notes: true,
  show_barcode: true,
  show_signatures: true,
  signatures: "المحاسب,المدير,المستلم",
  show_footer: true,
  footer_text: "",
  show_print_date: true,
  show_printed_by: true,
  show_page_numbers: true,
}

export const FAMILY_COLUMNS: Record<VoucherFamily, { key: string; label: string }[]> = {
  items: [
    { key: "item_code", label: "رقم الصنف" },
    { key: "item_name", label: "اسم الصنف" },
    { key: "unit", label: "الوحدة" },
    { key: "warehouse", label: "المستودع" },
    { key: "quantity", label: "الكمية" },
    { key: "bonus", label: "البونص" },
    { key: "price", label: "السعر" },
    { key: "discount", label: "الخصم" },
    { key: "tax", label: "الضريبة" },
    { key: "total", label: "الإجمالي" },
    { key: "notes", label: "ملاحظات" },
  ],
  journal: [
    { key: "account_code", label: "رقم الحساب" },
    { key: "account_name", label: "اسم الحساب" },
    { key: "currency", label: "العملة" },
    { key: "debit", label: "مدين" },
    { key: "credit", label: "دائن" },
    { key: "cost_center", label: "مركز التكلفة" },
    { key: "notes", label: "البيان" },
  ],
  finance: [
    { key: "method", label: "طريقة الدفع" },
    { key: "account_name", label: "الحساب" },
    { key: "currency", label: "العملة" },
    { key: "amount", label: "المبلغ" },
    { key: "cheque_no", label: "رقم الشيك" },
    { key: "due_date", label: "تاريخ الاستحقاق" },
    { key: "bank", label: "البنك" },
    { key: "notes", label: "البيان" },
  ],
}

export function voucherFamily(name: string): VoucherFamily {
  const text = String(name || "")
  if (/قيد|اشعار|إشعار/.test(text)) return "journal"
  if (/قبض|صرف|شيك|دفع/.test(text)) return "finance"
  return "items"
}

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export function normalizePrintSettings(raw: Partial<VoucherPrintSettings> | null | undefined): VoucherPrintSettings {
  const merged = { ...DEFAULT_PRINT_SETTINGS, ...(raw || {}) } as VoucherPrintSettings
  const bool = (key: keyof VoucherPrintSettings) => (merged[key] as unknown) !== false && (merged[key] as unknown) !== "false"
  return {
    ...merged,
    paper_size: merged.paper_size in PAPER_SIZES || merged.paper_size === "Custom" ? merged.paper_size : "A4",
    orientation: merged.orientation === "landscape" ? "landscape" : "portrait",
    custom_width_mm: clampNumber(merged.custom_width_mm, 210, 40, 600),
    custom_height_mm: clampNumber(merged.custom_height_mm, 297, 40, 1200),
    margin_top_mm: clampNumber(merged.margin_top_mm, 10, 0, 60),
    margin_right_mm: clampNumber(merged.margin_right_mm, 10, 0, 60),
    margin_bottom_mm: clampNumber(merged.margin_bottom_mm, 12, 0, 60),
    margin_left_mm: clampNumber(merged.margin_left_mm, 10, 0, 60),
    print_method: ["auto", "service", "browser"].includes(merged.print_method) ? merged.print_method : "auto",
    printer_name: String(merged.printer_name || "").trim(),
    copies: Math.round(clampNumber(merged.copies, 1, 1, 10)),
    copy_labels: String(merged.copy_labels || ""),
    template: ["modern", "classic", "minimal"].includes(merged.template) ? merged.template : "modern",
    font_family: String(merged.font_family || "Cairo"),
    font_size: clampNumber(merged.font_size, 12, 7, 20),
    accent_color: /^#[0-9a-f]{6}$/i.test(String(merged.accent_color)) ? merged.accent_color : DEFAULT_PRINT_SETTINGS.accent_color,
    hidden_columns: Array.isArray(merged.hidden_columns) ? merged.hidden_columns.map(String) : [],
    header_text: String(merged.header_text || ""),
    footer_text: String(merged.footer_text || ""),
    signatures: String(merged.signatures ?? DEFAULT_PRINT_SETTINGS.signatures),
    show_logo: bool("show_logo"),
    show_company_info: bool("show_company_info"),
    show_fields: bool("show_fields"),
    show_row_numbers: bool("show_row_numbers"),
    show_totals: bool("show_totals"),
    show_amount_in_words: bool("show_amount_in_words"),
    show_notes: bool("show_notes"),
    show_barcode: bool("show_barcode"),
    show_signatures: bool("show_signatures"),
    show_footer: bool("show_footer"),
    show_print_date: bool("show_print_date"),
    show_printed_by: bool("show_printed_by"),
    show_page_numbers: bool("show_page_numbers"),
  }
}

export function paperDimensions(settings: VoucherPrintSettings) {
  const base = settings.paper_size === "Custom"
    ? { width: settings.custom_width_mm, height: settings.custom_height_mm, receipt: false }
    : { receipt: false, ...PAPER_SIZES[settings.paper_size] }
  const landscape = settings.orientation === "landscape" && !base.receipt
  return {
    widthMm: landscape ? base.height : base.width,
    heightMm: landscape ? base.width : base.height,
    receipt: Boolean(base.receipt),
    name: settings.paper_size === "Custom" ? "Custom" : settings.paper_size,
  }
}
