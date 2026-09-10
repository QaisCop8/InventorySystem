// Usage: node scripts/migrate-integer-user-ids.cjs [--apply]
// Enumerates registered company databases; never migrates the management database.
const {Client}=require('pg')
const {loadEnvConfig}=require('@next/env')
const quote=value=>'"'+String(value).replaceAll('"','""')+'"'
const userColumns=['user_id','insert_user','update_user','assigned_user_id','from_user_id','to_user_id','handover_to_user_id','claimed_by_user_id','operation_user_id','update_user_id']
const creatorTables=['inventory_transactions','task_customer_orders','task_order_items','sales_order_drafts','workflow_sequences']

async function migrate(client,apply=false){
 await client.query('BEGIN')
 try{
  await client.query("SET LOCAL lock_timeout='5s'")
  const {rows:columns}=await client.query(`SELECT c.table_name,c.column_name,c.data_type FROM information_schema.columns c JOIN pg_class t ON t.relname=c.table_name JOIN pg_namespace n ON n.oid=t.relnamespace AND n.nspname=c.table_schema WHERE c.table_schema='public' AND t.relkind='r' AND (c.column_name=ANY($1::text[]) OR (c.table_name='chat_messages' AND c.column_name IN ('sender_id','receiver_id')) OR (c.table_name='task_transfer_logs' AND c.column_name='admin_id') OR (c.table_name=ANY($2::text[]) AND c.column_name IN ('created_by','updated_by','approved_by'))) ORDER BY c.table_name,c.ordinal_position`,[userColumns,creatorTables])
  if(!columns.some(c=>c.table_name==='user_settings'&&c.column_name==='user_id'))throw Error('Missing user_settings.user_id')
  // Locks ensure validation and conversion see exactly the same records.
  for(const table of [...new Set(columns.map(c=>c.table_name))].sort())await client.query(`LOCK TABLE public.${quote(table)} IN ACCESS EXCLUSIVE MODE`)
  const {rows:fks}=await client.query(`SELECT c.conname,c.conrelid::regclass::text table_name, a.attname column_name,c.confrelid::regclass::text target_table,ta.attname target_column,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1] JOIN pg_attribute ta ON ta.attrelid=c.confrelid AND ta.attnum=c.confkey[1] WHERE c.contype='f' AND array_length(c.conkey,1)=1`)
  const issues=[]
  for(const col of columns){
   const t=`public.${quote(col.table_name)}`,a=quote(col.column_name)
   const {rows:[bad]}=await client.query(`SELECT count(*)::int count FROM ${t} WHERE ${a} IS NOT NULL AND CASE WHEN ${a}::text ~ '^[0-9]+$' THEN ${a}::text::numeric NOT BETWEEN 1 AND 2147483647 ELSE TRUE END`)
   if(bad.count){issues.push(`${col.table_name}.${col.column_name}: ${bad.count} invalid IDs`);continue}
   if(col.table_name==='user_settings')continue
   const fk=fks.find(f=>f.table_name===col.table_name&&f.column_name===col.column_name)
   // Existing references to surrogate user_settings.id remain valid and keep their semantics.
   if(fk&&fk.target_table!=='user_settings')throw Error(`Unexpected user reference: ${col.table_name}.${col.column_name} -> ${fk.target_table}`)
   const target=fk?.target_column||'user_id'
   const {rows:[orphan]}=await client.query(`SELECT count(*)::int count FROM ${t} src WHERE src.${a} IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_settings u WHERE u.${quote(target)}::text::numeric=src.${a}::text::numeric)`)
   if(orphan.count)issues.push(`${col.table_name}.${col.column_name}: ${orphan.count} missing users`)
  }
  const {rows:duplicates}=await client.query('SELECT user_id::text::numeric FROM public.user_settings GROUP BY user_id::text::numeric HAVING count(*)>1')
  if(duplicates.length)issues.push('User IDs collide after integer conversion')
  if(issues.length)throw Error(issues.join('; '))
  const changing=columns.filter(c=>c.data_type!=='integer')
  const affected=fks.filter(f=>changing.some(c=>c.table_name===f.table_name&&c.column_name===f.column_name||c.table_name===f.target_table&&c.column_name===f.target_column))
  for(const fk of affected)await client.query(`ALTER TABLE public.${quote(fk.table_name)} DROP CONSTRAINT ${quote(fk.conname)}`)
  for(const col of changing)await client.query(`ALTER TABLE public.${quote(col.table_name)} ALTER COLUMN ${quote(col.column_name)} TYPE integer USING ${quote(col.column_name)}::text::integer`)
  for(const fk of affected)await client.query(`ALTER TABLE public.${quote(fk.table_name)} ADD CONSTRAINT ${quote(fk.conname)} ${fk.definition}`)
  for(const col of columns){
   if(col.table_name==='user_settings'||fks.some(f=>f.table_name===col.table_name&&f.column_name===col.column_name))continue
   const name=`fk_${col.table_name}_${col.column_name}_user`.slice(0,63)
   await client.query(`ALTER TABLE public.${quote(col.table_name)} ADD CONSTRAINT ${quote(name)} FOREIGN KEY (${quote(col.column_name)}) REFERENCES public.user_settings(user_id) ON DELETE RESTRICT`)
  }
  await client.query('CREATE SEQUENCE IF NOT EXISTS public.user_settings_user_id_seq AS integer')
  const {rows:[owner]}=await client.query("SELECT pg_get_userbyid(relowner) name FROM pg_class WHERE oid='public.user_settings'::regclass")
  await client.query(`ALTER SEQUENCE public.user_settings_user_id_seq OWNER TO ${quote(owner.name)}`)
  await client.query('ALTER SEQUENCE public.user_settings_user_id_seq OWNED BY public.user_settings.user_id')
  await client.query("ALTER TABLE public.user_settings ALTER COLUMN user_id SET DEFAULT nextval('public.user_settings_user_id_seq')")
  const {rows:[next]}=await client.query("SELECT GREATEST(COALESCE(MAX(user_id),0)+1,(SELECT CASE WHEN is_called THEN last_value+1 ELSE last_value END FROM public.user_settings_user_id_seq)) next FROM public.user_settings")
  await client.query(`ALTER SEQUENCE public.user_settings_user_id_seq RESTART WITH ${Number(next.next)}`)
  await client.query(apply?'COMMIT':'ROLLBACK')
  return {columns:columns.length,converted:changing.length,applied:apply}
 }catch(error){await client.query('ROLLBACK');throw error}
}
module.exports={migrate}
if(require.main===module){
 loadEnvConfig(process.cwd())
 ;(async()=>{
  const management=new Client({connectionString:process.env.DATABASE_URL});await management.connect()
  const {rows:databases}=await management.query('SELECT DISTINCT db_name FROM companies WHERE db_name IS NOT NULL ORDER BY db_name');await management.end()
  let failures=0
  for(const {db_name}of databases){const url=new URL(process.env.DATABASE_URL);url.pathname='/'+db_name;const client=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000});try{await client.connect();console.log(JSON.stringify({database:db_name,...await migrate(client,process.argv.includes('--apply'))}))}catch(error){failures++;console.error(JSON.stringify({database:db_name,error:error.message}))}finally{await client.end()}}
  process.exitCode=failures?1:0
 })().catch(error=>{console.error(error.message);process.exitCode=1})
}
