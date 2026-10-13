import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { summarizePending } from "@/lib/jobs";
import { saveLink } from "@/lib/links";
import { after } from "next/server";

// PWA share target and bookmarklet: /share?url=...
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.redirect(new URL("/sign-in", request.url), 303);
  // Android puts shared links in "text" more often than in "url".
  const candidate = params.get("url") || params.get("text")?.match(/https?:\/\/\S+/)?.[0];
  if (candidate) {
    await saveLink(session.user.id, candidate, params.get("title"));
    after(() => summarizePending(Date.now() + 45_000, { userId: session.user.id, limit: 5 }).catch(console.error));
  }
  return Response.redirect(new URL("/?saved=1", request.url), 303);
}
