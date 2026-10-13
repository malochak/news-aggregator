import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Auth (tables required by Better Auth)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Feeds are shared across users: each feed is fetched once per cycle no
// matter how many people subscribe to it.
// ---------------------------------------------------------------------------

export type FeedKind = "rss" | "youtube" | "reddit" | "hn" | "bluesky" | "mastodon" | "podcast" | "topic";
export type MediaType = "article" | "video" | "audio" | "post";

export const feed = pgTable(
  "feed",
  {
    id: id(),
    url: text("url").notNull().unique(),
    siteUrl: text("site_url"),
    title: text("title").notNull(),
    kind: text("kind").$type<FeedKind>().notNull().default("rss"),
    imageUrl: text("image_url"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    nextFetchAt: timestamp("next_fetch_at", { withTimezone: true }).notNull().defaultNow(),
    errorCount: integer("error_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [index("feed_next_fetch_idx").on(t.nextFetchAt)],
);

export const entry = pgTable(
  "entry",
  {
    id: id(),
    feedId: text("feed_id")
      .notNull()
      .references(() => feed.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    author: text("author"),
    mediaType: text("media_type").$type<MediaType>().notNull().default("article"),
    content: text("content"),
    thumbnailUrl: text("thumbnail_url"),
    durationSec: integer("duration_sec"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("entry_feed_guid_idx").on(t.feedId, t.guid)],
);

// ---------------------------------------------------------------------------
// Per-user data
// ---------------------------------------------------------------------------

export const category = pgTable(
  "category",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("category_user_name_idx").on(t.userId, t.name)],
);

export const creator = pgTable(
  "creator",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("creator_user_name_idx").on(t.userId, t.name)],
);

export const subscription = pgTable(
  "subscription",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    feedId: text("feed_id")
      .notNull()
      .references(() => feed.id, { onDelete: "cascade" }),
    title: text("title"),
    categoryId: text("category_id").references(() => category.id, { onDelete: "set null" }),
    creatorId: text("creator_id").references(() => creator.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("subscription_user_feed_idx").on(t.userId, t.feedId),
    index("subscription_feed_idx").on(t.feedId),
  ],
);

export type ItemStatus = "inbox" | "done" | "skipped" | "archived";
export type SummaryStatus = "pending" | "done" | "failed";

/** An item is a to-do: one piece of content a user should read or watch. */
export const item = pgTable(
  "item",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    entryId: text("entry_id").references(() => entry.id, { onDelete: "set null" }),
    subscriptionId: text("subscription_id").references(() => subscription.id, {
      onDelete: "set null",
    }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    sourceName: text("source_name"),
    mediaType: text("media_type").$type<MediaType>().notNull().default("article"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    status: text("status").$type<ItemStatus>().notNull().default("inbox"),
    starred: boolean("starred").notNull().default(false),
    summary: jsonb("summary").$type<string[]>(),
    summaryStatus: text("summary_status").$type<SummaryStatus>().notNull().default("pending"),
    summaryError: text("summary_error"),
    summaryAttempts: integer("summary_attempts").notNull().default(0),
    minutes: integer("minutes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("item_user_url_idx").on(t.userId, t.url),
    index("item_user_status_idx").on(t.userId, t.status, t.createdAt),
    index("item_summary_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.summaryStatus} = 'pending'`),
  ],
);

export type AiProvider = "anthropic" | "openai" | "mistral" | "xai" | "google" | "openai-compatible";

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  aiProvider: text("ai_provider").$type<AiProvider>(),
  aiModel: text("ai_model"),
  aiBaseUrl: text("ai_base_url"),
  /** AES-256-GCM encrypted, see src/lib/crypto.ts */
  aiApiKey: text("ai_api_key"),
  timezone: text("timezone").notNull().default("UTC"),
  autoArchiveDays: integer("auto_archive_days").notNull().default(7),
  digestEnabled: boolean("digest_enabled").notNull().default(false),
  digestHour: integer("digest_hour").notNull().default(7),
  lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});
