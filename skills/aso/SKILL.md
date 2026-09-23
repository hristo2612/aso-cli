---
name: aso
description: Entry point and router for App Store Optimization (ASO) work on an iOS/macOS app using the `aso` CLI. Start here whenever a request is broad or ambiguous, such as "improve my ASO", "help with my App Store listing", "why isn't my app ranking", "do a full ASO pass", or just "ASO for my app", even if the user doesn't name a specific task. Checks the CLI is installed and signed in, explains Apple's search-indexing rules that every other ASO skill assumes you already know, then routes to the right specialized skill (aso-keyword-research, aso-metadata, aso-competitors, aso-audit, aso-tracking, aso-localization, aso-conversion). Skip straight to one of those instead when the request already names a specific job, like "write my subtitle" or "find my competitors".
---

# ASO Router

Entry point for all ASO work with the `aso` CLI (`hristo2612/aso-cli` on GitHub, `aso-kit` on npm). Do preflight, know the core facts, then route.

## Preflight

Run once per session before any other `aso` command:

```bash
aso status
```

- If `aso: command not found`: install it with `npm i -g hristo2612/aso-cli` (needs Node.js 22.13+, also published as `aso-kit` on npm), or `curl -fsSL https://raw.githubusercontent.com/hristo2612/aso-cli/main/install.sh | bash`.
- If `aso status` shows no active session: run `aso setup` (interactive first-run, Apple ID, app, default country, then triggers login) or `aso login` if already configured. Both open Chrome and handle 2FA/Keychain in the user's own terminal.
- **Never ask the user for their Apple ID password in chat.** Credentials go in macOS Keychain via `aso setup`/`aso login`, run directly by the user in their terminal. If a command needs interactive auth, tell the user to run it themselves and report back.
- Everything except `popularity` works without a session (search, ranks, difficulty, app lookup, lint). If there's no session and the user only needs those, proceed: `popularity` will just come back `null`.
- `aso login` finds the right Apple Ads org and a linked app on its own; you no longer need to look up or set `aso config orgId` as a normal step. `aso status` prints a `next` field naming the exact step to take when something's missing, read it before guessing.
- If a session exists but looks stale, `aso` auto-retries login once when credentials are in the Keychain; don't loop on it manually.

### If setup gets stuck

| Symptom / error code | Fix |
|---|---|
| `NO_APPLE_ADS_ACCOUNT` | No Apple Search Ads account yet. User signs up free at searchads.apple.com; choose United States if their own country isn't offered. |
| `NO_LINKED_APPS` | Apple Ads isn't linked to App Store Connect. In Apple Ads: account menu > Settings > Link Accounts. |
| `AUTH_REQUIRED` | Session missing or expired: run `aso login`. |
| 2FA code not auto-filled | Grant Accessibility permission to the terminal app (System Settings > Privacy & Security > Accessibility), or type the code directly into the Chrome window instead. |
| Chrome not found | Install Chrome, or run `npx playwright install chromium`. |
| Popularity comes back `5` for every keyword | Normal Apple floor for low/unknown-volume terms, not a broken session or a bug. |

## Core Apple search facts (know these before touching metadata)

- Three indexed fields per locale: **title (30 chars)**, **subtitle (30 chars)**, **keywords field (100 BYTES, not characters)**. Apple tokenizes all three and combines tokens into searchable phrases, a word in the title and a word in the subtitle can match together as a compound query.
- **The keywords field's 100-byte limit bites non-Latin locales hardest**: CJK and Arabic characters cost 2-3 bytes each in UTF-8, so a locale like ja, zh, or ar effectively gets far fewer keyword slots than an ASCII locale for the same 100 bytes. Budget by bytes, not by how many characters look like they'd fit. See `aso-localization`.
- **Never repeat a word across fields.** A word already indexed via the title gains nothing by also appearing in the subtitle or keywords field: it only burns a character budget that could hold a new term.
- Plurals are mostly redundant: Apple stems automatically, so "camera" already covers most "cameras" searches. Prefer the singular unless the plural has genuinely different search intent (e.g. "glass" vs "glasses").
- The keywords field is comma-separated with **no spaces after commas**: every space is a wasted character.
- **The description is NOT indexed for search on iOS.** Apple's algorithm ignores it for ranking; treat it purely as a conversion/readability lever, not a keyword-placement opportunity (see `aso-conversion`).
- Developer name and in-app purchase display names are also indexed text, on top of the three per-locale fields above.
- Category placement affects relevance and category-chart ranking, not just discovery structure: pick the category your target keywords actually belong to, don't chase a bigger but less relevant one.
- **Cross-locale indexing**: a storefront indexes more than its "native" locale. The US store, for example, also indexes locales like es-MX, fr-CA, pt-BR, zh-Hans/Hant, ja and the other English variants. Filling extra locales you're entitled to multiplies your effective keyword budget for that storefront. See `aso-localization`.
- Ratings, reviews, and conversion rate aren't indexed text either, but they're widely believed to feed back into ranking indirectly (an app that converts and retains better tends to rank better over time), separate from the direct textual indexing above. See `aso-audit` and `aso-conversion`.

## Data caveats

- **Popularity floor**: Apple's Search Ads popularity score (5-100) floors low/unknown-volume keywords at **5**. `aso keywords` flags this as `popularityFloor: true`. Treat a floored `5` as "no reliable signal", not "dead keyword", it can still be a real long-tail term.
- **Difficulty is the ASOManiac model**, not an Apple number: calibrated against third-party difficulty scores, it weighs competition from the top-10 ranking apps' ratings counts (55%), demand from popularity plus autocomplete signal (10%), and market quality from the top-10 apps' average rating (35%). Scored 0-100, higher is harder. Use it to compare keywords relative to each other and to the app's own authority, not as an absolute probability of ranking.
- **`opportunity`** = `popularity × (100 − difficulty) / 100`. It's a sort key for prioritizing candidates, not a traffic forecast.
- **`rank`** mixes sources: top ~10 comes from the App Store web search page, deeper positions from the iTunes Search API. `null` means not found in the top ~200, not necessarily "unranked forever."
- Each `aso keywords` item also carries `brand` (true when the term is essentially the #1 ranking app's own publisher/brand name, someone else's brand: don't shortlist it) and `confidence` (`high`/`medium`/`low`, how much to trust that term's popularity/difficulty numbers). `--min-popularity <n>` and `--max-difficulty <n>` pre-filter a batch; filtered terms come back under `filteredOut` with a reason, worth a glance before assuming they're all noise.
- Popularity needs an Apple Ads session; everything else works logged out.

## The CLI does not upload metadata

`aso` reads and measures; it never writes to App Store Connect. To ship a title/subtitle/keywords change, use fastlane `deliver` (a `fastlane/metadata/<locale>/{name.txt,subtitle.txt,keywords.txt}` tree) or paste manually into App Store Connect. **Never push or upload metadata without the user's explicit approval of the exact new text.** See `aso-metadata` for detail.

## Routing

| User wants... | Route to |
|---|---|
| Find/brainstorm/expand keywords, seed → shortlist | `aso-keyword-research` |
| Write or fix title/subtitle/keywords field for a locale | `aso-metadata` |
| Compare against competitors, find keyword gaps | `aso-competitors` |
| A health check / report card on the whole listing | `aso-audit` |
| Set up or review rank tracking over time | `aso-tracking` |
| Pick new markets, localize keywords, exploit cross-locale indexing | `aso-localization` |
| Icon, screenshots, preview video, Custom Product Pages, Product Page Optimization, In-App Events | `aso-conversion` |

Most requests map to exactly one skill. For a full "optimize everything" request, run in this order: `aso-audit` (find the gaps) → `aso-keyword-research` (fill them) → `aso-metadata` (draft and validate) → `aso-conversion` (fix conversion assets) → `aso-tracking` (measure). Confirm the app ID and country (`-c`, default from `aso config`) before running anything if either is ambiguous.

## Google Play

`aso` is Apple-only: it has no Google Play data or commands. If asked about a Play listing, say so and give the mental model only; see the Google Play appendix in `aso-audit`.
