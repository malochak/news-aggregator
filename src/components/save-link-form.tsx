"use client";

import { saveLink } from "@/app/actions";
import { useFormAction } from "./use-form-action";

export function SaveLinkForm() {
  const { state, pending, onSubmit } = useFormAction(saveLink);
  return (
    <form onSubmit={onSubmit} className="relative">
      <input
        name="url"
        type="text"
        inputMode="url"
        placeholder="+ Save a link (X post, article…)"
        className="field pr-10 text-sm"
        disabled={pending}
      />
      <button className="meta absolute right-0 top-1/2 -translate-y-1/2 hover:text-ink" disabled={pending}>
        {pending ? "…" : "Add"}
      </button>
      {state?.error && <p className="absolute mt-1 text-xs text-accent">{state.error}</p>}
    </form>
  );
}
