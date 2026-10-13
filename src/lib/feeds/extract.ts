import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { httpGet } from "./http";

/** Fetches a web page and returns its main readable text. */
export async function extractArticle(url: string): Promise<{ title: string | null; text: string } | null> {
  try {
    const res = await httpGet(url, { headers: { accept: "text/html" }, timeoutMs: 15_000 });
    if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? "")) return null;
    const html = await res.text();
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document).parse();
    const text = article?.textContent?.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    if (!text) return null;
    return { title: article?.title ?? null, text };
  } catch {
    return null;
  }
}

export function readingMinutes(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}
