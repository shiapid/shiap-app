// Two independent database connections, only the named local Docker stack.
import {spawn,spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import assert from "node:assert/strict";
const user=randomUUID(),service=randomUUID(),email="commit-"+randomUUID()+"@example.invalid";
const args=["exec","-i","supabase_db_shiap-app","psql","-X","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-At"];
const connection=spawn("docker",args,{stdio:["pipe","pipe","pipe"]});
let stdout="",stderr="";
connection.stdout.on("data",chunk=>stdout+=chunk);connection.stderr.on("data",chunk=>stderr+=chunk);
async function marker(text){const deadline=Date.now()+15000;while(Date.now()<deadline){if(stdout.includes(text))return;if(stderr.includes("ERROR:"))throw new Error("Local transaction failed");await new Promise(resolve=>setTimeout(resolve,50));}throw new Error("Local database timeout");}
function query(sql){const result=spawnSync("docker",[...args,"-c",sql],{encoding:"utf8"});if(result.status!==0)throw new Error("Local query failed");return result.stdout.trim();}
try{
  connection.stdin.write(`begin;
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('${user}','authenticated','authenticated','${email}',now(),'{}','{}',now(),now());
    insert into public.shiap_experiences(id,experience_type,title,slug,base_price,price_basis,status) values('${service}','activity','Local commit test','${service}',100000,'per_unit','published');
    select set_config('request.jwt.claim.sub','${user}',true);
    select * from public.create_booking_order('Local commit test','081234567890','${email}',null,'[{"service_type":"activity","service_catalog_id":"${service}","service_name":"Local commit test","date_start":"2099-01-01","quantity":1,"guests":1}]');
    \\echo SHIAP_UNCOMMITTED
  `);
  await marker("SHIAP_UNCOMMITTED");
  const countSql=`select count(*) from public.notification_events e join public.booking_orders b on b.id=e.booking_id where b.customer_email='${email}' and e.event_type='booking_created'`;
  assert.equal(query(countSql),"0","Uncommitted event visible to dispatcher connection");
  connection.stdin.write("commit;\n\\echo SHIAP_COMMITTED\n");
  await marker("SHIAP_COMMITTED");
  assert.equal(query(countSql),"1");
  console.log("POST_COMMIT_OUTBOX_VISIBILITY_OK: second connection sees exactly one event only after commit");
}finally{
  connection.stdin.end("rollback;\n\\q\n");
  query(`begin;delete from public.booking_orders where user_id='${user}';delete from public.shiap_experiences where id='${service}';delete from auth.users where id='${user}';commit;`);
}
