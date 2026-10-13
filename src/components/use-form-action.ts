"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import type { FormState } from "@/app/actions";

/**
 * Like useActionState, but submitted through onSubmit so React doesn't reset the
 * form afterwards: inputs keep their values on errors, and are cleared only on success.
 */
export function useFormAction(
  action: (state: FormState, form: FormData) => Promise<FormState>,
  { resetOnSuccess = true } = {},
) {
  const [state, dispatch, pending] = useActionState(
    async (prev: FormState, { data, form }: { data: FormData; form: HTMLFormElement }) => {
      const next = await action(prev, data);
      if (next?.ok && resetOnSuccess) form.reset();
      return next;
    },
    null,
  );

  /** Submits a form; also usable from a secondary button via `run(button.form)`. */
  function run(form: HTMLFormElement | null) {
    if (!form) return;
    const data = new FormData(form);
    startTransition(() => dispatch({ data, form }));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(e.currentTarget);
  }

  return { state, pending, onSubmit, run };
}
