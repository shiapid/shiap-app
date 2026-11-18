// Generate an in-memory diagnostic for SSH stdin. No credentials are bundled,
// no remote files are installed, and only the configured admin may receive a test.
import {readFile,readdir} from "node:fs/promises";
import path from "node:path";
const root=path.resolve("node_modules/nodemailer");
const sources={};
async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await collect(file);else if(/\.(js|json)$/.test(entry.name))sources[path.relative(root,file).replaceAll("\\","/")]=await readFile(file,"utf8");}}
await collect(path.join(root,"dist","cjs"));await collect(path.join(root,"dist","well-known"));sources["package.json"]=await readFile(path.join(root,"package.json"),"utf8");
const probe=String.raw`
import {readFile,readdir,realpath,readlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const native=createRequire(process.cwd()+'/smtp-memory-probe.cjs');const cache={};
function moduleLoad(file){file=path.posix.normalize(file);if(!sources[file])file=sources[file+'.js']?file+'.js':file+'/index.js';if(cache[file])return cache[file].exports;if(!sources[file])throw new Error('MODULE_NOT_BUNDLED');const module={exports:{}};cache[file]=module;if(file.endsWith('.json'))module.exports=JSON.parse(sources[file]);else new Function('require','module','exports','__filename','__dirname',sources[file])((name)=>name.startsWith('.')?moduleLoad(path.posix.join(path.posix.dirname(file),name)):native(name),module,module.exports,'/smtp-memory/'+file,'/smtp-memory/'+path.posix.dirname(file));return module.exports;}
const nodemailer=moduleLoad('dist/cjs/nodemailer.js');
let env=null;const root='/home/shiapsit/shiap-app';
for(const pid of(await readdir('/proc')).filter((value)=>/^\d+$/.test(value))){try{const cwd=await realpath('/proc/'+pid+'/cwd');const exe=await readlink('/proc/'+pid+'/exe');if(!(cwd===root || cwd.startsWith(root+'/')) || !exe.includes('node'))continue;env=Object.fromEntries((await readFile('/proc/'+pid+'/environ','utf8')).split('\0').filter(Boolean).map((item)=>{const i=item.indexOf('=');return[item.slice(0,i),item.slice(i+1)];}));break;}catch{}}
if(!env){console.log('SMTP_RUNTIME_NOT_FOUND');process.exitCode=1;}
else{
const matches={host:env.SMTP_HOST==='mail.shiap.id',port:env.SMTP_PORT==='465',secure:env.SMTP_SECURE==='true',username:env.SMTP_USER==='notifications@shiap.id',sender:env.SMTP_FROM_EMAIL==='notifications@shiap.id'};console.log(JSON.stringify({configurationMatches:matches,passwordPresent:Boolean(env.SMTP_PASSWORD),adminRecipientPresent:Boolean(env.ADMIN_NOTIFICATION_EMAIL)}));
if(Object.values(matches).every(Boolean) && env.SMTP_PASSWORD){
const transport=nodemailer.createTransport({host:env.SMTP_HOST,port:465,secure:true,auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},tls:{servername:env.SMTP_HOST,rejectUnauthorized:true,minVersion:'TLSv1.2'},logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,connectionTimeout:12000,greetingTimeout:12000,socketTimeout:20000,dnsTimeout:10000});
let stage='verify';try{await transport.verify();console.log('SMTP_TLS_AND_AUTH_OK');
if(sendTest && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.ADMIN_NOTIFICATION_EMAIL||'')){stage='test_email';const info=await transport.sendMail({from:{name:env.SMTP_FROM_NAME||'SHIAP',address:env.SMTP_FROM_EMAIL},to:[env.ADMIN_NOTIFICATION_EMAIL],subject:'SHIAP — Uji koneksi SMTP cPanel',text:'Ini satu email uji SMTP SHIAP yang diminta Admin. Tidak ada booking atau pembayaran dibuat. Pengiriman otomatis tetap nonaktif. Periksa Authentication-Results pada header asli untuk SPF, DKIM dan DMARC. Balas melalui jalur dukungan operasional jika diperlukan.'});console.log(JSON.stringify({testEmailAcceptedBySmtp:Boolean(info.accepted?.length),inboxDeliveryConfirmed:false}));}}
catch(error){console.log(JSON.stringify({smtpTestFailed:true,stage,code:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'SMTP_FAILURE',command:['CONN','EHLO','HELO','AUTH','STARTTLS','MAIL FROM','RCPT TO','DATA'].includes(error.command)?error.command:'UNKNOWN',responseCode:Number.isInteger(error.responseCode)?error.responseCode:null}));process.exitCode=1;}finally{transport.close();}
}else{console.log('SMTP_CONFIGURATION_MISMATCH_OR_MISSING');process.exitCode=1;}}
`;
// The generated script contains dependency source and field names only.
process.stdout.write('const sources='+JSON.stringify(sources)+';\nconst sendTest='+String(process.argv.includes('--send-test'))+';\n'+probe);
