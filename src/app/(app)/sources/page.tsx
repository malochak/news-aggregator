import { listCategories, listCreators, listSubscriptions } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { relativeTime } from "@/lib/format";
import { AddSourceForms, CategoryForm, DeleteCategoryButton, SubscriptionRow } from "./forms";

export const metadata = { title: "Sources" };

export default async function SourcesPage() {
  const user = await requireUser();
  const [subs, categories, creators] = await Promise.all([
    listSubscriptions(user.id),
    listCategories(user.id),
    listCreators(user.id),
  ]);
  const groups = [
    ...categories.map((c) => ({ id: c.id, name: c.name, color: c.color, subs: subs.filter((s) => s.categoryId === c.id) })),
    { id: null, name: "Uncategorized", color: "var(--rule)", subs: subs.filter((s) => !s.categoryId) },
  ].filter((g) => g.id || g.subs.length);

  return (
    <main className="mx-auto max-w-[760px] px-5 pt-8 sm:px-10 md:pt-14">
      <header className="mb-10 border-b-[3px] border-double border-ink pb-5">
        <p className="meta mb-1">{subs.length} followed</p>
        <h1 className="font-serif text-[2.75rem] leading-none tracking-tight sm:text-6xl">Sources</h1>
      </header>

      <AddSourceForms categories={categories} creators={creators.map((c) => c.name)} />

      <section className="mt-14">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl">Categories</h2>
        </div>
        <CategoryForm />
      </section>

      <section className="mt-10 space-y-10">
        {groups.map((g) => (
          <div key={g.id ?? "none"}>
            <div className="mb-1 flex items-center gap-3 border-b border-ink pb-2">
              <span className="h-3 w-3" style={{ background: g.color }} />
              <h3 className="meta flex-1 text-ink">{g.name}</h3>
              <span className="meta">{g.subs.length}</span>
              {g.id && <DeleteCategoryButton id={g.id} name={g.name} />}
            </div>
            {g.subs.length === 0 && <p className="py-3 text-sm text-graphite">Nothing here yet.</p>}
            <ul>
              {g.subs.map((s) => (
                <SubscriptionRow
                  key={s.id}
                  sub={{
                    id: s.id,
                    title: s.title,
                    url: s.siteUrl ?? s.feedUrl,
                    kind: s.kind,
                    categoryId: s.categoryId,
                    creatorName: s.creatorName,
                    status: s.lastError
                      ? `Error: ${s.lastError}`
                      : s.lastFetchedAt
                        ? `Checked ${relativeTime(s.lastFetchedAt)}`
                        : "Not checked yet",
                    failing: s.errorCount > 0,
                  }}
                  categories={categories}
                />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
