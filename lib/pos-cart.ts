// Product IDs identify inventory; deferred/non-grouped rows need their own identity.
export const posCartLineKey = (line: { id: number; unitId: number | null; lineId?: string }) => line.lineId || `${line.id}:${line.unitId ?? "default"}`
