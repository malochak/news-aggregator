import Link from "next/link";
import type { MediaType } from "@/db/schema";
import { envAiConfig } from "@/lib/ai/providers";
import { duration } from "@/lib/format";
import { getSettings, inboxStats, listCategories, listItems, type View } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { ItemList } from "@/components/item-list";
import { RefreshButton } from "@/components/refresh-button";
import { SaveLinkForm } from "@/components/save-link-form";

const TYPES: { value?: MediaType; label: string }[] = [
  { label: "All" },
  { value: "article", label: "Read" },
  { value: "video", label: "Watch" },
  { value: "audio", label: "Listen" },
  { value: "post", label: "Posts" },
];

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const params = await searchParams;
  const view: View = params.view === "starred" || params.view === "done" ? params.view : "inbox";
  const type = TYPES.find((t) => t.value === params.t)?.value;
  const categoryId = typeof params.c === "string" ? params.c : undefined;

  const [items, stats, categories, settings] = await Promise.all([
    listItems(user.id, { view, type, categoryId }),
    inboxStats(user.id),
    listCategories(user.id),
    getSettings(user.id),
  ]);
  const activeCategory = categories.find((c) => c.id === categoryId);
  const timezone = settings?.timezone ?? "UTC";
  const today = new Date();
  const weekday = today.toLocaleDateString("en", { weekday: "long", timeZone: timezone });
  const date = today.toLocaleDateString("en", { month: "long", day: "numeric", timeZone: timezone });
  const noAi = !settings?.aiProvider && !envAiConfig();
  const listMinutes = items.reduce((s, i) => s + (i.minutes ?? 0), 0);

  const title =
    view === "starred" ? "Saved for later" : view === "done" ? "Done" : activeCategory ? activeCategory.name : null;

  const hrefWith = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ view: params.view, c: categoryId, t: type, ...patch }))
      if (typeof v === "string" && v) q.set(k, v);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <main className="mx-auto max-w-[760px] px-5 pt-8 sm:px-10 md:pt-14">
      <header className="mb-8 border-b-[3px] border-double border-ink pb-5">
        <div className="mb-1 flex items-center justify-between gap-4">
          <p className="meta">{title ? `${weekday}, ${date}` : weekday}</p>
          <RefreshButton />
        </div>
        <h1 className="font-serif text-[2.75rem] leading-none tracking-tight sm:text-6xl">
          {title ?? date}
          {activeCategory && (
            <span className="ml-3 inline-block h-3 w-3 align-middle" style={{ background: activeCategory.color }} />
          )}
        </h1>
        <p className="meta mt-4 text-ink">
          {view === "inbox" ? (
            <>
              <span className="text-accent">{items.length} to go</span>
              {listMinutes > 0 && ` · ~${duration(listMinutes)}`}
              {!activeCategory && !type && stats.doneToday > 0 && ` · ${stats.doneToday} done today`}
            </>
          ) : (
            `${items.length} item${items.length === 1 ? "" : "s"}`
          )}
        </p>
      </header>

      {noAi && (
        <p className="mb-6 border-l-[3px] border-accent bg-paper-2 px-4 py-3 text-sm">
          Summaries are off. <Link href="/settings" className="link">Add your AI key in Settings</Link> — Claude,
          ChatGPT, Mistral, Grok, Gemini or your own model.
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <nav className="flex gap-4">
          {TYPES.map((t) => (
            <Link
              key={t.label}
              href={hrefWith({ t: t.value })}
              className={`meta ${type === t.value ? "text-ink underline decoration-accent decoration-2 underline-offset-4" : "hover:text-ink"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto w-full sm:w-64">
          <SaveLinkForm />
        </div>
      </div>

      {categories.length > 0 && (
        <nav className="-mx-5 mb-2 flex gap-4 overflow-x-auto px-5 pb-2 md:hidden">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={hrefWith({ c: categoryId === c.id ? undefined : c.id })}
              className={`meta shrink-0 ${categoryId === c.id ? "text-ink" : ""}`}
            >
              <span className="mr-1.5 inline-block h-2 w-2" style={{ background: c.color }} />
              {c.name} {c.inbox > 0 && <span className="text-ink">{c.inbox}</span>}
            </Link>
          ))}
        </nav>
      )}

      <ItemList key={`${view}:${categoryId}:${type}`} items={items} view={view} />
    </main>
  );
}
