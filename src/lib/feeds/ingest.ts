import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { entry, feed, item, subscription, type FeedKind } from "@/db/schema";
import { httpGet } from "./http";
import { parseFeed, type ParsedEntry } from "./parse";
import { discoverFeed, loadFeed, type DiscoveredFeed } from "./discover";

/** How many recent entries a brand-new subscription starts with. */
const BACKFILL = 5;
const MAX_CONTENT_CHARS = 50_000;

type Feed = typeof feed.$inferSelect;
type Entry = typeof entry.$inferSelect;

export async function subscribe(
  userId: string,
  input: string,
  opts: { categoryId?: string | null; creatorId?: string | null; kind?: FeedKind; title?: string } = {},
) {
  const discovered = opts.kind ? await loadFeed(input, opts.kind) : await discoverFeed(input);
  const row = await upsertFeed(discovered, opts.title);
  await storeEntries(row.id, discovered.parsed.entries);

  const [sub] = await db
    .insert(subscription)
    .values({ userId, feedId: row.id, categoryId: opts.categoryId ?? null, creatorId: opts.creatorId ?? null })
    .onConflictDoUpdate({
      target: [subscription.userId, subscription.feedId],
      set: { categoryId: opts.categoryId ?? null, creatorId: opts.creatorId ?? null },
    })
    .returning();

  const recent = await db.query.entry.findMany({
    where: eq(entry.feedId, row.id),
    orderBy: (e, { desc }) => [desc(e.publishedAt), desc(e.createdAt)],
    limit: BACKFILL,
  });
  await createItems(row, recent, [sub]);
  return { feed: row, subscription: sub };
}

async function upsertFeed(discovered: DiscoveredFeed, title?: string) {
  const [row] = await db
    .insert(feed)
    .values({
      url: discovered.url,
      kind: discovered.kind,
      title: title ?? discovered.parsed.title,
      siteUrl: discovered.parsed.siteUrl,
      imageUrl: discovered.parsed.imageUrl,
      lastFetchedAt: new Date(),
      nextFetchAt: nextFetch(0),
    })
    .onConflictDoUpdate({ target: feed.url, set: { errorCount: 0, lastError: null } })
    .returning();
  return row;
}

/** Inserts entries that aren't stored yet and returns only the new ones. */
async function storeEntries(feedId: string, entries: ParsedEntry[]): Promise<Entry[]> {
  if (entries.length === 0) return [];
  const unique = [...new Map(entries.map((e) => [e.guid, e])).values()];
  return db
    .insert(entry)
    .values(unique.map((e) => ({ ...e, feedId, content: e.content?.slice(0, MAX_CONTENT_CHARS) ?? null })))
    .onConflictDoNothing({ target: [entry.feedId, entry.guid] })
    .returning();
}

/** Every new entry becomes an inbox item for every subscriber of the feed. */
async function createItems(f: Feed, entries: Entry[], subs?: (typeof subscription.$inferSelect)[]) {
  if (entries.length === 0) return;
  subs ??= await db.select().from(subscription).where(eq(subscription.feedId, f.id));
  const values = subs.flatMap((s) =>
    entries.map((e) => ({
      userId: s.userId,
      entryId: e.id,
      subscriptionId: s.id,
      url: e.url,
      title: e.title,
      sourceName: s.title ?? f.title,
      mediaType: e.mediaType,
      thumbnailUrl: e.thumbnailUrl,
      publishedAt: e.publishedAt,
      minutes: e.durationSec ? Math.max(1, Math.round(e.durationSec / 60)) : null,
    })),
  );
  if (values.length === 0) return;
  // The same link arriving from two sources stays one item.
  await db.insert(item).values(values).onConflictDoNothing({ target: [item.userId, item.url] });
}

function nextFetch(errorCount: number) {
  const base = Number(process.env.FETCH_INTERVAL_MINUTES ?? 30);
  const minutes = Math.min(base * 2 ** errorCount, 24 * 60);
  return new Date(Date.now() + minutes * 60_000);
}

export async function refreshFeed(f: Feed) {
  try {
    const res = await httpGet(f.url, {
      headers: {
        ...(f.etag ? { "if-none-match": f.etag } : {}),
        ...(f.lastModified ? { "if-modified-since": f.lastModified } : {}),
      },
    });
    if (res.status === 304) {
      await db
        .update(feed)
        .set({ lastFetchedAt: new Date(), nextFetchAt: nextFetch(0), errorCount: 0, lastError: null })
        .where(eq(feed.id, f.id));
      return 0;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = await parseFeed(await res.text(), f.kind);
    const fresh = await storeEntries(f.id, parsed.entries);
    await createItems(f, fresh);
    await db
      .update(feed)
      .set({
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        lastFetchedAt: new Date(),
        nextFetchAt: nextFetch(0),
        errorCount: 0,
        lastError: null,
      })
      .where(eq(feed.id, f.id));
    return fresh.length;
  } catch (err) {
    await db
      .update(feed)
      .set({
        errorCount: f.errorCount + 1,
        lastError: err instanceof Error ? err.message : String(err),
        nextFetchAt: nextFetch(f.errorCount + 1),
      })
      .where(eq(feed.id, f.id));
    return 0;
  }
}

/** Feeds due for a fetch, optionally limited to one user's subscriptions. */
export async function dueFeeds(limit: number, userId?: string) {
  const subscribed = db
    .select({ id: subscription.feedId })
    .from(subscription)
    .where(userId ? eq(subscription.userId, userId) : undefined);
  return db
    .select()
    .from(feed)
    .where(and(inArray(feed.id, subscribed), userId ? undefined : sql`${feed.nextFetchAt} <= now()`))
    .orderBy(feed.nextFetchAt)
    .limit(limit);
}
