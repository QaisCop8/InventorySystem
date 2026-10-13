// Usage: node scripts/migrate-integer-user-ids.cjs [--apply]
// Enumerates registered company databases; never migrates the management database.
const {Client}=require('pg')
const {loadEnvConfig}=require('@next/env')
const {migrate}=require('../lib/integer-user-ids-migration.cjs')
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
