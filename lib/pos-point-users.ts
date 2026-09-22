export type PosPointUser = { user_id: string; is_default?: boolean }

export function normalizePosPointUsers(value: unknown): PosPointUser[] {
  const users = new Map<string, PosPointUser>()
  for (const row of Array.isArray(value) ? value : []) {
    const userId = String(row?.user_id ?? row ?? "").trim()
    if (!/^\d+$/.test(userId) || Number(userId) <= 0) continue
    users.set(userId, { user_id: userId, is_default: Boolean(row?.is_default) })
  }
  return [...users.values()]
}

export function togglePosPointUser(users: unknown, userId: string | number, checked: boolean): PosPointUser[] {
  const id = String(userId)
  const selected = normalizePosPointUsers(users)
  if (!checked) return selected.filter(row => row.user_id !== id)
  if (selected.some(row => row.user_id === id)) return selected
  return normalizePosPointUsers([...selected, { user_id: id }])
}
