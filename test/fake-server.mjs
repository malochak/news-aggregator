// Local stand-in for the outside world during manual/e2e testing:
// serves fixture feeds and an OpenAI-compatible chat endpoint.
//   node test/fake-server.mjs  →  http://localhost:4010
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const routes = {
  "/blog": ["text/html", "blog.html"],
  "/blog/feed.xml": ["application/rss+xml", "blog.xml"],
  "/blog/fridays": ["text/html", "article.html"],
  "/blog/sqlite": ["text/html", "article.html"],
  "/youtube.xml": ["application/atom+xml", "youtube.xml"],
};

createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/v1/chat/completions") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const prompt = JSON.parse(body).messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
    const title = prompt.match(/Title: (.*)/)?.[1] ?? "?";
    const content = JSON.stringify({
      bullets: [`Summary of “${title}”.`, "A second concrete takeaway with a number: 40%.", "A closing point."],
    });
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(
      JSON.stringify({
        id: "x",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "fake",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    );
  }
  const route = routes[path];
  if (!route) return res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": route[0] });
  res.end(fixture(route[1]));
}).listen(4010, () => console.log("fake server on http://localhost:4010"));
