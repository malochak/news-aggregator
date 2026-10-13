
import { assertPublicUrl } from "@/lib/net";

export const USER_AGENT =
  process.env.FETCH_USER_AGENT ?? "Mozilla/5.0 (compatible; Feedlist/0.1; +https://github.com/malochak/news-aggregator)";

const MAX_REDIRECTS = 5;

/** GET with a timeout, following redirects only to public addresses. */
export async function httpGet(url: string, init: { headers?: Record<string, string>; timeoutMs?: number } = {}) {
  const signal = AbortSignal.timeout(init.timeoutMs ?? 15_000);
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
        ...init.headers,
      },
      redirect: "manual",
      signal,
    });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return res;
    current = new URL(location, current);
  }
  throw new Error("Too many redirects");
}

export function looksLikeFeed(body: string, contentType: string | null) {
  if (contentType && /(rss|atom|xml)/i.test(contentType) && !/html/i.test(contentType)) return true;
  const head = body.slice(0, 1000).trimStart();
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(rss|feed|rdf:RDF)[\s>]/i.test(head);
}
