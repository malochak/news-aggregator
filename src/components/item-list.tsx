"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { retrySummary, setItemStatus, setStarred } from "@/app/actions";
import { MEDIA_LABEL, relativeTime } from "@/lib/format";
import type { ListedItem, View } from "@/lib/queries";

type Status = "inbox" | "done" | "skipped";
type Undo = { id: string; label: string; previous: Status };

const LEAVE_MS = 650;

export function ItemList({ items: initial, view }: { items: ListedItem[]; view: View }) {
  const [items, setItems] = useState(initial);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  // The focus highlight only shows once someone navigates with the keyboard.
  const [keyboard, setKeyboard] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const leaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Server data wins whenever it changes (refresh, revalidation).
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setItems(initial);
    setLeaving(new Set());
  }

  const changeStatus = useCallback(
    (it: ListedItem, status: Status) => {
      const previous = it.status as Status;
      setItems((list) => list.map((i) => (i.id === it.id ? { ...i, status } : i)));
      const leavesList = view === "inbox" ? status !== "inbox" : view === "done" ? status === "inbox" : false;
      if (leavesList) {
        // Persist after the row has animated out, so revalidation doesn't cut the animation short.
        setLeaving((s) => new Set(s).add(it.id));
        leaveTimers.current.set(
          it.id,
          setTimeout(() => {
            leaveTimers.current.delete(it.id);
            setItems((list) => list.filter((i) => i.id !== it.id));
            void setItemStatus(it.id, status);
          }, LEAVE_MS),
        );
      } else {
        void setItemStatus(it.id, status);
      }
      if (status !== "inbox") {
        clearTimeout(undoTimer.current);
        setUndo({ id: it.id, previous, label: status === "done" ? "Marked done" : "Skipped" });
        undoTimer.current = setTimeout(() => setUndo(null), 5000);
      }
    },
    [view],
  );

  const toggleStar = useCallback((it: ListedItem) => {
    setItems((list) => list.map((i) => (i.id === it.id ? { ...i, starred: !i.starred } : i)));
    void setStarred(it.id, !it.starred);
  }, []);

  // Keyboard: j/k move, x done, s skip, f star, o/enter open.
  // The first key press only reveals the focused row.
  useEffect(() => {
    const keys = ["j", "k", "x", "s", "f", "o", "Enter"];
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || !keys.includes(e.key)) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Enter" && target.closest("button, a")) return;
      e.preventDefault();
      if (!keyboard) return setKeyboard(true);
      const visible = items.filter((i) => !leaving.has(i.id));
      const current = visible[Math.min(focus, visible.length - 1)];
      if (e.key === "j") setFocus((f) => Math.min(f + 1, visible.length - 1));
      else if (e.key === "k") setFocus((f) => Math.max(f - 1, 0));
      else if (!current) return;
      else if (e.key === "x") changeStatus(current, current.status === "done" ? "inbox" : "done");
      else if (e.key === "s") changeStatus(current, "skipped");
      else if (e.key === "f") toggleStar(current);
      else window.open(current.url, "_blank", "noopener");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, leaving, focus, keyboard, changeStatus, toggleStar]);

  useEffect(() => {
    document.querySelector(`[data-index="${focus}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  if (items.length === 0) return <Empty view={view} />;

  // Keyboard focus only counts rows that aren't animating out.
  let position = 0;
  const positions = items.map((i) => (leaving.has(i.id) ? -1 : position++));

  return (
    <>
      <ol className="border-t border-rule">
        {items.map((it, index) => (
          <Row
            key={it.id}
            item={it}
            index={positions[index]}
            focused={keyboard && positions[index] === focus}
            leaving={leaving.has(it.id)}
            onStatus={(s) => changeStatus(it, s)}
            onStar={() => toggleStar(it)}
          />
        ))}
      </ol>
      <p className="meta mt-10 hidden text-center md:block">j / k move · x done · s skip · f save · o open</p>
      {undo && (
        <div className="fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 bg-ink px-4 py-2.5 text-paper md:bottom-8">
          <span className="font-mono text-xs uppercase tracking-widest">{undo.label}</span>
          <button
            className="font-mono text-xs uppercase tracking-widest text-accent"
            onClick={() => {
              const it = initial.find((i) => i.id === undo.id) ?? items.find((i) => i.id === undo.id);
              const pendingLeave = leaveTimers.current.get(undo.id);
              if (pendingLeave) {
                clearTimeout(pendingLeave);
                leaveTimers.current.delete(undo.id);
              }
              setLeaving((s) => {
                const next = new Set(s);
                next.delete(undo.id);
                return next;
              });
              if (it) {
                setItems((list) =>
                  list.some((i) => i.id === it.id)
                    ? list.map((i) => (i.id === it.id ? { ...i, status: undo.previous } : i))
                    : [...list, { ...it, status: undo.previous }],
                );
              }
              if (!pendingLeave) void setItemStatus(undo.id, undo.previous);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}

function Row({
  item: it,
  index,
  focused,
  leaving,
  onStatus,
  onStar,
}: {
  item: ListedItem;
  index: number;
  focused: boolean;
  leaving: boolean;
  onStatus: (s: Status) => void;
  onStar: () => void;
}) {
  const done = it.status === "done";
  const skipped = it.status === "skipped";
  const meta = [
    MEDIA_LABEL[it.mediaType],
    it.creatorName ?? it.sourceName,
    it.minutes ? `${it.minutes} min` : null,
    relativeTime(it.publishedAt ?? it.createdAt),
  ].filter(Boolean);

  return (
    <li
      data-index={index}
      className={`relative grid grid-cols-[auto_1fr] gap-x-4 border-b border-rule py-5 pl-4 transition-[opacity,transform] duration-500 ${
        leaving ? "translate-y-2 opacity-0" : ""
      } ${focused ? "bg-paper-2/60" : ""}`}
    >
      <span className="absolute inset-y-5 left-0 w-[3px]" style={{ background: it.categoryColor ?? "var(--rule)" }} />
      <button
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onClick={() => onStatus(done ? "inbox" : "done")}
        className={`mt-1.5 grid h-5 w-5 shrink-0 place-items-center border-[1.5px] transition-colors ${
          done ? "border-done bg-done text-paper" : "border-ink hover:border-accent"
        }`}
      >
        {done && (
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
            <path d="M2 6.5 L5 9.5 L10 2.5" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        )}
      </button>

      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <p className="meta min-w-0 flex-1 truncate">
            {it.categoryName && <span style={{ color: it.categoryColor ?? undefined }}>{it.categoryName} · </span>}
            {meta.join(" · ")}
            {skipped && <span className="text-accent"> · skipped</span>}
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={onStar}
              aria-label={it.starred ? "Unsave" : "Save for later"}
              className={`text-base leading-none ${it.starred ? "text-accent" : "text-graphite hover:text-ink"}`}
            >
              {it.starred ? "★" : "☆"}
            </button>
            {it.status === "inbox" && (
              <button onClick={() => onStatus("skipped")} className="meta hover:text-accent" aria-label="Skip">
                Skip
              </button>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex gap-4">
          <div className="min-w-0 flex-1">
            <a
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`font-serif text-[1.3rem] leading-snug tracking-[-0.01em] hover:text-accent ${
                done || skipped ? "text-graphite" : ""
              }`}
            >
              <span className="strike" data-on={done}>
                {it.title}
              </span>
            </a>
            <Summary item={it} />
          </div>
          {it.mediaType === "video" && it.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={it.thumbnailUrl}
              alt=""
              loading="lazy"
              onError={(e) => (e.currentTarget.style.display = "none")}
              className="mt-1 hidden aspect-video w-36 shrink-0 object-cover grayscale-[35%] sm:block"
            />
          )}
        </div>
      </div>
    </li>
  );
}

function Summary({ item: it }: { item: ListedItem }) {
  if (it.summary?.length) {
    return (
      <ul className="mt-2 space-y-1 text-[0.95rem] leading-relaxed text-ink-2">
        {it.summary.map((b, i) => (
          <li key={i} className="grid grid-cols-[1.1rem_1fr]">
            <span className="text-graphite">—</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (it.summaryStatus === "failed") {
    return (
      <p className="meta mt-2">
        No summary ·{" "}
        <button className="link" onClick={() => void retrySummary(it.id)}>
          retry
        </button>
      </p>
    );
  }
  if (it.status === "inbox") return <p className="meta mt-2 italic">Summary pending…</p>;
  return null;
}

function Empty({ view }: { view: View }) {
  const copy = {
    inbox: ["Inbox zero.", "Nothing left to read. Go outside, or follow something new."],
    starred: ["Nothing saved.", "Tap ☆ on anything you want to keep for later."],
    done: ["Nothing done yet.", "Ticked-off items show up here."],
  }[view];
  return (
    <div className="border-t border-rule py-24 text-center">
      <p className="font-serif text-5xl italic tracking-tight">{copy[0]}</p>
      <p className="mt-3 text-graphite">{copy[1]}</p>
    </div>
  );
}
