"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, QrCode } from "lucide-react";
import { parseTicketQrPayload } from "@/lib/etickets/credentials";

type ScanResult = { result: "checked_in" | "already_checked_in"; ticketCode: string; bookingCode?: string; serviceName?: string; guests?: number; checkedInAt: string };

export default function TicketCheckinScanner() {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<{ stop: () => void } | null>(null);
  const submitted = useRef(false);
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

  function stopCamera() {
    controls.current?.stop(); controls.current = null; setCameraOn(false);
    if (video.current?.srcObject instanceof MediaStream) for (const track of video.current.srcObject.getTracks()) track.stop();
    if (video.current) video.current.srcObject = null;
  }
  useEffect(() => () => { controls.current?.stop(); if (video.current?.srcObject instanceof MediaStream) for (const track of video.current.srcObject.getTracks()) track.stop(); }, []);

  async function check(raw = credential) {
    const code = raw.trim();
    if (!parseTicketQrPayload(code)) { setMessage("Format QR tidak valid. Gunakan QR E-Tiket SHIAP."); return; }
    setBusy(true); setMessage(""); setResult(null);
    try {
      const response = await fetch("/api/admin/tickets/check-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: code }) });
      const body = await response.json();
      if (response.status === 409 && body.result === "already_checked_in") { setResult(body); setMessage("Tiket ini sudah pernah di-check-in. Kehadiran tidak dicatat ulang."); return; }
      if (!response.ok) throw new Error(body.error || "Tiket tidak dapat digunakan.");
      setResult(body); setMessage("Check-in berhasil dicatat satu kali.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Check-in gagal."); }
    finally { setBusy(false); }
  }

  async function startCamera() {
    if (!video.current || cameraOn) return;
    setMessage(""); submitted.current = false;
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const current = await reader.decodeFromVideoDevice(undefined, video.current, (decoded, _error, scannerControls) => {
        if (!decoded || submitted.current) return;
        const raw = decoded.getText();
        if (!parseTicketQrPayload(raw)) { setMessage("QR terbaca, tetapi bukan tiket SHIAP."); return; }
        submitted.current = true; setCredential(raw); stopCamera(); void check(raw);
        scannerControls.stop();
      });
      controls.current = current; setCameraOn(true);
    } catch { setMessage("Kamera tidak tersedia. Izinkan akses kamera atau masukkan kode QR secara manual."); stopCamera(); }
  }

  return <section className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#1265D8]">OPERASIONAL</p><h2 className="mt-1 text-xl font-extrabold text-[#0A2E63]">Check-in E-Tiket</h2><p className="mt-1 text-sm leading-6 text-slate-600">Pindai hanya setelah memeriksa tiket saat tamu hadir. Hanya Admin yang dapat mencatat kehadiran. QR tidak memuat data pribadi.</p></div>
    <video ref={video} aria-label="Pratinjau kamera pemindai QR" className={`${cameraOn ? "block" : "hidden"} aspect-video w-full rounded-xl bg-slate-950 object-cover`} muted playsInline/>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => cameraOn ? stopCamera() : void startCamera()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1265D8] px-4 text-sm font-bold text-white">{cameraOn ? <CameraOff size={17}/> : <Camera size={17}/>} {cameraOn ? "Matikan kamera" : "Pindai dengan kamera"}</button></div>
    <div className="space-y-2"><label htmlFor="ticket-qr" className="text-xs font-bold text-[#0A2E63]">Atau tempel isi QR secara manual</label><div className="flex flex-col gap-2 sm:flex-row"><input id="ticket-qr" value={credential} onChange={(event) => setCredential(event.target.value)} autoComplete="off" spellCheck={false} placeholder="SHIAP1:…" className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm"/><button type="button" disabled={busy} onClick={() => void check()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-[#1265D8] disabled:opacity-50"><QrCode size={16}/>{busy ? "Memeriksa…" : "Verifikasi & check-in"}</button></div></div>
    {message && <p role="status" className={`rounded-xl p-3 text-sm ${result?.result === "checked_in" ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-[#0A2E63]"}`}>{message}</p>}
    {result && <article className="space-y-1 rounded-xl border border-slate-200 bg-[#F7F9FC] p-3 text-sm"><p className="font-bold text-[#0A2E63]">Tiket {result.ticketCode}</p>{result.bookingCode && <p>Booking {result.bookingCode}</p>}{result.serviceName && <p>{result.serviceName} · {result.guests} peserta</p>}<p className="text-xs text-slate-600">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(result.checkedInAt))} WITA</p></article>}
  </section>;
}
