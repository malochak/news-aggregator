import { and, desc, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { entry, item, user, userSettings } from "@/db/schema";
import { aiConfigFor } from "@/lib/ai/config";
import { createModel, envAiConfig } from "@/lib/ai/providers";
import { summarize } from "@/lib/ai/summarize";
import { emailEnabled, sendEmail } from "@/lib/email";
import { extractArticle, readingMinutes } from "@/lib/feeds/extract";
import { dueFeeds, refreshFeed } from "@/lib/feeds/ingest";

const MAX_SUMMARY_ATTEMPTS = 3;

async function pool<T>(items: T[], concurrency: number, deadline: number, fn: (item: T) => Promise<unknown>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length && Date.now() < deadline) await fn(queue.shift()!);
    }),
  );
}

export async function fetchFeeds(deadline: number, userId?: string) {
  const feeds = await dueFeeds(userId ? 200 : 100, userId);
  let newEntries = 0;
  await pool(feeds, 6, deadline, async (f) => {
    const added = await refreshFeed(f); // not `+= await`: that reads the total before awaiting
    newEntries += added;
  });
  return { feeds: feeds.length, newEntries };
}

type PendingItem = typeof item.$inferSelect & { content: string | null };

async function summarizeItem(it: PendingItem, model: ReturnType<typeof createModel>) {
  let text = it.content ?? "";
  let minutes = it.minutes;
  if (it.mediaType === "article" || (it.mediaType === "post" && text.length < 300)) {
    if (text.length < 1500) {
      const extracted = await extractArticle(it.url);
      if (extracted && extracted.text.length > text.length) text = extracted.text;
    }
    if (it.mediaType === "article" && text.length > 1500) minutes = readingMinutes(text);
  }
  try {
    const bullets = await summarize(model, {
      title: it.title,
      mediaType: it.mediaType,
      source: it.sourceName,
      text: text || it.title,
    });
    await db
      .update(item)
      .set({ summary: bullets, summaryStatus: "done", summaryError: null, minutes })
      .where(eq(item.id, it.id));
  } catch (err) {
    const attempts = it.summaryAttempts + 1;
    await db
      .update(item)
      .set({
        summaryAttempts: attempts,
        summaryStatus: attempts >= MAX_SUMMARY_ATTEMPTS ? "failed" : "pending",
        summaryError: err instanceof Error ? err.message.slice(0, 500) : String(err),
        minutes,
      })
      .where(eq(item.id, it.id));
  }
}

export async function summarizePending(deadline: number, opts: { userId?: string; limit?: number } = {}) {
  // Without an instance-wide key only users who brought their own key are processed.
  const usersWithKey = db
    .select({ id: userSettings.userId })
    .from(userSettings)
    .where(isNotNull(userSettings.aiProvider));
  const pending = await db
    .select({ item, content: entry.content })
    .from(item)
    .leftJoin(entry, eq(entry.id, item.entryId))
    .where(
      and(
        eq(item.summaryStatus, "pending"),
        eq(item.status, "inbox"),
        opts.userId ? eq(item.userId, opts.userId) : undefined,
        envAiConfig() ? undefined : inArray(item.userId, usersWithKey),
      ),
    )
    .orderBy(desc(item.createdAt))
    .limit(opts.limit ?? 60);

  const models = new Map<string, ReturnType<typeof createModel> | null>();
  const modelFor = async (userId: string) => {
    if (!models.has(userId)) {
      const config = await aiConfigFor(userId).catch(() => null);
      models.set(userId, config ? createModel(config) : null);
    }
    return models.get(userId)!;
  };

  let done = 0;
  await pool(pending, 4, deadline, async ({ item: it, content }) => {
    const model = await modelFor(it.userId);
    if (!model) return;
    await summarizeItem({ ...it, content }, model);
    done++;
  });
  return { pending: pending.length, summarized: done };
}

export async function autoArchive() {
  const result = await db.execute(sql`
    update item i set status = 'archived'
    from user_settings us
    where i.user_id = us.user_id
      and i.status = 'inbox' and not i.starred
      and us.auto_archive_days > 0
      and i.created_at < now() - make_interval(days => us.auto_archive_days)
  `);
  return result.count;
}

function localParts(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export async function sendDigests() {
  if (!emailEnabled) return 0;
  const candidates = await db
    .select({ settings: userSettings, email: user.email, name: user.name })
    .from(userSettings)
    .innerJoin(user, eq(user.id, userSettings.userId))
    .where(
      and(
        eq(userSettings.digestEnabled, true),
        or(sql`${userSettings.lastDigestAt} is null`, lt(userSettings.lastDigestAt, sql`now() - interval '20 hours'`)),
      ),
    );
  let sent = 0;
  for (const { settings, email } of candidates) {
    const now = localParts(settings.timezone);
    if (now.hour < settings.digestHour) continue;
    if (settings.lastDigestAt && localParts(settings.timezone, settings.lastDigestAt).day === now.day) continue;

    const since = settings.lastDigestAt ?? new Date(Date.now() - 24 * 3600_000);
    const items = await db
      .select()
      .from(item)
      .where(and(eq(item.userId, settings.userId), eq(item.status, "inbox"), gte(item.createdAt, since)))
      .orderBy(desc(item.createdAt))
      .limit(40);
    await db.update(userSettings).set({ lastDigestAt: new Date() }).where(eq(userSettings.userId, settings.userId));
    if (items.length === 0) continue;

    const { subject, html, text } = renderDigest(items);
    await sendEmail(email, subject, html, text).catch((err) => console.error("digest failed", email, err));
    sent++;
  }
  return sent;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderDigest(items: (typeof item.$inferSelect)[]) {
  const appUrl = process.env.BETTER_AUTH_URL ?? "";
  const minutes = items.reduce((sum, i) => sum + (i.minutes ?? 0), 0);
  const subject = `${items.length} new in Feedlist${minutes ? ` · ~${minutes} min` : ""}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F3EFE6;color:#1B1A17;font-family:Georgia,serif">
<div style="max-width:620px;margin:0 auto;padding:32px 20px">
<p style="font:600 11px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:#6B675E;margin:0 0 4px">Feedlist · daily</p>
<h1 style="font-weight:500;font-size:30px;margin:0 0 24px">${escapeHtml(subject)}</h1>
${items
  .map(
    (i) => `<div style="border-top:1px solid #D6CEBD;padding:16px 0">
<p style="font:600 11px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:#6B675E;margin:0 0 6px">${escapeHtml(
      [i.mediaType, i.sourceName, i.minutes ? `${i.minutes} min` : null].filter(Boolean).join(" · "),
    )}</p>
<a href="${escapeHtml(i.url)}" style="color:#1B1A17;font-size:19px;text-decoration:none">${escapeHtml(i.title)}</a>
${
  i.summary?.length
    ? `<ul style="margin:8px 0 0;padding-left:18px;color:#3a3832;font-size:15px;line-height:1.5">${i.summary
        .map((b) => `<li>${escapeHtml(b)}</li>`)
        .join("")}</ul>`
    : ""
}</div>`,
  )
  .join("")}
<p style="border-top:1px solid #D6CEBD;padding-top:16px"><a href="${escapeHtml(appUrl)}" style="color:#E4472B">Open Feedlist →</a></p>
</div></body></html>`;
  const text = items.map((i) => `- ${i.title}\n  ${i.url}`).join("\n");
  return { subject, html, text };
}

let running = false;

/** One scheduler tick. Safe to call from cron, the in-process timer or a CLI. */
export async function runJobs(budgetMs = 50_000) {
  if (running) return { skipped: true };
  running = true;
  const deadline = Date.now() + budgetMs;
  try {
    const fetched = await fetchFeeds(deadline - budgetMs * 0.4);
    const summaries = await summarizePending(deadline);
    const archived = await autoArchive();
    const digests = await sendDigests();
    return { fetched, summaries, archived, digests };
  } finally {
    running = false;
  }
}
