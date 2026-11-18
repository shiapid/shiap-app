import {readFile,readdir,realpath,readlink} from "node:fs/promises";
import {resolveTxt} from "node:dns/promises";
import {connect} from "node:tls";
const names=["SMTP_HOST","SMTP_PORT","SMTP_SECURE","SMTP_USER","SMTP_PASSWORD","SMTP_FROM_EMAIL","SMTP_FROM_NAME","ADMIN_NOTIFICATION_EMAIL"];
if(process.argv.includes("--inspect-passenger")){
  const root="/home/shiapsit/shiap-app";
  for(const pid of (await readdir("/proc")).filter((value)=>/^\d+$/.test(value))){
    try{
      const cwd=await realpath("/proc/"+pid+"/cwd"); const exe=await readlink("/proc/"+pid+"/exe");
      if(!(cwd===root || cwd.startsWith(root+"/")) || !exe.includes("node"))continue;
      const env=Object.fromEntries((await readFile("/proc/"+pid+"/environ","utf8")).split("\0").filter(Boolean).map((entry)=>{const i=entry.indexOf("=");return [entry.slice(0,i),entry.slice(i+1)];}));
      console.log(JSON.stringify({runtime:"Passenger",presence:Object.fromEntries(names.map((name)=>[name,Boolean(env[name]?.trim())]))}));
    }catch{/* Ignore unrelated/inaccessible processes. */}
  }
}else console.log(JSON.stringify({runtime:"local",presence:Object.fromEntries(names.map((name)=>[name,Boolean(process.env[name]?.trim())]))}));
for(const [record,kind] of [["shiap.id","SPF"],["default._domainkey.shiap.id","DKIM_DEFAULT"],["_dmarc.shiap.id","DMARC"]]){
  try{
    const entries=(await resolveTxt(record)).map((parts)=>parts.join(""));
    const relevant=entries.filter((value)=>kind==="SPF"?value.startsWith("v=spf1"):kind==="DMARC"?value.startsWith("v=DMARC1"):value.includes("p="));
    console.log(JSON.stringify({dns:kind,published:relevant.length===1,...(kind==="DMARC"?{policy:relevant[0]?.match(/(?:^|;)\s*p=(none|quarantine|reject)/)?.[1] || "unknown"}:{})}));
  }catch{console.log(JSON.stringify({dns:kind,published:false}));}
}
await new Promise((resolve)=>{
  let finished=false;
  const socket=connect({host:"mail.shiap.id",port:465,servername:"mail.shiap.id",rejectUnauthorized:true,minVersion:"TLSv1.2"});
  const finish=(result)=>{if(finished)return;finished=true;console.log(JSON.stringify(result));socket.destroy();resolve();};
  socket.setTimeout(12000,()=>finish({smtpTls:false,code:"TIMEOUT"}));
  socket.once("secureConnect",()=>socket.once("data",(data)=>finish({smtpTls:socket.authorized,greeting220:/^220[ -]/.test(data.toString("ascii")),authenticationTested:false})));
  socket.once("error",(error)=>finish({smtpTls:false,code:/^[A-Z0-9_]+$/.test(error.code || "")?error.code:"CONNECTION_FAILURE"}));
});
