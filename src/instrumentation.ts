export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.INTERNAL_CRON !== "true") return;
  const { runJobs } = await import("./lib/jobs");
  const minutes = Math.max(5, Number(process.env.FETCH_INTERVAL_MINUTES ?? 30));
  const tick = () =>
    runJobs(5 * 60_000)
      .then((r) => console.log("[feedlist] jobs", JSON.stringify(r)))
      .catch((err) => console.error("[feedlist] jobs failed", err));
  // Feeds are scheduled individually (next_fetch_at), so ticking more often than
  // the interval only spreads the work out.
  setTimeout(tick, 10_000);
  setInterval(tick, Math.min(minutes, 10) * 60_000);
}
