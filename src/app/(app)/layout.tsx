import Link from "next/link";
import { listCategories } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { NavLink } from "@/components/nav-link";
import { SignOut } from "@/components/sign-out";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const categories = await listCategories(user.id);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1180px]">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-rule px-6 py-8 md:flex">
        <Link href="/" className="mb-10 font-serif text-2xl italic tracking-tight">
          Feedlist<span className="text-accent">.</span>
        </Link>
        <p className="meta mb-2">Index</p>
        <nav className="mb-8 flex flex-col gap-1 text-[15px]">
          <NavLink href="/">Today</NavLink>
          <NavLink href="/?view=starred">Saved</NavLink>
          <NavLink href="/?view=done">Done</NavLink>
        </nav>
        <p className="meta mb-2">Categories</p>
        <nav className="flex flex-col gap-1 text-[15px]">
          {categories.map((c) => (
            <NavLink key={c.id} href={`/?c=${c.id}`} count={c.inbox}>
              <span className="mr-2 inline-block h-2.5 w-2.5 align-middle" style={{ background: c.color }} />
              {c.name}
            </NavLink>
          ))}
          {categories.length === 0 && (
            <Link href="/sources" className="text-sm text-graphite link">
              Add a category
            </Link>
          )}
        </nav>
        <div className="mt-auto flex flex-col gap-1 text-[15px]">
          <NavLink href="/sources">Sources</NavLink>
          <NavLink href="/settings">Settings</NavLink>
          <SignOut />
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-24 md:pb-0">
        {children}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {[
          ["/", "Today"],
          ["/?view=starred", "Saved"],
          ["/sources", "Sources"],
          ["/settings", "Settings"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="meta py-4 text-center text-ink">
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
