import { db } from "@/db";
import { item, type MediaType } from "@/db/schema";
import { extractArticle } from "@/lib/feeds/extract";

export function guessMediaType(url: URL): MediaType {
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  if (host === "youtube.com" || host === "youtu.be" || host === "vimeo.com") return "video";
  if (["x.com", "twitter.com", "bsky.app", "reddit.com", "threads.net", "news.ycombinator.com"].includes(host))
    return "post";
  if (host === "open.spotify.com" || host === "podcasts.apple.com") return "audio";
  return "article";
}

/** Saves a single link (e.g. an X post) as an inbox item. */
export async function saveLink(userId: string, rawUrl: string, title?: string | null) {
  const url = new URL(/^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`);
  const extracted = title ? null : await extractArticle(url.toString());
  const [row] = await db
    .insert(item)
    .values({
      userId,
      url: url.toString(),
      title: title || extracted?.title || url.hostname + url.pathname,
      sourceName: url.hostname.replace(/^www\./, ""),
      mediaType: guessMediaType(url),
      publishedAt: new Date(),
    })
    .onConflictDoUpdate({ target: [item.userId, item.url], set: { status: "inbox", completedAt: null } })
    .returning();
  return row;
}
