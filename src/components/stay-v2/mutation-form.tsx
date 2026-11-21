"use client";

import { useActionState, type ReactNode } from "react";

export type StayV2FormState = { ok: boolean; message: string };

export function StayV2MutationForm({ action, children, label }: {
  action: (state: StayV2FormState, data: FormData) => Promise<StayV2FormState>;
  children: ReactNode;
  label: string;
}) {
  const [state, submit, pending] = useActionState(action, { ok: false, message: "" });
  return (
    <form action={submit} className="space-y-3">
      <fieldset disabled={pending} className="space-y-3">{children}</fieldset>
      <button disabled={pending} className="min-h-11 rounded-xl bg-[#1265D8] px-4 text-sm font-bold text-white disabled:opacity-60">
        {pending ? "Menyimpan…" : label}
      </button>
      {state.message && <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
        {state.message}
      </p>}
    </form>
  );
}
