import { createHash, randomInt, randomUUID } from "node:crypto";
import { bookingAdmin } from "@/lib/supabase/booking-admin";
import { configuredEmailProvider, liveEmailAllowed, notificationAdminContext } from "@/lib/notifications/server";
import { validEmail } from "@/lib/notifications/messages";
import { boundedBody, BookingError, privateHeaders, rateLimit, routeError, sameOrigin, uuidPattern } from "@/lib/customer-bookings";

export const runtime="nodejs";
export async function POST(request:Request){
  const {user}=await notificationAdminContext();
  try{
    sameOrigin(request);
    const body=JSON.parse((await boundedBody(request,1024)).toString("utf8"));
    const provider=configuredEmailProvider();
    if(!provider || !liveEmailAllowed())throw new BookingError("Konfigurasi SMTP server belum lengkap atau lingkungan ini bukan production terverifikasi.");
    const admin=bookingAdmin();
    if(body.action==="confirm"){
      if(!uuidPattern.test(body.id || "") || !/^\d{6}$/.test(body.code || ""))throw new BookingError("Kode email uji tidak valid.");
      await rateLimit("smtp-confirm",user.id+":"+body.id,5,900);
      const result=await admin.rpc("notification_confirm_smtp",{p_test:body.id,p_admin:user.id,p_hash:createHash("sha256").update(body.id+":"+body.code).digest("hex"),p_sender:provider.sender,p_fingerprint:provider.fingerprint});
      if(result.error || !result.data)throw new BookingError("Kode salah, sudah digunakan, atau kedaluwarsa. Periksa inbox dan email uji terbaru.");
      return Response.json({confirmed:true,message:"Email uji telah diterima dan dikonfirmasi. Pengiriman otomatis tetap nonaktif sampai Admin mengaktifkannya."},{headers:privateHeaders});
    }
    if(body.action!=="send")throw new BookingError("Aksi tidak valid.");
    await rateLimit("smtp-test-admin",user.id,3,3600);
    await rateLimit("smtp-test-global","all",10,3600);
    const recipient=process.env.ADMIN_NOTIFICATION_EMAIL || (user.email_confirmed_at ? user.email : "") || "";
    if(!validEmail(recipient))throw new BookingError("Atur ADMIN_NOTIFICATION_EMAIL yang valid atau gunakan akun Admin dengan email terverifikasi.");
    if(!await provider.adapter.verifySender(provider.sender))throw new BookingError("Verifikasi koneksi TLS / autentikasi SMTP gagal. Email tetap nonaktif.");
    const id=randomUUID();const code=String(randomInt(100000,1000000));
    const saved=await admin.from("notification_smtp_tests").insert({id,admin_id:user.id,recipient,token_hash:createHash("sha256").update(id+":"+code).digest("hex"),transport_fingerprint:provider.fingerprint});
    if(saved.error)throw new BookingError("Email uji belum dapat dicatat.",503);
    const result=await provider.adapter.send({from:provider.name+" <"+provider.sender+">",to:[recipient],subject:"SHIAP · Uji email SMTP",text:"Email uji SMTP SHIAP. Kode konfirmasi: "+code+". Berlaku 15 menit. Masukkan kode ini di Pengaturan Notifikasi Admin. Pesan ini tidak membuat booking atau pembayaran.",html:'<!doctype html><html lang="id"><body style="background:#F7F9FC;color:#0A2E63;font-family:Arial;padding:24px"><h1>Uji email SHIAP</h1><p>Kode konfirmasi penerimaan email:</p><p style="font-size:28px;color:#1265D8;font-weight:bold">'+code+'</p><p>Berlaku 15 menit. Masukkan di Pengaturan Notifikasi Admin. Tidak ada booking atau pembayaran dibuat.</p></body></html>'},"smtp-test/"+id);
    const state=result.state==="sent"?"accepted":result.error==="SMTP_DELIVERY_UNCERTAIN"?"uncertain":"failed";
    const recorded=await admin.from("notification_smtp_tests").update({state,error_code:result.error || null}).eq("id",id);
    if(recorded.error)throw new BookingError("Hasil email uji perlu pemeriksaan. Jangan kirim ulang sebelum memeriksa inbox.",503);
    if(state==="failed")throw new BookingError("Email uji gagal. Periksa konfigurasi SMTP. Pengiriman otomatis tetap nonaktif.");
    return Response.json({id,accepted:state==="accepted",message:"Periksa inbox/spam email Admin. Masukkan kode yang diterima untuk membuktikan penerimaan; respons SMTP saja belum membuktikan inbox delivery."},{headers:privateHeaders});
  }catch(error){return routeError(error);}
}
