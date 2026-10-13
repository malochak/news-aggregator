import { and, asc, count, desc, eq, isNull, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { category, creator, feed, item, subscription, userSettings, type MediaType } from "@/db/schema";

export type View = "inbox" | "starred" | "done";

export async function listItems(
  userId: string,
  filters: { view: View; categoryId?: string; type?: MediaType },
) {
  const where = [eq(item.userId, userId)];
  if (filters.view === "inbox") where.push(eq(item.status, "inbox"));
  if (filters.view === "starred") where.push(eq(item.starred, true));
  if (filters.view === "done") where.push(sql`${item.status} in ('done', 'skipped')`);
  if (filters.type) where.push(eq(item.mediaType, filters.type));
  if (filters.categoryId === "none") where.push(isNull(subscription.categoryId));
  else if (filters.categoryId) where.push(eq(subscription.categoryId, filters.categoryId));

  return db
    .select({
      id: item.id,
      url: item.url,
      title: item.title,
      sourceName: item.sourceName,
      mediaType: item.mediaType,
      thumbnailUrl: item.thumbnailUrl,
      publishedAt: item.publishedAt,
      createdAt: item.createdAt,
      status: item.status,
      starred: item.starred,
      summary: item.summary,
      summaryStatus: item.summaryStatus,
      minutes: item.minutes,
      completedAt: item.completedAt,
      categoryColor: category.color,
      categoryName: category.name,
      creatorName: creator.name,
    })
    .from(item)
    .leftJoin(subscription, eq(subscription.id, item.subscriptionId))
    .leftJoin(category, eq(category.id, subscription.categoryId))
    .leftJoin(creator, eq(creator.id, subscription.creatorId))
    .where(and(...where))
    .orderBy(
      filters.view === "done"
        ? desc(item.completedAt)
        : desc(sql`coalesce(${item.publishedAt}, ${item.createdAt})`),
    )
    .limit(filters.view === "inbox" ? 300 : 100);
}

export type ListedItem = Awaited<ReturnType<typeof listItems>>[number];

export async function inboxStats(userId: string) {
  const [row] = await db
    .select({ count: count(), minutes: sum(item.minutes) })
    .from(item)
    .where(and(eq(item.userId, userId), eq(item.status, "inbox")));
  const [doneToday] = await db
    .select({ count: count() })
    .from(item)
    .where(
      and(eq(item.userId, userId), eq(item.status, "done"), sql`${item.completedAt} > now() - interval '24 hours'`),
    );
  return { count: row.count, minutes: Number(row.minutes ?? 0), doneToday: doneToday.count };
}

export async function listCategories(userId: string) {
  return db
    .select({
      id: category.id,
      name: category.name,
      color: category.color,
      // Raw SQL: drizzle leaves columns unqualified in single-table selects.
      inbox: sql<number>`(
        select count(*)::int from item i
        join subscription s on s.id = i.subscription_id
        where s.category_id = "category"."id" and i.status = 'inbox'
      )`,
    })
    .from(category)
    .where(eq(category.userId, userId))
    .orderBy(asc(category.position), asc(category.name));
}

export async function listCreators(userId: string) {
  return db.select().from(creator).where(eq(creator.userId, userId)).orderBy(asc(creator.name));
}

export async function listSubscriptions(userId: string) {
  return db
    .select({
      id: subscription.id,
      title: sql<string>`coalesce(${subscription.title}, ${feed.title})`,
      feedUrl: feed.url,
      siteUrl: feed.siteUrl,
      kind: feed.kind,
      lastFetchedAt: feed.lastFetchedAt,
      lastError: feed.lastError,
      errorCount: feed.errorCount,
      categoryId: subscription.categoryId,
      creatorId: subscription.creatorId,
      creatorName: creator.name,
    })
    .from(subscription)
    .innerJoin(feed, eq(feed.id, subscription.feedId))
    .leftJoin(creator, eq(creator.id, subscription.creatorId))
    .where(eq(subscription.userId, userId))
    .orderBy(asc(sql`coalesce(${subscription.title}, ${feed.title})`));
}

export async function getSettings(userId: string) {
  return db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
}
