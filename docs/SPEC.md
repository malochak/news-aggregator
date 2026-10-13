# Feedlist — product spec

Feedlist is an open-source content aggregator in which every new article, video, post or episode
becomes a **to-do** with a 3–5 bullet summary. You read the bullets, open the item if it's worth it,
and tick it off.

## Decisions

| Question | Decision |
|---|---|
| Who is it for | Personal first, but multi-user: anyone can self-host it or get an account on a shared instance |
| AI | Bring your own key per user (Claude, ChatGPT, Mistral, Grok, Gemini, any OpenAI-compatible endpoint incl. self-hosted). Optional instance-wide key via env |
| What gets ticked off | The whole item. Bullets are only a summary |
| X / Twitter | Manual links for now (share sheet, bookmarklet). Optional RSSHub. Revisit with xAI's API (Grok has access to X search) |
| Sources vs topics | Both: follow sources/creators, or watch a phrase |
| Devices | Phone and desktop: responsive PWA |
| Summary language | English |
| Notifications | Daily email digest |
| Stack | Next.js 16, Postgres (Neon/Supabase/any), Drizzle, Better Auth, Vercel AI SDK, Tailwind 4 |
| Hosting | Vercel (free) + external cron, or Docker on a VPS with the in-process scheduler |

## Model

- **Feed**: one fetchable URL, shared by all subscribers (fetched once per cycle).
- **Entry**: one post in a feed.
- **Subscription**: a user following a feed, with an optional category and creator.
- **Category**: a user's topic (name + ink colour). **Creator**: groups one person's feeds.
- **Item**: the to-do: one entry (or saved link) for one user, with status
  `inbox → done | skipped | archived`, a ★ flag, summary bullets and estimated minutes.
- **Topic watch**: a phrase turned into search feeds (Google News, HN, Reddit).

## Done in v0.1

- Sign up / sign in (email + password, optional GitHub), sign-up can be closed
- Follow by URL with feed discovery (YouTube, Reddit, HN, Bluesky, Mastodon, RSS/Atom autodiscovery)
- Topic watch, saved links, PWA share target, bookmarklet
- Categories with colours, creators, per-source editing, unfollow
- Scheduler: `/api/cron` (Vercel cron / GitHub Action / any cron) or in-process timer (Docker)
- Summaries with the user's model; reading time for articles, duration for podcasts
- Inbox with filters (category, type), Saved, Done, undo, keyboard shortcuts
- Auto-archive after N days, daily email digest
- Light and dark theme

## Next

1. YouTube transcripts for better video summaries (today: the video description is used)
2. Swipe gestures on mobile (right = done, left = skip)
3. OPML import/export
4. Per-category daily limits and creator priority
5. X via xAI API search (if a Grok subscription is available)
6. Reader view inside the app, notes on items, export of saved items (Markdown/Notion)
7. Web push notifications

## Design prompt (Polish, for Claude / Figma / v0)

The current UI implements this direction; the prompt is kept for generating new screens.

> Zaprojektuj responsywną aplikację webową (mobile-first, potem desktop) o nazwie
> **Feedlist** — prywatny agregator treści, w którym każdy nowy artykuł, film YouTube,
> post czy odcinek podcastu staje się zadaniem do odhaczenia, z 3–5 punktami
> streszczenia.
>
> **Kierunek wizualny: „redakcyjny notes”.** Skrzyżowanie gazetowego spisu treści
> z papierowym checklistem. Ma wyglądać jak wydrukowana lista na dobrym papierze,
> a nie jak SaaS-owy dashboard.
>
> **Czego NIE robić:** żadnych fioletowo-niebieskich gradientów, glassmorphismu,
> neonów, kart z miękkimi cieniami i dużym zaokrągleniem, ikon-emoji, fontu Inter,
> hero z ilustracją 3D, „bento grid”.
>
> **Kolory (light):**
> - Papier (tło): `#F3EFE6`, papier ciemniejszy (panele): `#EAE4D7`
> - Atrament (tekst): `#1B1A17`, grafit (meta): `#6B675E`, linie: `#D6CEBD`
> - Akcent – cynober (nowe, CTA, licznik): `#E4472B`
> - Zrobione – oliwka: `#5E6B3A`
> - Kolory kategorii (stonowane, jak tusze drukarskie): ochra `#C8962E`,
>   granat `#2F4A66`, śliwka `#7A4E63`, mech `#4F6B57`, terakota `#B4643C`
>
> **Kolory (dark):** tło `#16150F`, panele `#1F1D17`, tekst `#ECE6D8`,
> meta `#9A9384`, linie `#34312A`, cynober `#FF5A3C`, oliwka `#9AAA6A`.
>
> **Typografia:** nagłówki i tytuły itemów – szeryfowy, redakcyjny *Newsreader*
> (lub *Source Serif 4*); UI – *IBM Plex Sans*; metadane, liczniki, czasy, daty –
> *IBM Plex Mono* w kapitalikach z lekkim letter-spacingiem.
>
> **Layout:**
> - Zamiast kart: lista rozdzielona cienkimi liniami (hairline 1px), jak spis treści.
> - Nagłówek dnia w stylu winiety gazety: duża data szeryfem
>   („Wtorek, 13 października”) + pod nią mono-linia „14 DO PRZECZYTANIA · ~1 H 20 MIN”.
> - Wiersz zadania: po lewej kwadratowy checkbox (ostre rogi, 1.5px obrys),
>   tytuł szeryfem, pod nim mono-meta (`YT · FIRESHIP · 12 MIN · 2 H TEMU`),
>   kolorowy pasek 3px kategorii przy lewej krawędzi, bullet pointy rozwijane
>   pod tytułem jako krótkie myślniki „—”.
> - Odhaczenie: checkbox wypełnia się oliwką, tytuł dostaje przekreślenie
>   „ręcznym” lekko nierównym pociągnięciem, wiersz po chwili zsuwa się w dół
>   do sekcji „Zrobione dziś”.
> - Desktop: lewa wąska kolumna jak indeks gazety (kategorie z licznikami,
>   twórcy, filtry typu), środek – lista, prawa kolumna – podgląd itemu
>   (bullet pointy, miniatura YT, przycisk „Otwórz”, „Pomiń”, „★ Zachowaj”).
> - Mobile: dolny pasek z 4 pozycjami (Dziś, Kategorie, Zachowane, Dodaj),
>   swipe w prawo = przeczytane, w lewo = pomiń.
> - Dużo powietrza w pionie, wąska kolumna tekstu (max ~680px), wyrównanie do
>   siatki 8px, zero cieni – hierarchia tylko typografią, liniami i kolorem.
>
> **Ekrany do zaprojektowania:** 1) Dziś (inbox) – stan pełny i „inbox zero”
> z ładnym typograficznym komunikatem, 2) widok kategorii, 3) szczegół itemu,
> 4) dodawanie źródła (pole URL + podgląd wykrytego feedu + wybór kategorii),
> 5) lista źródeł i twórców, 6) ustawienia. Pokaż light i dark.
