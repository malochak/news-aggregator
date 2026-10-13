export function relativeTime(date: Date | string | null, now = Date.now()) {
  if (!date) return null;
  const diff = Math.max(0, now - new Date(date).getTime());
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${Math.max(1, min)} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} d ago`;
  return new Date(date).toLocaleDateString("en", { month: "short", day: "numeric" });
}

export function duration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const MEDIA_LABEL = { article: "Read", video: "Watch", audio: "Listen", post: "Post" } as const;
