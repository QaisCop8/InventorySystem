export type VatAmountAction = "add" | "remove" | null

export type ParsedItemAmount = {
  amount: number
  vatAction: VatAmountAction
}

export type AppliedItemAmountAction = {
  productId: number | null
  action: Exclude<VatAmountAction, null>
  vatRate: number
  inputAmount: number
  netAmount: number
  displayAmount: number
}

const normalizeItemAmountText = (value: unknown) => String(value ?? "")
  .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/٫/g, ".")

const isValidAmountDraft = (value: string, allowVatAction: boolean) => {
  if (value === "" || /^\d*(?:\.\d*)?$/.test(value)) return true
  return allowVatAction && /^(?:\d+(?:\.\d*)?|\.\d+)[+-]$/.test(value)
}

/** Filter keystrokes and pasted text in editable item-amount cells. */
export function guardItemAmountInput(grid: any, row: number, col: number, allowVatAction: boolean) {
  window.setTimeout(() => {
    const selection = grid?.selection
    if (selection && (selection.row !== row || selection.col !== col)) return
    const editor = grid?.activeEditor as HTMLInputElement | null
    if (!editor || typeof editor.addEventListener !== "function") return

    const editorWithGuard = editor as HTMLInputElement & { __itemAmountGuardCleanup?: () => void }
    editorWithGuard.__itemAmountGuardCleanup?.()

    const isValidInsertion = (input: HTMLInputElement, insertedText: string) => {
      const start = input.selectionStart ?? input.value.length
      const end = input.selectionEnd ?? start
      const normalizedText = normalizeItemAmountText(input.value)
      const normalizedInsertion = normalizeItemAmountText(insertedText)
      return isValidAmountDraft(
        `${normalizedText.slice(0, start)}${normalizedInsertion}${normalizedText.slice(end)}`,
        allowVatAction,
      )
    }

    const onBeforeInput = (event: InputEvent) => {
      if (!event.inputType.startsWith("insert") || event.data == null) return
      if (!isValidInsertion(editor, event.data)) event.preventDefault()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return
      if (event.key === "+" || event.key === "-") {
        if (!allowVatAction) {
          event.preventDefault()
          return
        }
        const amountText = normalizeItemAmountText(editor.value).trim().replace(/[+-]$/, "")
        if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(amountText)) {
          event.preventDefault()
          return
        }
        event.preventDefault()
        editor.value = `${amountText}${event.key}`
        try {
          editor.setSelectionRange(editor.value.length, editor.value.length)
        } catch {
          // Some native editors do not expose selection APIs.
        }
        editor.dispatchEvent(new Event("input", { bubbles: true }))
        return
      }
      if (!isValidInsertion(editor, event.key)) event.preventDefault()
    }
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text") ?? ""
      if (!isValidInsertion(editor, text)) event.preventDefault()
    }
    const onInput = () => {
      const normalized = normalizeItemAmountText(editor.value)
      if (normalized === editor.value) return
      const caret = editor.selectionStart ?? normalized.length
      editor.value = normalized
      try {
        editor.setSelectionRange(caret, caret)
      } catch {
        // Some native numeric editors do not support selection APIs.
      }
    }
    const cleanup = () => {
      editor.removeEventListener("keydown", onKeyDown)
      editor.removeEventListener("beforeinput", onBeforeInput)
      editor.removeEventListener("paste", onPaste)
      editor.removeEventListener("input", onInput)
      editor.removeEventListener("blur", cleanup)
      delete editorWithGuard.__itemAmountGuardCleanup
    }

    editor.addEventListener("keydown", onKeyDown)
    editor.addEventListener("beforeinput", onBeforeInput)
    editor.addEventListener("paste", onPaste)
    editor.addEventListener("input", onInput)
    editor.addEventListener("blur", cleanup, { once: true })
    editorWithGuard.__itemAmountGuardCleanup = cleanup

    // If the first key opened editing before the grid handler ran, discard an invalid draft.
    const currentDraft = normalizeItemAmountText(editor.value).trim()
    if (!isValidAmountDraft(currentDraft, allowVatAction)) {
      const original = normalizeItemAmountText(grid.getCellData(row, col, false)).trim()
      editor.value = isValidAmountDraft(original, false) ? original : ""
    }
  }, 0)
}

/** Handle amount-cell key input, including a trailing + / - VAT action. */
export function handleItemAmountKeyDown(grid: any, event: KeyboardEvent, allowVatAction: boolean) {
  const selection = grid?.selection
  if (!selection || !event || typeof event.key !== "string") return false
  const { row, col } = selection
  if (row < 0 || col < 0) return false

  const columnName = grid.columns?.[col]?.binding ?? grid.columns?.[col]?.name
  if (columnName !== "amount" && columnName !== "total_price") return false

  const target = event.target as HTMLInputElement | null
  const editor = (grid.activeEditor || (target && typeof target.value === "string" ? target : null)) as HTMLInputElement | null
  const currentText = normalizeItemAmountText(editor?.value ?? grid.getCellData(row, col, false) ?? "").trim()

  if (event.key === "+" || event.key === "-") {
    if (!allowVatAction) {
      event.preventDefault()
      return true
    }

    const amountText = currentText.replace(/[+-]$/, "")
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(amountText)) {
      event.preventDefault()
      return true
    }

    const nextText = `${amountText}${event.key}`
    event.preventDefault()
    const writeDraft = (activeEditor: HTMLInputElement | null) => {
      if (!activeEditor) return
      activeEditor.value = nextText
      try {
        activeEditor.setSelectionRange(nextText.length, nextText.length)
      } catch {
        // Some native editors do not expose selection APIs.
      }
      activeEditor.dispatchEvent(new Event("input", { bubbles: true }))
    }

    if (editor) writeDraft(editor)
    else {
      grid.startEditing?.(true, row, col)
      // Wijmo may create the editor after the current keydown handler returns.
      window.setTimeout(() => {
        const currentSelection = grid?.selection
        if (currentSelection?.row !== row || currentSelection?.col !== col) return
        writeDraft(grid.activeEditor as HTMLInputElement | null)
      }, 0)
    }
    return true
  }

  if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return false
  const keyText = normalizeItemAmountText(event.key)
  const start = editor?.selectionStart ?? currentText.length
  const end = editor?.selectionEnd ?? start
  const candidate = `${currentText.slice(0, start)}${keyText}${currentText.slice(end)}`
  if (!isValidAmountDraft(candidate, allowVatAction)) {
    event.preventDefault()
    return true
  }
  return false
}

/** Convert edited grid values into finite numbers without treating blanks as zero. */
export function finiteItemNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null
  const parsed = typeof value === "number" ? value : Number(String(value).trim())
  return Number.isFinite(parsed) ? parsed : null
}

/** Read an amount with an optional trailing + (add VAT) or - (remove included VAT). */
export function parseItemAmount(value: unknown): ParsedItemAmount | null {
  const raw = normalizeItemAmountText(value).trim()
  const match = raw.match(/^(\d+(?:\.\d*)?|\.\d+)\s*([+-])?$/)
  if (!match) return null

  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null

  return {
    amount,
    vatAction: match[2] === "+" ? "add" : match[2] === "-" ? "remove" : null,
  }
}

/** Keep line amounts net; the voucher's VAT calculation adds VAT once at totals time. */
export function netItemAmount(amount: number, vatAction: VatAmountAction, vatRate: number, alreadyAdjusted = false): number {
  if (vatAction !== "remove" || alreadyAdjusted) return amount
  const safeRate = Number.isFinite(vatRate) ? vatRate : 0
  return safeRate > 0 ? Math.round((amount / (1 + safeRate / 100)) * 100) / 100 : amount
}

/** Apply the typed VAT suffix once while keeping tax in the voucher's VAT calculation. */
export function applyItemAmountAction(
  amount: number,
  action: VatAmountAction,
  vatRate: number,
  productId: number | null,
  previous?: AppliedItemAmountAction,
) {
  const safeRate = Number.isFinite(vatRate) ? vatRate : 0
  const previousMatches = Boolean(action && previous && previous.productId === productId && previous.action === action && (
    Math.abs(previous.vatRate - safeRate) < 0.000001 && (
      Math.abs(previous.inputAmount - amount) < 0.000001 || Math.abs(previous.displayAmount - amount) < 0.000001
    )
  ))

  if (previousMatches && previous) {
    return { netAmount: previous.netAmount, displayAmount: previous.displayAmount, adjustment: previous }
  }

  const netAmount = netItemAmount(amount, action, safeRate)
  const displayAmount = action === "add" && safeRate > 0
    ? Math.round((amount * (1 + safeRate / 100)) * 100) / 100
    : netAmount
  const adjustment: AppliedItemAmountAction | null = action
    ? { productId, action, vatRate: safeRate, inputAmount: amount, netAmount, displayAmount }
    : null

  return { netAmount, displayAmount, adjustment }
}
