import { PAPER_SIZES, type PaperKey } from "./settings"

// Report print settings — modelled on ShamelAPI SystemSetting ids 173-195 (header status/type/image,
// underline, border frame, licensed-dealer line, company name/address font sizes, data font size,
// paper size, margins, cell margins, flip to landscape when the table does not fit in portrait),
// plus a footer, which Shamel does not have.
export type HeaderUnderline = "none" | "single" | "double" | "thick"

export type ReportPrintSettings = {
  paper_size: PaperKey
  orientation: "portrait" | "landscape"
  custom_width_mm: number
  custom_height_mm: number
  auto_landscape: boolean
  margin_top_mm: number
  margin_right_mm: number
  margin_bottom_mm: number
  margin_left_mm: number
  show_header: boolean
  header_type: "text" | "image"
  header_image: string
  header_image_height_mm: number
  show_logo: boolean
  show_company_name: boolean
  company_name_font_size: number
  show_company_address: boolean
  company_address_font_size: number
  show_tax_number: boolean
  tax_number_font_size: number
  header_text: string
  show_report_title: boolean
  header_underline: HeaderUnderline
  border_frame: boolean
  font_family: string
  data_font_size: number
  cell_padding_mm: number
  accent_color: string
  zebra_rows: boolean
  show_footer: boolean
  footer_text: string
  show_print_date: boolean
  show_printed_by: boolean
  show_page_numbers: boolean
}

export const REPORT_SETTINGS_ID = -1
export const MAX_HEADER_IMAGE_CHARS = 1_500_000

export const DEFAULT_REPORT_SETTINGS: ReportPrintSettings = {
  paper_size: "A4",
  orientation: "portrait",
  custom_width_mm: 210,
  custom_height_mm: 297,
  auto_landscape: true,
  margin_top_mm: 10,
  margin_right_mm: 8,
  margin_bottom_mm: 12,
  margin_left_mm: 8,
  show_header: true,
  header_type: "text",
  header_image: "",
  header_image_height_mm: 30,
  show_logo: true,
  show_company_name: true,
  company_name_font_size: 18,
  show_company_address: true,
  company_address_font_size: 10,
  show_tax_number: true,
  tax_number_font_size: 10,
  header_text: "",
  show_report_title: true,
  header_underline: "single",
  border_frame: false,
  font_family: "Cairo",
  data_font_size: 10,
  cell_padding_mm: 1.2,
  accent_color: "#0f766e",
  zebra_rows: true,
  show_footer: true,
  footer_text: "",
  show_print_date: true,
  show_printed_by: true,
  show_page_numbers: true,
}

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export function normalizeReportSettings(raw: Partial<ReportPrintSettings> | null | undefined): ReportPrintSettings {
  const merged = { ...DEFAULT_REPORT_SETTINGS, ...(raw || {}) } as ReportPrintSettings
  const bool = (key: keyof ReportPrintSettings) => (merged[key] as unknown) !== false && (merged[key] as unknown) !== "false"
  const image = String(merged.header_image || "")
  return {
    ...merged,
    paper_size: merged.paper_size in PAPER_SIZES || merged.paper_size === "Custom" ? merged.paper_size : "A4",
    orientation: merged.orientation === "landscape" ? "landscape" : "portrait",
    custom_width_mm: clamp(merged.custom_width_mm, 210, 40, 600),
    custom_height_mm: clamp(merged.custom_height_mm, 297, 40, 1200),
    margin_top_mm: clamp(merged.margin_top_mm, 10, 0, 60),
    margin_right_mm: clamp(merged.margin_right_mm, 8, 0, 60),
    margin_bottom_mm: clamp(merged.margin_bottom_mm, 12, 0, 60),
    margin_left_mm: clamp(merged.margin_left_mm, 8, 0, 60),
    header_type: merged.header_type === "image" ? "image" : "text",
    header_image: /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(image) && image.length <= MAX_HEADER_IMAGE_CHARS ? image : "",
    header_image_height_mm: clamp(merged.header_image_height_mm, 30, 8, 120),
    company_name_font_size: clamp(merged.company_name_font_size, 18, 8, 40),
    company_address_font_size: clamp(merged.company_address_font_size, 10, 6, 24),
    tax_number_font_size: clamp(merged.tax_number_font_size, 10, 6, 24),
    header_text: String(merged.header_text || "").slice(0, 500),
    header_underline: ["none", "single", "double", "thick"].includes(merged.header_underline) ? merged.header_underline : "single",
    font_family: String(merged.font_family || "Cairo").slice(0, 60),
    data_font_size: clamp(merged.data_font_size, 10, 6, 18),
    cell_padding_mm: clamp(merged.cell_padding_mm, 1.2, 0, 6),
    accent_color: /^#[0-9a-f]{6}$/i.test(String(merged.accent_color)) ? merged.accent_color : DEFAULT_REPORT_SETTINGS.accent_color,
    footer_text: String(merged.footer_text || "").slice(0, 500),
    auto_landscape: bool("auto_landscape"),
    show_header: bool("show_header"),
    show_logo: bool("show_logo"),
    show_company_name: bool("show_company_name"),
    show_company_address: bool("show_company_address"),
    show_tax_number: bool("show_tax_number"),
    show_report_title: bool("show_report_title"),
    border_frame: merged.border_frame === true || (merged.border_frame as unknown) === "true",
    zebra_rows: bool("zebra_rows"),
    show_footer: bool("show_footer"),
    show_print_date: bool("show_print_date"),
    show_printed_by: bool("show_printed_by"),
    show_page_numbers: bool("show_page_numbers"),
  }
}

export function reportPaper(settings: ReportPrintSettings, landscape: boolean) {
  const base = settings.paper_size === "Custom"
    ? { width: settings.custom_width_mm, height: settings.custom_height_mm, receipt: false }
    : { receipt: false, ...PAPER_SIZES[settings.paper_size] }
  const turn = landscape && !base.receipt
  return { widthMm: turn ? base.height : base.width, heightMm: turn ? base.width : base.height, receipt: Boolean(base.receipt) }
}
