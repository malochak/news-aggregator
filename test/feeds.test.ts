import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverFeed, DiscoveryError, topicFeedUrls } from "@/lib/feeds/discover";
import { looksLikeFeed } from "@/lib/feeds/http";
import { htmlToText, parseFeed } from "@/lib/feeds/parse";
import { guessMediaType } from "@/lib/links";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

afterEach(() => vi.unstubAllGlobals());

function stubFetch(routes: Record<string, { body: string; type: string } | undefined>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    return new Response(route.body, { status: 200, headers: { "content-type": route.type } });
  });
  return calls;
}

describe("parseFeed", () => {
  it("reads YouTube entries as videos with description and thumbnail", async () => {
    const feed = await parseFeed(fixture("youtube.xml"), "youtube");
    expect(feed.title).toBe("Fireship");
    expect(feed.entries).toHaveLength(2);
    expect(feed.entries[0]).toMatchObject({
      title: "Postgres in 100 Seconds",
      url: "https://www.youtube.com/watch?v=abc123",
      mediaType: "video",
      thumbnailUrl: "https://i2.ytimg.com/vi/abc123/hqdefault.jpg",
    });
    expect(feed.entries[0].content).toContain("MVCC");
    expect(feed.entries[0].publishedAt?.toISOString()).toBe("2026-10-12T15:00:00.000Z");
  });

  it("reads RSS with content:encoded as plain text", async () => {
    const feed = await parseFeed(fixture("blog.xml"));
    expect(feed.entries.map((e) => e.guid)).toEqual(["sqlite-post", "fridays"]);
    expect(feed.entries[0].content).toBe(
      "We replaced our Postgres cluster with SQLite on each node.\n\nLatency dropped by 40% and the ops burden almost vanished.",
    );
    expect(feed.entries[0].author).toBe("Jane Doe");
    expect(feed.entries[0].mediaType).toBe("article");
  });
});

describe("looksLikeFeed", () => {
  it("detects feeds by content type or body", () => {
    expect(looksLikeFeed("", "application/rss+xml; charset=utf-8")).toBe(true);
    expect(looksLikeFeed(fixture("youtube.xml"), "text/plain")).toBe(true);
    expect(looksLikeFeed(fixture("blog.html"), "text/html")).toBe(false);
  });
});

describe("discoverFeed", () => {
  it("maps YouTube channel URLs straight to the channel feed", async () => {
    const feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA";
    stubFetch({ [feedUrl]: { body: fixture("youtube.xml"), type: "text/xml" } });
    const found = await discoverFeed("https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA");
    expect(found).toMatchObject({ url: feedUrl, kind: "youtube" });
  });

  it("resolves a YouTube @handle via the channel page", async () => {
    const feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA";
    stubFetch({
      "https://www.youtube.com/@Fireship": {
        body: '<html><link rel="canonical" href="https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA"></html>',
        type: "text/html",
      },
      [feedUrl]: { body: fixture("youtube.xml"), type: "text/xml" },
    });
    expect((await discoverFeed("youtube.com/@Fireship")).url).toBe(feedUrl);
  });

  it("maps subreddits to their RSS feed", async () => {
    const calls = stubFetch({
      "https://www.reddit.com/r/LocalLLaMA/.rss": { body: fixture("blog.xml"), type: "application/atom+xml" },
    });
    const found = await discoverFeed("https://old.reddit.com/r/LocalLLaMA/top");
    expect(found.kind).toBe("reddit");
    expect(calls).toEqual(["https://www.reddit.com/r/LocalLLaMA/.rss"]);
  });

  it("finds a feed advertised in a page's <link rel=alternate>", async () => {
    stubFetch({
      "https://example.com/": { body: fixture("blog.html"), type: "text/html" },
      "https://example.com/blog/feed.xml": { body: fixture("blog.xml"), type: "application/rss+xml" },
    });
    const found = await discoverFeed("example.com");
    expect(found.url).toBe("https://example.com/blog/feed.xml");
    expect(found.parsed.title).toBe("Example Engineering Blog");
  });

  it("explains that X has no free feed", async () => {
    stubFetch({});
    await expect(discoverFeed("https://x.com/karpathy")).rejects.toBeInstanceOf(DiscoveryError);
  });

  it("fails clearly when a page has no feed", async () => {
    stubFetch({ "https://example.com/": { body: "<html></html>", type: "text/html" } });
    await expect(discoverFeed("https://example.com/")).rejects.toThrow("No RSS/Atom feed found");
  });
});

describe("helpers", () => {
  it("builds topic search feeds", () => {
    const urls = topicFeedUrls("claude code").map((t) => t.url);
    expect(urls[0]).toContain("news.google.com/rss/search?q=claude%20code");
    expect(urls).toHaveLength(3);
  });

  it("guesses media type from a link", () => {
    expect(guessMediaType(new URL("https://youtu.be/x"))).toBe("video");
    expect(guessMediaType(new URL("https://x.com/a/status/1"))).toBe("post");
    expect(guessMediaType(new URL("https://example.com/post"))).toBe("article");
  });

  it("strips html", () => {
    expect(htmlToText("<p>a &amp; b</p><script>x</script><p>c</p>")).toBe("a & b\n\nc");
  });
});
