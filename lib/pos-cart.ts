// Product IDs identify inventory; the unit is also part of a sale line's identity.
export const posCartLineKey = (line: { id: number; unitId: number | null }) => `${line.id}:${line.unitId ?? "default"}`
