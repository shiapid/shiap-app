import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { TicketPdfData } from "./server";
import { ticketQrPayload } from "./credentials.ts";

const navy = "#0A2E63";
const blue = "#1265D8";
const orange = "#FF8518";
const ink = "#16385F";
const muted = "#64748B";
const pageWidth = 595.28;
const pageHeight = 841.89;
const left = 44;
const right = pageWidth - 44;
const contentBottom = 706;
const footerTop = 722;
const logoPath = path.join(process.cwd(), "public", "logo", "shiap-logo.png");
const fontPath = path.join(process.cwd(), "public", "fonts", "Geist-Regular.ttf");

function safeText(value: unknown) {
  if (typeof value === "string") return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (typeof value === "number") return String(value);
  return "";
}
function dateLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value + (value.length === 10 ? "T00:00:00Z" : ""));
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Makassar" }).format(date);
}
function categoryLabel(item: TicketPdfData["items"][number]) {
  const type = (item.service_category || item.service_type).toLowerCase();
  if (type.includes("stay") || type.includes("villa")) return "STAY / VILLA";
  if (type.includes("rental") || type.includes("sewa")) return "RENTAL";
  if (type.includes("shinema") || type.includes("document")) return "SHINEMA / DOKUMENTASI";
  if (type.includes("wahana")) return "WAHANA";
  if (type.includes("experience") || type.includes("activity")) return "EXPERIENCE";
  if (type.includes("trip") || type.includes("strip")) return "TRIP";
  return (item.service_category || item.service_type || "LAYANAN").toUpperCase();
}
function drawFrame(doc: PDFKit.PDFDocument, pageLabel: string, bookingCode: string, ticketCode: string, contacts: TicketPdfData["contacts"]) {
  doc.rect(0, 0, pageWidth, pageHeight).fill("#FFFFFF");
  doc.image(logoPath, left, 28, { fit: [138, 38] });
  doc.font("SHIAP").fontSize(9).fillColor(blue).text("TIKET DIGITAL RESMI", 350, 36, { width: 201, align: "right", characterSpacing: 1.3 });
  doc.moveTo(left, 78).lineTo(right, 78).lineWidth(1.2).strokeColor(orange).stroke();
  doc.font("SHIAP").fontSize(9).fillColor(blue).text(pageLabel.toUpperCase(), left, 94, { characterSpacing: 1.3 });
  doc.font("SHIAP").fontSize(20).fillColor(navy).text("E-Ticket & Digital Voucher", left, 111, { width: 360 });
  doc.fontSize(9).fillColor(muted).text("Booking " + bookingCode + "     ·     Tiket " + ticketCode, left, 139, { width: 360 });
  doc.moveTo(left, footerTop).lineTo(right, footerTop).lineWidth(0.7).strokeColor("#DCE5F0").stroke();
  doc.fontSize(7.5).fillColor(muted).text(`Kontak resmi ${safeText(contacts.contact_name) || "SHIAP"}  ·  ${contactRows(contacts).join("  ·  ")}`, left, footerTop + 9, { width: right - left, lineGap: 1 });
  doc.fontSize(8).fillColor(navy).text("SHIAP  ·  Perjalanan dimulai dari pengalaman yang tertata.", left, footerTop + 76, { width: right - left });
}
function contactRows(contacts: TicketPdfData["contacts"]) {
  const missing = "Belum dikonfigurasi Admin";
  return [
    `Customer Service WhatsApp: ${safeText(contacts.whatsapp) || missing}`,
    `Customer Service Email: ${safeText(contacts.email) || missing}`,
    `Website: ${safeText(contacts.website) || "https://shiap.id"}`,
    "Aplikasi booking: https://app.shiap.id",
    ...(contacts.instagram ? [`Instagram: ${safeText(contacts.instagram)}`] : []),
    ...(contacts.tiktok ? [`TikTok: ${safeText(contacts.tiktok)}`] : []),
    ...(contacts.youtube ? [`YouTube: ${safeText(contacts.youtube)}`] : []),
  ];
}
function details(item: TicketPdfData["items"][number]) {
  const addonValue = Array.isArray(item.selected_addons)
    ? item.selected_addons.map((addon) => typeof addon === "string" ? addon : addon && typeof addon === "object" ? Object.values(addon as Record<string, unknown>).filter((value) => typeof value === "string" || typeof value === "number").join(" · ") : "").filter(Boolean).join(", ")
    : "";
  const date = [dateLabel(item.date_start), dateLabel(item.date_end)].filter(Boolean).join(" – ");
  const time = item.session || (item.service_type === "stay" ? [item.check_in_time ? "Check-in " + item.check_in_time : "", item.check_out_time ? "Check-out " + item.check_out_time : ""].filter(Boolean).join(" · ") : "");
  return [
    ["Tanggal reservasi", date],
    ["Waktu / sesi", time],
    ["Titik kumpul / lokasi", item.location || ""],
    ["Peserta / unit", `${item.guests} orang · ${item.quantity} ${item.service_type === "stay" ? "unit/kamar" : "unit layanan"}`],
    ["Paket dan detail layanan", [item.variant, addonValue, item.notes].filter(Boolean).join(" · ")],
  ].filter((entry) => entry[1]);
}

export async function createTicketPdf(tickets: TicketPdfData[]) {
  if (!tickets.length) throw new Error("NO_TICKETS");
  const doc = new PDFDocument({ size: "A4", margin: 0, compress: true, info: { Title: "SHIAP E-Ticket", Author: "SHIAP" } });
  doc.registerFont("SHIAP", fontPath);
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  for (const [index, ticketData] of tickets.entries()) {
    if (index > 0) doc.addPage({ size: "A4", margin: 0 });
    const item = ticketData.items[0];
    if (!item) continue;
    const ticket = ticketData.ticket;
    const category = categoryLabel(item);
    drawFrame(doc, category, ticketData.bookingCode, ticket.ticket_code, ticketData.contacts);
    const title = safeText(item.service_name) || "Layanan SHIAP";
    const titleHeight = doc.fontSize(18).heightOfString(title, { width: 335, lineGap: 2 });
    doc.fontSize(18).fillColor(navy).text(title, left, 163, { width: 335, lineGap: 2 });
    const qrTop = 160;
    let y = Math.max(163 + titleHeight, qrTop + 183) + 14;
    doc.roundedRect(400, qrTop, 151, 183, 12).lineWidth(0.8).strokeColor("#DCE5F0").stroke();
    const qrBuffer = await QRCode.toBuffer(ticketQrPayload(ticket.qr_credential), { type: "png", errorCorrectionLevel: "H", width: 620, margin: 3 });
    doc.image(qrBuffer, 416, qrTop + 12, { fit: [119, 119] });
    doc.fontSize(8).fillColor(muted).text("Pindai oleh petugas SHIAP", 408, qrTop + 140, { width: 135, align: "center" });
    doc.fontSize(8).fillColor(ticketData.isSyntheticSample ? orange : blue).text(ticketData.isSyntheticSample ? "CONTOH QA - TIDAK VALID" : ticket.status === "checked_in" ? "SUDAH CHECK-IN" : "PEMBAYARAN TERVERIFIKASI", 408, qrTop + 158, { width: 135, align: "center" });

    doc.fontSize(8).fillColor(muted).text("NAMA TAMU", left, y, { characterSpacing: 1 });
    y += 13;
    const guestName = safeText(ticketData.customerName) || "";
    const nameHeight = doc.fontSize(12).heightOfString(guestName, { width: 335 });
    doc.fontSize(12).fillColor(ink).text(guestName, left, y, { width: 335 });
    y += nameHeight + 12;
    doc.fontSize(8).fillColor(muted).text("STATUS TIKET", left, y, { characterSpacing: 1 });
    y += 13;
    doc.fontSize(10).fillColor(ticketData.isSyntheticSample ? orange : ticket.status === "checked_in" ? "#15803D" : navy)
      .text(ticketData.isSyntheticSample ? "Pratinjau sintetis - bukan tiket aktif" : ticket.status === "checked_in" ? "Check-in tercatat" : "Lunas · terverifikasi Admin", left, y, { width: 335 });
    y += 26;

    const fieldWidth = 335;
    const addField = (label: string, value: string) => {
      const valueHeight = Math.max(13, doc.fontSize(9.5).heightOfString(value, { width: fieldWidth, lineGap: 2 }));
      if (y + 11 + valueHeight > contentBottom) {
        doc.addPage({ size: "A4", margin: 0 });
        drawFrame(doc, category + " · lanjutan", ticketData.bookingCode, ticket.ticket_code, ticketData.contacts);
        y = 165;
      }
      doc.fontSize(8).fillColor(muted).text(label.toUpperCase(), left, y, { characterSpacing: 0.8, width: fieldWidth });
      y += 12;
      doc.fontSize(9.5).fillColor(ink).text(value, left, y, { width: fieldWidth, lineGap: 2 });
      y += valueHeight + 12;
    };
    for (const [label, value] of details(item)) addField(label, value);
    addField("Petunjuk check-in", "Siapkan E-Tiket ini saat tiba. QR hanya berisi kode tiket acak; check-in dicatat satu kali oleh petugas SHIAP.");
  }
  doc.end();
  return result;
}

