"use client";

import { useState, useTransition } from "react";
import {
  addSource,
  addTopic,
  createCategory,
  deleteCategory,
  saveLink,
  unsubscribe,
  updateSubscription,
  type FormState,
} from "@/app/actions";
import { CATEGORY_COLORS } from "@/lib/colors";
import { useFormAction } from "@/components/use-form-action";

type Category = { id: string; name: string; color: string };

function Feedback({ state }: { state: FormState }) {
  if (!state) return null;
  return <p className={`mt-3 text-sm ${state.error ? "text-accent" : "text-done"}`}>{state.error ?? state.ok}</p>;
}

function CategorySelect({ categories }: { categories: Category[] }) {
  return (
    <select name="categoryId" className="field" defaultValue="">
      <option value="">No category</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

const TABS = [
  { id: "source", label: "Follow", hint: "Blog, YouTube channel, subreddit, Bluesky, Mastodon, podcast or any RSS feed." },
  { id: "topic", label: "Watch a topic", hint: "New stories mentioning a phrase, from Google News, Hacker News and Reddit." },
  { id: "link", label: "Save a link", hint: "A single article, video or X post. It lands straight in your inbox." },
] as const;

export function AddSourceForms({ categories, creators }: { categories: Category[]; creators: string[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("source");
  const source = useFormAction(addSource);
  const topic = useFormAction(addTopic);
  const link = useFormAction(saveLink);

  return (
    <section className="bg-paper-2 p-5 sm:p-7">
      <div className="mb-5 flex gap-5 border-b border-rule">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`meta -mb-px border-b-2 pb-2 ${tab === t.id ? "border-accent text-ink" : "border-transparent hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-5 text-sm text-graphite">{TABS.find((t) => t.id === tab)!.hint}</p>

      {tab === "source" && (
        <form onSubmit={source.onSubmit} className="space-y-5">
          <input
            name="url"
            required
            placeholder="https://www.youtube.com/@channel  ·  example.com  ·  reddit.com/r/…"
            className="field font-serif text-lg"
            autoFocus
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="meta">Category</span>
              <CategorySelect categories={categories} />
            </label>
            <label className="block">
              <span className="meta">Creator (optional)</span>
              <input name="creator" list="creators" className="field" placeholder="Groups their channels" />
              <datalist id="creators">
                {creators.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>
          <button className="btn btn-accent" disabled={source.pending}>
            {source.pending ? "Looking for a feed…" : "Follow"}
          </button>
          <Feedback state={source.state} />
        </form>
      )}

      {tab === "topic" && (
        <form onSubmit={topic.onSubmit} className="space-y-5">
          <input name="query" required placeholder="e.g. Claude Code, sourdough, Formula 1" className="field font-serif text-lg" />
          <label className="block sm:w-1/2">
            <span className="meta">Category</span>
            <CategorySelect categories={categories} />
          </label>
          <button className="btn btn-accent" disabled={topic.pending}>
            {topic.pending ? "Setting up…" : "Watch topic"}
          </button>
          <Feedback state={topic.state} />
        </form>
      )}

      {tab === "link" && (
        <form onSubmit={link.onSubmit} className="space-y-5">
          <input name="url" required placeholder="https://x.com/someone/status/…" className="field font-serif text-lg" />
          <button className="btn btn-accent" disabled={link.pending}>
            {link.pending ? "Saving…" : "Save to inbox"}
          </button>
          <Feedback state={link.state} />
          <p className="text-sm text-graphite">
            Tip: install Feedlist on your phone (Add to Home Screen) and share links to it, or drag this bookmarklet
            to your bookmarks bar:{" "}
            <a
              className="link"
              // React refuses javascript: URLs in props, so set it directly.
              ref={(el) => {
                el?.setAttribute(
                  "href",
                  `javascript:location.href='${window.location.origin}/share?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)`,
                );
              }}
            >
              + Feedlist
            </a>
          </p>
        </form>
      )}
    </section>
  );
}

export function CategoryForm() {
  const { state, pending, onSubmit } = useFormAction(createCategory);
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0].value);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
      <label className="min-w-40 flex-1">
        <span className="meta">New category</span>
        <input name="name" required className="field" placeholder="AI, Finance, Running…" />
      </label>
      <input type="hidden" name="color" value={color} />
      <div className="flex gap-1.5 pb-2">
        {CATEGORY_COLORS.map((c) => (
          <button
            type="button"
            key={c.value}
            title={c.name}
            onClick={() => setColor(c.value)}
            className={`h-6 w-6 ${color === c.value ? "outline-2 outline-offset-2 outline-ink" : ""}`}
            style={{ background: c.value }}
          />
        ))}
      </div>
      <button className="btn" disabled={pending}>
        Add
      </button>
      <Feedback state={state?.error ? state : null} />
    </form>
  );
}

export function DeleteCategoryButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="meta hover:text-accent"
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete “${name}”? Its sources move to Uncategorized.`)) start(() => deleteCategory(id));
      }}
    >
      Delete
    </button>
  );
}

type Sub = {
  id: string;
  title: string;
  url: string;
  kind: string;
  categoryId: string | null;
  creatorName: string | null;
  status: string;
  failing: boolean;
};

export function SubscriptionRow({ sub, categories }: { sub: Sub; categories: Category[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  return (
    <li className="border-b border-rule py-3">
      <div className="flex items-baseline gap-3">
        <div className="min-w-0 flex-1">
          <a href={sub.url} target="_blank" rel="noopener noreferrer" className="font-serif text-lg hover:text-accent">
            {sub.title}
          </a>
          <p className={`meta truncate ${sub.failing ? "text-accent" : ""}`}>
            {sub.kind}
            {sub.creatorName && ` · ${sub.creatorName}`} · {sub.status}
          </p>
        </div>
        <button className="meta hover:text-ink" onClick={() => setEditing(!editing)}>
          {editing ? "Close" : "Edit"}
        </button>
        <button
          className="meta hover:text-accent"
          disabled={pending}
          onClick={() => {
            if (confirm(`Unfollow “${sub.title}”?`)) start(() => unsubscribe(sub.id));
          }}
        >
          Unfollow
        </button>
      </div>
      {editing && (
        <form
          action={async (form) => {
            await updateSubscription(form);
            setEditing(false);
          }}
          className="mt-3 grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]"
        >
          <input type="hidden" name="id" value={sub.id} />
          <label>
            <span className="meta">Category</span>
            <select name="categoryId" className="field" defaultValue={sub.categoryId ?? ""}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="meta">Creator</span>
            <input name="creator" className="field" defaultValue={sub.creatorName ?? ""} list="creators" />
          </label>
          <button className="btn">Save</button>
        </form>
      )}
    </li>
  );
}
