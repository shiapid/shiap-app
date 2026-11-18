"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Camera, UserRound, X } from "lucide-react";
import { AVATAR_CHANGED, AVATAR_ENDPOINT, AVATAR_TYPES, MAX_AVATAR_BYTES } from "@/lib/profile-avatar";

export default function ProfileAvatar() {
  const [url, setUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ file: File; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const objectUrl = useRef<string | null>(null);
  const operation = useRef(false);
  const changed = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(AVATAR_ENDPOINT, { signal: controller.signal })
      .then(async (response) => {
        const result = response.ok ? await response.json() : null;
        if (result && !changed.current && !controller.signal.aborted) setUrl(result.url);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  function clearDraft() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setDraft(null);
  }

  async function save(remove = false) {
    if (operation.current || (!remove && !draft)) return;
    operation.current = true;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(AVATAR_ENDPOINT, remove ? { method: "DELETE" } : { method: "PUT", body: draft?.file });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      changed.current = true;
      setUrl(result.url);
      window.dispatchEvent(new CustomEvent(AVATAR_CHANGED));
      clearDraft();
      dialog.current?.close();
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : "Foto gagal disimpan. Silakan coba lagi.");
    } finally {
      operation.current = false;
      setSaving(false);
    }
  }

  return <>
    <button type="button" aria-label="Edit foto profil" onClick={() => { setMessage(""); dialog.current?.showModal(); }} className="relative grid size-16 shrink-0 place-items-center rounded-full border border-white/30 bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
      <AvatarImage url={url} />
      <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full bg-[#1265D8] text-white ring-2 ring-white"><Camera aria-hidden size={13} /></span>
    </button>
    <dialog ref={dialog} aria-labelledby="edit-avatar-title" onCancel={(event) => { if (saving) event.preventDefault(); }} onClose={clearDraft} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-4 text-[#0A2E63] backdrop:bg-[#0A2E63]/50">
      <div className="flex items-center justify-between">
        <h2 id="edit-avatar-title" className="text-base font-bold">Foto profil</h2>
        <button type="button" aria-label="Tutup editor foto" disabled={saving} onClick={() => dialog.current?.close()} className="grid size-11 place-items-center rounded-full hover:bg-blue-50"><X aria-hidden size={18} /></button>
      </div>
      <div className="mx-auto my-2 grid size-28 place-items-center rounded-full bg-blue-50"><AvatarImage url={draft?.url ?? url} /></div>
      <p className="mt-2 text-center text-xs text-slate-600">JPEG, PNG, atau WebP · maksimal 2 MB</p>
      <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 text-sm font-bold focus-within:outline-2 focus-within:outline-[#1265D8]">
        Pilih foto
        <input type="file" accept={AVATAR_TYPES.join(",")} className="sr-only" disabled={saving} onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          clearDraft();
          setMessage("");
          if (!file.size || file.size > MAX_AVATAR_BYTES) { setMessage("Ukuran foto maksimal 2 MB."); return; }
          if (file.type && !AVATAR_TYPES.includes(file.type)) { setMessage("Pilih foto JPEG, PNG, atau WebP."); return; }
          const preview = URL.createObjectURL(file);
          objectUrl.current = preview;
          setDraft({ file, url: preview });
        }} />
      </label>
      {draft && <button type="button" disabled={saving} onClick={() => void save()} className="mt-2 min-h-11 w-full rounded-xl bg-[#1265D8] text-sm font-bold text-white disabled:opacity-60">{saving ? "Menyimpan…" : "Simpan foto"}</button>}
      {url && <button type="button" disabled={saving} onClick={() => void save(true)} className="mt-1 min-h-11 w-full text-sm font-semibold text-red-700 disabled:opacity-60">Hapus foto</button>}
      {message && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{message}</p>}
    </dialog>
  </>;
}

function AvatarImage({ url }: { url: string | null }) {
  return url
    ? <Image src={url} alt="Foto profil" width={112} height={112} unoptimized className="size-full rounded-full object-cover object-center" />
    : <UserRound aria-hidden size={28} />;
}
