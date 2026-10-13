# Feedlist — spec v0 (do dyskusji)

Robocza nazwa: **Feedlist**. Prywatny agregator treści, w którym każdy nowy materiał
(artykuł, film, post, odcinek) ląduje jako **zadanie do odhaczenia** z krótkim
streszczeniem w punktach.

## 1. Jak to działa (model mentalny)

```
Źródła (RSS, YouTube, Reddit, ...) ──► Fetcher (co 30 min) ──► Nowy item
                                                               │
                                     ekstrakcja treści / transkrypcji
                                                               │
                                       AI: 3–5 bullet pointów + czas czytania
                                                               │
                                                  Inbox jako lista zadań
                                                               │
                                   ☐ do zrobienia → ☑ przeczytane / obejrzane
                                                   → ⤫ pominięte / ★ zachowane
```

### Pojęcia
- **Źródło** – jeden konkretny feed: kanał YT, blog, subreddit, konto, newsletter.
- **Twórca** – grupuje kilka źródeł tej samej osoby (np. jej YT + blog + X).
- **Kategoria** – temat (np. „AI”, „Finanse”, „Bieganie”). Źródło należy do 1+ kategorii.
- **Temat (keyword watch)** – subskrypcja frazy zamiast źródła, np. „Claude Code”
  → wyszukiwanie w Google News RSS / YouTube / Reddit / HN.
- **Item = zadanie** – tytuł, źródło, typ, czas czytania/oglądania, bullet pointy,
  link, status.

### Statusy zadania
`nowe` → `przeczytane/obejrzane` | `pominięte` | `zachowane (★ na później / do bazy wiedzy)`.
Nieruszone itemy starsze niż N dni (domyślnie 7) automatycznie trafiają do archiwum,
żeby inbox nie rósł w nieskończoność.

## 2. Źródła — co jest realne

| Źródło | Jak pobieramy | Koszt / trudność |
|---|---|---|
| Blogi, serwisy newsowe | RSS/Atom (autodetekcja z URL strony) | darmowe, łatwe |
| YouTube (kanały, playlisty) | oficjalny RSS kanału `feeds/videos.xml?channel_id=` | darmowe, łatwe |
| YouTube – streszczenie | transkrypcja (napisy auto) → AI | darmowe, czasem zawodne |
| Reddit | RSS subreddita / użytkownika | darmowe |
| Hacker News | API Algolia / RSS (z filtrem punktów) | darmowe |
| Podcasty | RSS | darmowe |
| Substack / newslettery | RSS Substacka lub unikalny adres e-mail do przekierowania | darmowe / średnie |
| Bluesky, Mastodon | natywny RSS profilu | darmowe |
| **X / Twitter** | oficjalne API to min. ~200 USD/mies.; alternatywa: self-hostowany RSSHub (niestabilne) | **problematyczne** |
| LinkedIn, Instagram | brak sensownego API | odpuszczamy w v1 |

Rekomendacja dla X: w v1 nie integrujemy automatycznie. Zamiast tego **„dodaj link
ręcznie”** (share sheet z telefonu / bookmarklet) — wklejasz link do posta/wątku,
on też staje się zadaniem. Większość twórców z X ma też YT/blog/Substack.

## 3. Funkcje

### MVP (v1)
1. Dodawanie źródła przez wklejenie URL (strona, kanał YT, subreddit) — autodetekcja feedu.
2. Kategorie + przypisanie źródeł; grupowanie źródeł w Twórców.
3. Cykliczny fetch (co 30 min) + deduplikacja (ten sam link z dwóch źródeł = 1 zadanie).
4. Streszczenie AI: 3–5 punktów, szacowany czas, typ (artykuł / wideo / wątek).
5. Inbox jako lista zadań: filtrowanie po kategorii / typie / twórcy, odhaczanie,
   pominięcie, ★ zachowanie; skróty klawiszowe (j/k, x, s, o).
6. Widok „Dziś”: ile zostało, łączny czas (np. „14 pozycji · ~1 h 20 min”).
7. Ręczne dodanie linku (share sheet / bookmarklet) — m.in. dla X.
8. PWA – instalowalna na telefonie, działa jak apka.
9. Import OPML (jeśli masz już subskrypcje w Feedly/Inoreader).

### Później (v2+)
- Keyword watch (temat zamiast źródła).
- Dzienny/tygodniowy digest na e-mail lub push.
- Limity per kategoria („max 5 z AI dziennie, reszta do archiwum”) i priorytety twórców.
- Odtwarzacz YT osadzony w apce + zaznaczenie „obejrzane” po końcu filmu.
- Notatki do itemu, eksport zachowanych do Notion / Markdown.
- „Czytnik” – czysty widok artykułu w apce.

## 4. Technologia (rekomendacja)

- **Next.js 15 (App Router) + TypeScript** – frontend i API w jednym projekcie.
- **Tailwind CSS + Radix UI (primitives)** – własny design, bez gotowego „wyglądu shadcn”.
- **SQLite + Drizzle ORM** – jeden plik bazy, zero administracji; łatwa migracja do
  Postgresa (Neon/Supabase), gdyby kiedyś była potrzebna.
- **Worker** w tym samym repo (Node, `node-cron`) – pobiera feedy, ekstrahuje treść
  (`@mozilla/readability`), transkrypcje YT, woła AI.
- **AI**: Claude API (model z rodziny Haiku – tani i szybki; streszczenie to ułamki centa).
- **Auth**: jedna osoba → prosty login (Auth.js z magic linkiem lub GitHub OAuth).
- **Hosting**: jeden kontener Docker (web + worker + SQLite na wolumenie) na
  Railway / Fly.io / małym VPS (Hetzner ~5 EUR/mies.).

Dlaczego tak: jeden język, jedno repo, jeden deploy, bez osobnej kolejki i bazy
do utrzymania. Dla jednego użytkownika i kilkuset źródeł to aż nadto.

### Model danych (szkic)
```
category(id, name, color, sort)
creator(id, name, avatar_url)
source(id, type, url, feed_url, title, creator_id?, last_fetched_at, etag, error)
source_category(source_id, category_id)
item(id, source_id, url_canonical UNIQUE, title, type, published_at,
     duration_min, summary_bullets JSON, status, starred, done_at, created_at)
```

## 5. Prompt do designu (Claude / Figma / v0)

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

## 6. Otwarte pytania
Zob. wiadomość w sesji — odpowiedzi doprecyzują v1.
