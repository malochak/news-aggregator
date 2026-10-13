import type { FeedKind } from "@/db/schema";
import { httpGet, looksLikeFeed } from "./http";
import { parseFeed, type ParsedFeed } from "./parse";

export type DiscoveredFeed = { url: string; kind: FeedKind; parsed: ParsedFeed; xml: string };

export class DiscoveryError extends Error {}

const YT_FEED = "https://www.youtube.com/feeds/videos.xml";

/** Turns whatever the user pasted (site, channel, profile, feed) into a feed. */
export async function discoverFeed(input: string): Promise<DiscoveredFeed> {
  const url = normalizeInput(input);
  const host = url.hostname.replace(/^(www\.|m\.|old\.)/, "");

  if (host === "x.com" || host === "twitter.com") return discoverX(url);
  if (host === "youtube.com" || host === "youtu.be") return load(await youtubeFeedUrl(url), "youtube");
  if (host === "reddit.com") return load(redditFeedUrl(url), "reddit");
  if (host === "news.ycombinator.com") return load("https://hnrss.org/frontpage?points=100", "hn");
  if (host === "bsky.app") {
    const m = url.pathname.match(/^\/profile\/([^/]+)/);
    if (!m) throw new DiscoveryError("Paste a Bluesky profile URL, e.g. https://bsky.app/profile/name.bsky.social");
    return load(`https://bsky.app/profile/${m[1]}/rss`, "bluesky");
  }
  if (/^\/@[^/]+\/?$/.test(url.pathname)) {
    // Looks like a Mastodon profile; every Mastodon instance serves /@user.rss.
    const feed = await tryLoad(`${url.origin}${url.pathname.replace(/\/$/, "")}.rss`, "mastodon");
    if (feed) return feed;
  }
  return discoverGeneric(url);
}

/** Keyword watch: news + discussion search feeds for a phrase. */
export function topicFeedUrls(query: string) {
  const q = encodeURIComponent(query.trim());
  return [
    { url: `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, label: "Google News" },
    { url: `https://hnrss.org/newest?q=${q}&points=20`, label: "Hacker News" },
    { url: `https://www.reddit.com/search.rss?q=${q}&sort=top&t=day`, label: "Reddit" },
  ];
}

export async function loadFeed(url: string, kind: FeedKind): Promise<DiscoveredFeed> {
  return load(url, kind);
}

function normalizeInput(input: string): URL {
  const trimmed = input.trim();
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new DiscoveryError("That doesn't look like a URL");
  }
}

async function load(url: string, kind: FeedKind): Promise<DiscoveredFeed> {
  const res = await httpGet(url);
  if (!res.ok) throw new DiscoveryError(`Feed returned HTTP ${res.status}`);
  const xml = await res.text();
  if (!looksLikeFeed(xml, res.headers.get("content-type"))) throw new DiscoveryError("No feed found at that address");
  return { url, kind, parsed: await parseFeed(xml, kind), xml };
}

async function tryLoad(url: string, kind: FeedKind) {
  try {
    return await load(url, kind);
  } catch {
    return null;
  }
}

async function youtubeFeedUrl(url: URL): Promise<string> {
  const list = url.searchParams.get("list");
  if (list) return `${YT_FEED}?playlist_id=${list}`;
  const channel = url.pathname.match(/^\/channel\/(UC[\w-]{22})/);
  if (channel) return `${YT_FEED}?channel_id=${channel[1]}`;
  // @handle, /c/name, /user/name or a video URL: read the channel id from the page.
  const page = `https://www.youtube.com${url.pathname}${url.search}`;
  const res = await httpGet(page, { headers: { accept: "text/html", "accept-language": "en" } });
  const html = await res.text();
  const id =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ??
    html.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/)?.[1];
  if (!id) throw new DiscoveryError("Couldn't find the YouTube channel. Try the channel's main page URL.");
  return `${YT_FEED}?channel_id=${id}`;
}

function redditFeedUrl(url: URL): string {
  const m = url.pathname.match(/^\/(r|u|user)\/([^/]+)/);
  if (!m) return "https://www.reddit.com/.rss";
  return `https://www.reddit.com/${m[1] === "r" ? "r" : "user"}/${m[2]}/.rss`;
}

async function discoverX(url: URL): Promise<DiscoveredFeed> {
  const handle = url.pathname.split("/").filter(Boolean)[0];
  const rsshub = process.env.RSSHUB_URL?.replace(/\/$/, "");
  if (rsshub && handle) return load(`${rsshub}/twitter/user/${handle}`, "rss");
  throw new DiscoveryError(
    "X has no free feeds. Save individual posts with “Save link”, or set RSSHUB_URL to a self-hosted RSSHub.",
  );
}

async function discoverGeneric(url: URL): Promise<DiscoveredFeed> {
  const res = await httpGet(url.toString()).catch(() => {
    throw new DiscoveryError("Couldn't reach that site");
  });
  const body = await res.text();
  const kind: FeedKind = /podcast|itunes/i.test(body.slice(0, 3000)) ? "podcast" : "rss";
  if (res.ok && looksLikeFeed(body, res.headers.get("content-type"))) {
    return { url: res.url || url.toString(), kind, parsed: await parseFeed(body, kind), xml: body };
  }

  const candidates = [
    ...[...body.matchAll(/<link\b[^>]*>/gi)]
      .map((m) => m[0])
      .filter((tag) => /rel=["']?alternate/i.test(tag) && /type=["']?application\/(rss|atom|feed)\+xml/i.test(tag))
      .map((tag) => tag.match(/href=["']([^"']+)["']/i)?.[1])
      .filter((href): href is string => Boolean(href))
      .filter((href) => !/comments/i.test(href)),
    ...["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/index.xml", "/feed/"],
  ];
  const base = res.url || url.toString();
  for (const href of [...new Set(candidates)]) {
    const feed = await tryLoad(new URL(href.replaceAll("&amp;", "&"), base).toString(), "rss");
    if (feed) return feed;
  }
  throw new DiscoveryError("No RSS/Atom feed found on that page");
}
