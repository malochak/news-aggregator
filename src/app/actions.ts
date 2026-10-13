"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { category, creator, item, subscription, userSettings, type ItemStatus } from "@/db/schema";
import { createModel, isProvider, PROVIDERS } from "@/lib/ai/providers";
import { summarize } from "@/lib/ai/summarize";
import { CATEGORY_COLORS } from "@/lib/colors";
import { encrypt } from "@/lib/crypto";
import { DiscoveryError, topicFeedUrls } from "@/lib/feeds/discover";
import { subscribe } from "@/lib/feeds/ingest";
import { fetchFeeds, summarizePending } from "@/lib/jobs";
import { saveLink as saveLinkForUser } from "@/lib/links";
import { assertPublicUrl } from "@/lib/net";
import { requireUser } from "@/lib/session";

export type FormState = { ok?: string; error?: string } | null;

function revalidate() {
  revalidatePath("/", "layout");
}

function summarizeSoon(userId: string) {
  after(() => summarizePending(Date.now() + 45_000, { userId, limit: 15 }).catch(console.error));
}

function message(err: unknown) {
  if (err instanceof DiscoveryError) return err.message;
  console.error(err);
  return err instanceof Error ? err.message : "Something went wrong";
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function setItemStatus(id: string, status: Exclude<ItemStatus, "archived">) {
  const user = await requireUser();
  await db
    .update(item)
    .set({ status, completedAt: status === "inbox" ? null : new Date() })
    .where(and(eq(item.id, id), eq(item.userId, user.id)));
  revalidate();
}

export async function setStarred(id: string, starred: boolean) {
  const user = await requireUser();
  await db.update(item).set({ starred }).where(and(eq(item.id, id), eq(item.userId, user.id)));
  revalidate();
}

export async function retrySummary(id: string) {
  const user = await requireUser();
  await db
    .update(item)
    .set({ summaryStatus: "pending", summaryAttempts: 0, summaryError: null })
    .where(and(eq(item.id, id), eq(item.userId, user.id)));
  summarizeSoon(user.id);
  revalidate();
}

export async function refreshMine() {
  const user = await requireUser();
  const deadline = Date.now() + 25_000;
  const fetched = await fetchFeeds(deadline - 10_000, user.id);
  await summarizePending(deadline, { userId: user.id, limit: 10 });
  summarizeSoon(user.id);
  revalidate();
  return fetched;
}

export async function saveLink(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const url = String(form.get("url") ?? "").trim();
  if (!url) return { error: "Paste a link" };
  try {
    await saveLinkForUser(user.id, url);
  } catch (err) {
    return { error: message(err) };
  }
  summarizeSoon(user.id);
  revalidate();
  return { ok: "Saved to your inbox" };
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

async function resolveCreator(userId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const [row] = await db
    .insert(creator)
    .values({ userId, name: trimmed })
    .onConflictDoUpdate({ target: [creator.userId, creator.name], set: { name: trimmed } })
    .returning();
  return row.id;
}

async function ownedCategory(userId: string, id: FormDataEntryValue | null) {
  if (!id || typeof id !== "string") return null;
  const row = await db.query.category.findFirst({ where: and(eq(category.id, id), eq(category.userId, userId)) });
  return row?.id ?? null;
}

export async function addSource(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const url = String(form.get("url") ?? "").trim();
  if (!url) return { error: "Paste a link to a site, channel or feed" };
  try {
    const { feed } = await subscribe(user.id, url, {
      categoryId: await ownedCategory(user.id, form.get("categoryId")),
      creatorId: await resolveCreator(user.id, String(form.get("creator") ?? "")),
    });
    summarizeSoon(user.id);
    revalidate();
    return { ok: `Following “${feed.title}”` };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function addTopic(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const query = String(form.get("query") ?? "").trim();
  if (query.length < 2) return { error: "Type a topic or phrase" };
  const categoryId = await ownedCategory(user.id, form.get("categoryId"));
  const results = await Promise.allSettled(
    topicFeedUrls(query).map((t) =>
      subscribe(user.id, t.url, { categoryId, kind: "topic", title: `“${query}” · ${t.label}` }),
    ),
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  if (ok === 0) return { error: "Couldn't load any search feed for that topic" };
  summarizeSoon(user.id);
  revalidate();
  return { ok: `Watching “${query}” in ${ok} source${ok > 1 ? "s" : ""}` };
}

export async function updateSubscription(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id"));
  await db
    .update(subscription)
    .set({
      categoryId: await ownedCategory(user.id, form.get("categoryId")),
      creatorId: await resolveCreator(user.id, String(form.get("creator") ?? "")),
    })
    .where(and(eq(subscription.id, id), eq(subscription.userId, user.id)));
  revalidate();
}

export async function unsubscribe(id: string) {
  const user = await requireUser();
  await db.delete(subscription).where(and(eq(subscription.id, id), eq(subscription.userId, user.id)));
  revalidate();
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategory(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Name it" };
  const [{ position }] = await db
    .select({ position: max(category.position) })
    .from(category)
    .where(eq(category.userId, user.id));
  const next = (position ?? -1) + 1;
  const color = String(form.get("color") || CATEGORY_COLORS[next % CATEGORY_COLORS.length].value);
  await db.insert(category).values({ userId: user.id, name, color, position: next }).onConflictDoNothing();
  revalidate();
  return { ok: `Added ${name}` };
}

export async function deleteCategory(id: string) {
  const user = await requireUser();
  await db.delete(category).where(and(eq(category.id, id), eq(category.userId, user.id)));
  revalidate();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const settingsSchema = z.object({
  aiProvider: z.string().refine((v) => v === "" || isProvider(v)),
  aiModel: z.string().trim().max(200),
  aiBaseUrl: z.union([z.literal(""), z.url()]),
  aiApiKey: z.string().trim().max(500),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone"),
  digestHour: z.coerce.number().int().min(0).max(23),
  autoArchiveDays: z.coerce.number().int().min(0).max(365),
});

export async function saveSettings(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  const s = parsed.data;
  const provider = s.aiProvider && isProvider(s.aiProvider) ? s.aiProvider : null;
  if (provider && PROVIDERS[provider].needsBaseUrl && !s.aiBaseUrl) return { error: "Base URL is required" };
  if (s.aiBaseUrl) {
    try {
      await assertPublicUrl(new URL(s.aiBaseUrl));
    } catch (err) {
      return { error: `Base URL: ${message(err)}` };
    }
  }

  const values = {
    aiProvider: provider,
    aiModel: s.aiModel || null,
    aiBaseUrl: s.aiBaseUrl || null,
    timezone: s.timezone,
    digestEnabled: form.get("digestEnabled") === "on",
    digestHour: s.digestHour,
    autoArchiveDays: s.autoArchiveDays,
    // An empty key field keeps the stored key; "clear" removes it.
    ...(form.get("clearKey") === "on" || !provider
      ? { aiApiKey: null }
      : s.aiApiKey
        ? { aiApiKey: encrypt(s.aiApiKey) }
        : {}),
  };
  await db
    .insert(userSettings)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: userSettings.userId, set: values });

  // Items that waited for a key can be summarized now.
  if (provider) {
    await db
      .update(item)
      .set({ summaryStatus: "pending", summaryAttempts: 0 })
      .where(and(eq(item.userId, user.id), eq(item.summaryStatus, "failed"), eq(item.status, "inbox")));
    summarizeSoon(user.id);
  }
  revalidate();
  return { ok: "Saved" };
}

export async function testAi(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const provider = String(form.get("aiProvider") ?? "");
  if (!isProvider(provider)) return { error: "Pick a provider first" };
  let apiKey = String(form.get("aiApiKey") ?? "").trim() || null;
  if (!apiKey) {
    const { aiConfigFor } = await import("@/lib/ai/config");
    const stored = await aiConfigFor(user.id);
    apiKey = stored?.provider === provider ? (stored.apiKey ?? null) : null;
  }
  try {
    const baseUrl = String(form.get("aiBaseUrl") ?? "") || null;
    if (baseUrl) await assertPublicUrl(new URL(baseUrl));
    const model = createModel({ provider, apiKey, model: String(form.get("aiModel") ?? "") || null, baseUrl });
    const bullets = await summarize(model, {
      title: "Test",
      mediaType: "article",
      text: "Feedlist turns the blogs, channels and newsletters you follow into a checklist. Each new piece arrives with a short summary so you can decide whether to read it, and tick it off when you're done.",
    });
    return { ok: `Works. “${bullets[0]}”` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Request failed" };
  }
}
