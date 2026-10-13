import Parser from "rss-parser";
import type { FeedKind, MediaType } from "@/db/schema";

type CustomItem = {
  id?: string;
  author?: string;
  videoId?: string;
  mediaGroup?: { "media:description"?: string[]; "media:thumbnail"?: { $: { url: string } }[] };
  mediaThumbnail?: { $: { url: string } };
  contentEncoded?: string;
  enclosure?: { url: string; type?: string };
  itunes?: { duration?: string; image?: string };
};

const parser = new Parser<Record<string, unknown>, CustomItem>({
  customFields: {
    item: [
      ["yt:videoId", "videoId"],
      ["media:group", "mediaGroup"],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

export type ParsedEntry = {
  guid: string;
  url: string;
  title: string;
  author: string | null;
  mediaType: MediaType;
  content: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  publishedAt: Date | null;
};

export type ParsedFeed = {
  title: string;
  siteUrl: string | null;
  imageUrl: string | null;
  entries: ParsedEntry[];
};

export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(li|h\d)>/gi, "\n")
    .replace(/<\/(p|div|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

function parseDuration(value: string | undefined): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function mediaTypeFor(kind: FeedKind, item: CustomItem): MediaType {
  if (kind === "youtube" || item.videoId) return "video";
  if (kind === "podcast" || item.enclosure?.type?.startsWith("audio/")) return "audio";
  if (kind === "reddit" || kind === "bluesky" || kind === "mastodon" || kind === "hn") return "post";
  return "article";
}

export async function parseFeed(xml: string, kind: FeedKind = "rss"): Promise<ParsedFeed> {
  const feed = await parser.parseString(xml);
  const entries: ParsedEntry[] = [];
  for (const item of feed.items) {
    const url = item.link?.trim();
    if (!url) continue;
    const isVideo = Boolean(item.videoId);
    const content = isVideo
      ? (item.mediaGroup?.["media:description"]?.[0] ?? null)
      : htmlToText(item.contentEncoded ?? item.content ?? item.summary ?? null);
    entries.push({
      guid: item.guid ?? item.id ?? url,
      url,
      title: item.title?.trim() || url,
      author: item.creator ?? item.author ?? null,
      mediaType: mediaTypeFor(kind, item),
      content,
      thumbnailUrl:
        item.mediaGroup?.["media:thumbnail"]?.[0]?.$.url ??
        item.mediaThumbnail?.$.url ??
        item.itunes?.image ??
        null,
      durationSec: parseDuration(item.itunes?.duration),
      publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
    });
  }
  return {
    title: feed.title?.trim() || "Untitled feed",
    siteUrl: feed.link ?? null,
    imageUrl: feed.image?.url ?? (feed.itunes as { image?: string } | undefined)?.image ?? null,
    entries,
  };
}
