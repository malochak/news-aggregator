import { timingSafeEqual } from "node:crypto";
import { runJobs } from "@/lib/jobs";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Vercel Cron sends GET with "Authorization: Bearer $CRON_SECRET"; other schedulers can POST.
async function handler(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await runJobs((maxDuration - 8) * 1000);
  return Response.json(result);
}

export { handler as GET, handler as POST };
