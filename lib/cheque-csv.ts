/** Excel-compatible Unicode CSV, including an explicit little-endian BOM. */
export function createChequeCsvBlob(rows: unknown[][]): Blob {
  const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`
  const text = "sep=,\r\n" + rows.map(row => row.map(quote).join(",")).join("\r\n") + "\r\n"
  const bytes = new Uint8Array(2 + text.length * 2)
  bytes[0] = 0xff
  bytes[1] = 0xfe
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    bytes[2 + index * 2] = code & 0xff
    bytes[3 + index * 2] = code >>> 8
  }
  return new Blob([bytes], { type: "text/csv;charset=utf-16le" })
}
