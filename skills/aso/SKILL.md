---
name: aso
description: Entry point for App Store Optimization (ASO) work on an iOS/macOS app using the `aso` CLI. Use for anything ASO-related, keyword research, title/subtitle/keywords optimization, competitor analysis, listing audits, rank tracking, or localization. Triggers on "ASO", "App Store Optimization", "optimize my app store listing", "app store keywords", "why isn't my app ranking", "help with my App Store presence". Checks the CLI is installed and logged in, explains how Apple indexes search, then routes to the right specialized skill (aso-keyword-research, aso-metadata, aso-competitors, aso-audit, aso-tracking, aso-localization).
---

# ASO Router

Entry point for all ASO work with the `aso` CLI (`asocli` on npm). Do preflight, know the core facts, then route.

## Preflight

Run once per session before any other `aso` command:

```bash
aso status
```

- If `aso: command not found`: install it with `npm i -g asocli` (needs Node.js 22.13+), or `curl -fsSL https://raw.githubusercontent.com/hristo2612/aso-cli/main/install.sh | bash`.
- If `aso status` shows no active session: run `aso setup` (interactive first-run, Apple ID, app, default country, then triggers login) or `aso login` if already configured. Both open Chrome and handle 2FA/Keychain in the user's own terminal.
- **Never ask the user for their Apple ID password in chat.** Credentials go in macOS Keychain via `aso setup`/`aso login`, run directly by the user in their terminal. If a command needs interactive auth, tell the user to run it themselves and report back.
- Everything except `popularity` works without a session (search, ranks, difficulty, app lookup, lint). If there's no session and the user only needs those, proceed: `popularity` will just come back `null`.
- If login succeeds but `aso status` says Apple Ads cannot read popularity, the account probably has several Apple Ads orgs and landed on one without the app. Ask the user for the org id that owns their app (the number in `app-ads.apple.com/cm/app/<orgId>/…`), run `aso config orgId <id>`, then `aso login`.
- If a session exists but looks stale, `aso` auto-retries login once when credentials are in the Keychain; don't loop on it manually.

## Core Apple search facts (know these before touching metadata)

- Three indexed fields per locale: **title (30 chars)**, **subtitle (30 chars)**, **keywords field (100 chars)**. Apple tokenizes all three and combines tokens into searchable phrases, a word in the title and a word in the subtitle can match together as a compound query.
- **Never repeat a word across fields.** A word already indexed via the title gains nothing by also appearing in the subtitle or keywords field: it only burns a character budget that could hold a new term.
- Plurals are mostly redundant: Apple stems automatically, so "camera" already covers most "cameras" searches. Prefer the singular unless the plural has genuinely different search intent (e.g. "glass" vs "glasses").
- The keywords field is comma-separated with **no spaces after commas**: every space is a wasted character.
- Category and developer name are also indexed signals, not just the three text fields.
- **Cross-locale indexing**: a storefront indexes more than its "native" locale. The US store, for example, also indexes locales like es-MX, fr-CA, pt-BR, zh-Hans/Hant, ja and the other English variants. Filling extra locales you're entitled to multiplies your effective keyword budget for that storefront. See `aso-localization`.

## Data caveats

- **Popularity floor**: Apple's Search Ads popularity score (5–100) floors low/unknown-volume keywords at **5**. `aso keywords` flags this as `popularityFloor: true`. Treat a floored `5` as "no reliable signal", not "dead keyword", it can still be a real long-tail term.
- **Difficulty is a heuristic**, not an Apple number: it's derived from the top 5 ranking apps (ratings volume, rating velocity, quality, recency, keyword-in-title/subtitle) plus competitor count. Use it to compare keywords relative to each other, not as an absolute probability of ranking.
- **`opportunity`** = `popularity × (100 − difficulty) / 100`. It's a sort key for prioritizing candidates, not a traffic forecast.
- **`rank`** mixes sources: top ~10 comes from the App Store web search page, deeper positions from the iTunes Search API. `null` means not found in the top ~200, not necessarily "unranked forever."
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

Most requests map to exactly one skill. For a full "optimize everything" request, run in this order: `aso-audit` (find the gaps) → `aso-keyword-research` (fill them) → `aso-metadata` (draft and validate) → `aso-tracking` (measure). Confirm the app ID and country (`-c`, default from `aso config`) before running anything if either is ambiguous.
