import nodemailer from "nodemailer";
import type { DeliveryResult, EmailMessage, EmailProvider } from "./provider";

export function smtpConfiguration(env: NodeJS.ProcessEnv) {
  const validEmail=(value:string)=>value.length<=254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
  const host=env.SMTP_HOST || ""; const user=env.SMTP_USER || ""; const sender=env.SMTP_FROM_EMAIL || ""; const name=env.SMTP_FROM_NAME || "";
  if (!/^[a-z0-9.-]+$/i.test(host) || env.SMTP_PORT!=="465" || env.SMTP_SECURE!=="true" || !validEmail(user) || !env.SMTP_PASSWORD
    || !validEmail(sender) || sender.toLowerCase()!==user.toLowerCase() || !name.trim() || name.length>80 || /[\r\n<>]/.test(name)) return null;
  return {host,port:465,secure:true as const,auth:{user,pass:env.SMTP_PASSWORD},sender,name,
    tls:{rejectUnauthorized:true,minVersion:"TLSv1.2" as const,servername:host},
    logger:false as const,debug:false,disableFileAccess:true,disableUrlAccess:true,
    connectionTimeout:12000,greetingTimeout:12000,socketTimeout:20000,dnsTimeout:10000,pool:false};
}
type SmtpFailure={code?:string;command?:string;responseCode?:number};
export function classifySmtpFailure(error:SmtpFailure):DeliveryResult {
  const code=error.responseCode;
  if(code && code>=400 && code<500) return {state:"retry",error:"SMTP_TEMPORARY_REJECTION"};
  if(code && code>=500) return {state:"failed",error:"SMTP_PERMANENT_REJECTION"};
  if(error.code==="EAUTH")return {state:"failed",error:"SMTP_AUTHENTICATION_FAILED"};
  if(["CONN","EHLO","HELO","AUTH","STARTTLS","MAIL FROM","RCPT TO"].includes(error.command || ""))return {state:"retry",error:"SMTP_CONNECTION_FAILURE"};
  // A disconnect/timeout after DATA may follow acceptance by the remote MTA.
  // SMTP has no durable idempotency protocol: require manual reconciliation.
  return {state:"failed",error:"SMTP_DELIVERY_UNCERTAIN"};
}
type Transport={verify():Promise<unknown>;sendMail(message:EmailMessage & {messageId:string}):Promise<{accepted?:unknown[];messageId?:string}>};
export function smtpProvider(config: NonNullable<ReturnType<typeof smtpConfiguration>>, transport:Transport=nodemailer.createTransport(config)):EmailProvider {
  return {
    idempotent:false,
    async verifySender(email){if(email!==config.sender)return false;try{await transport.verify();return true;}catch{return false;}},
    async send(message,key){
      try{
        const result=await transport.sendMail({...message,messageId:"<"+key.replace(/[^a-zA-Z0-9-]/g,"-")+"@shiap.id>"});
        if(!result.accepted?.length)return {state:"failed",error:"SMTP_RECIPIENT_REJECTED"};
        return {state:"sent",reference:result.messageId};
      }catch(error){return classifySmtpFailure(error as SmtpFailure);}
    },
  };
}
