"use client";

import { useTransition } from "react";
import { refreshMine } from "@/app/actions";

export function RefreshButton() {
  const [pending, start] = useTransition();
  return (
    <button
      className="meta hover:text-ink disabled:opacity-60"
      disabled={pending}
      onClick={() => start(async () => void (await refreshMine()))}
      title="Fetch new items now"
    >
      <span className={`mr-1 inline-block ${pending ? "animate-spin" : ""}`}>↻</span>
      {pending ? "Fetching" : "Refresh"}
    </button>
  );
}
