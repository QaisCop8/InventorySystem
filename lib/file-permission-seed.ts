import { FILE_ACTIONS, FILE_FAMILY_KEYS, FILE_PERMISSION_CATEGORY, filePermissionName, parseFilePermission } from "./file-permission-definitions"

type PermissionClient = { query: (query: string, values: any[]) => Promise<any[]> }

/** Keep legacy ids/grants, including explicit denials, while completing the file matrix. */
export async function seedFilePermissionDefinitions(client: PermissionClient) {
  for (const table of ["access_category", "access_list"]) await client.query(
    `SELECT setval(pg_get_serial_sequence('${table}','id'),GREATEST(COALESCE((SELECT MAX(id) FROM ${table}),0),1),true)`, [],
  )
  const categoryRows = await client.query(
    `INSERT INTO access_category (name) SELECT $1::varchar
     WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name=$1::varchar) RETURNING id`,
    [FILE_PERMISSION_CATEGORY],
  )
  const category = categoryRows[0] || (await client.query(`SELECT id FROM access_category WHERE name=$1::varchar ORDER BY id LIMIT 1`, [FILE_PERMISSION_CATEGORY]))[0]
  const existing = await client.query(`SELECT id,name FROM access_list ORDER BY id`, [])
  // مفاتيح موحّدة (حروف صغيرة بلا فراغات طرفية) — نفس مقارنة الفهرس الفريد idx_access_list_normalized_name، وإلا قد
  // تُعاد تسمية صف إلى اسم موجود بفرق حالة/فراغ فقط فيفشل بـ"duplicate key value violates unique constraint".
  const key = (name: unknown) => String(name ?? "").trim().toLowerCase()
  const names = new Map<string, number>(existing.map(row => [key(row.name), Number(row.id)]))
  for (const row of existing) {
    const parsed = parseFilePermission(row.name)
    if (!parsed) continue
    const canonical = filePermissionName(parsed.family, parsed.action)
    if (!names.has(key(canonical))) {
      await client.query(`UPDATE access_list SET name=$1::varchar,category_id=$2::integer,updated_at=CURRENT_TIMESTAMP WHERE id=$3::integer`, [canonical, category.id, row.id])
      names.set(key(canonical), Number(row.id))
    }
  }
  const permissionNames = FILE_FAMILY_KEYS.flatMap(family => FILE_ACTIONS.map(action => filePermissionName(family, action)))
  const inserted = await client.query(
    `INSERT INTO access_list (name,category_id,sort_order)
     SELECT name,$2::integer,ordinality::integer FROM unnest($1::text[]) WITH ORDINALITY AS p(name,ordinality)
     ON CONFLICT DO NOTHING RETURNING id,name`, [permissionNames, category.id],
  )
  const current = await client.query(`SELECT id,name FROM access_list WHERE name=ANY($1::text[])`, [permissionNames])
  const ids = new Map<string, number>(current.map(row => [row.name, Number(row.id)]))
  for (const row of existing) {
    const parsed = parseFilePermission(row.name)
    if (!parsed) continue
    const targetId = ids.get(filePermissionName(parsed.family, parsed.action))
    if (!targetId || targetId === Number(row.id)) continue
    for (const [table, keys] of [
      ["user_access", ["user_id"]], ["role_permissions", ["role_id"]],
      ["user_branch_permissions", ["user_id", "branch_id"]], ["role_branch_permissions", ["role_id", "branch_id"]],
    ] as const) {
      const columns = keys.join(",")
      await client.query(
        `INSERT INTO ${table} (${columns},access_id,is_granted)
         SELECT ${columns},$1::integer,is_granted FROM ${table} WHERE access_id=$2::integer
         ON CONFLICT (${columns},access_id) DO NOTHING`, [targetId, row.id],
      )
    }
  }
  await client.query(
    `UPDATE access_list a SET category_id=$2::integer,sort_order=p.ordinality::integer
     FROM unnest($1::text[]) WITH ORDINALITY AS p(name,ordinality) WHERE a.name=p.name`,
    [permissionNames, category.id],
  )
  // Seed only genuinely new permissions; refreshing must not undo restrictions on an existing role.
  const insertedIds = inserted.map(row => Number(row.id))
  if (insertedIds.length) await client.query(
    `INSERT INTO role_permissions (role_id,access_id,is_granted)
     SELECT r.id,p.id,TRUE FROM job_roles r CROSS JOIN unnest($1::integer[]) p(id)
     WHERE LOWER(r.name)=LOWER('مدير') ON CONFLICT (role_id,access_id) DO NOTHING`, [insertedIds],
  )
}
