"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function NavLink({ href, children, count }: { href: string; children: React.ReactNode; count?: number }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const url = new URL(href, "http://x");
  const active =
    url.pathname === pathname &&
    (url.search ? [...url.searchParams].every(([k, v]) => search.get(k) === v) : !search.get("view") && !search.get("c"));
  return (
    <Link
      href={href}
      className={`group flex items-baseline justify-between py-0.5 ${active ? "text-ink" : "text-graphite hover:text-ink"}`}
    >
      <span className={active ? "underline decoration-accent decoration-2 underline-offset-4" : ""}>{children}</span>
      {count ? <span className="font-mono text-xs">{count}</span> : null}
    </Link>
  );
}
