# aso command reference

Output is JSON when stdout is not a TTY (agents, pipes) and a readable table in a terminal.
Force either with `--json` or `--table`. Errors are JSON on stdout (`{"error":{"code","message","hint"}}`) with a non-zero exit code.

Exit codes: `0` ok · `1` runtime error · `2` usage error · `3` Apple sign-in needed (run `aso login`).

Global flags: `-c, --country <CC>` (storefront, default from config, usually `US`) · `-p, --platform iphone|mac` (default `iphone`; applies to `keywords`, `search`, `track`, `ranks`, `history`) · `--json` · `--table`.

## Setup & auth

| Command | What it does |
| --- | --- |
| `aso setup` | Three-step first run: Apple ID (password saved to the macOS Keychain) and sign-in, pick your app from the apps linked to your Apple Ads account, default country. |
| `aso login [--manual] [--timeout 300] [--no-trust]` | Opens Chrome, signs in to Apple Ads with the Keychain credentials, auto-reads the macOS 2FA prompt when possible, finds the Apple Ads org that can read popularity and an app to query with (automatic, even with several orgs), saves the session to `~/.aso/session.json`. `--manual` = you type everything. |
| `aso status` | Config, session age, a live check of Apple Ads access, and `next` steps when something is missing. |
| `aso config [key] [value]` | Show/set config (`appId`, `country`, `appleId`, `autoLogin`). `orgId` is detected by `aso login`; set it only to force a specific Apple Ads org. |

Popularity needs an Apple Ads session. Everything else (search, ranks, difficulty, app lookup, lint) works without one; `popularity` is then `null`.
When a session has expired and credentials are in the Keychain, `aso` re-runs the login automatically once (disable with `--no-login` or `aso config autoLogin false`).

## Research

| Command | What it does |
| --- | --- |
| `aso keywords <terms…> [--app <id>] [--min-popularity n] [--max-difficulty n] [--fresh]` | For each term (comma-separated or separate args, max 100): Apple Ads popularity (5–100), difficulty (1–100), `opportunity`, number of competing apps, top 5 apps, and your app's rank (`--app`, defaults to config `appId`). Saves a snapshot to history. Popularity is cached 24h unless `--fresh`. Terms Apple floors at 5 are re-checked once via recommendations (often returns the real value). Filtered terms are listed in `filteredOut` with a reason. |
| `aso suggest <seed> [--limit 50]` | Keyword ideas: Apple Ads recommendations (with popularity) + App Store autocomplete, in the seed's script. |
| `aso search <term> [--limit 20]` | Live App Store results for a term: rank, app id, name, subtitle, developer, rating, rating count, release/update dates. |
| `aso app <appId> [--lang en-US]` | Public listing: name, subtitle, developer, rating, ratings, version, genres, description, supported languages. Saves an app snapshot. |

Key output fields for `aso keywords`:

```json
{
  "country": "US",
  "appId": "123456789",
  "items": [
    {
      "keyword": "white noise",
      "popularity": 58,
      "popularityFloor": false,
      "difficulty": 71,
      "opportunity": 17,
      "confidence": "high",
      "brand": false,
      "appCount": 200,
      "rank": 34,
      "topApps": [{ "rank": 1, "id": "1083248251", "name": "…", "subtitle": "…", "ratingCount": 208000, "rating": 4.8 }]
    }
  ],
  "filteredOut": [],
  "warnings": []
}
```

- `popularity` = Apple Search Ads popularity, 5–100. `5` is Apple's floor ("low or unknown"), flagged `popularityFloor: true`.
- `difficulty` = 0–100, higher is harder. The ASOManiac model calibrated against third-party difficulty scores (Pearson r 0.87): competition from the top 10 apps' ratings counts (55%), demand from popularity and autocomplete (10%), market quality from their average rating (35%).
- `confidence` = `high` (10+ competing apps and real popularity), `medium`, or `low`.
- `brand` = `true` when the term is another app's brand (all words are in the #1 app's developer name and it clearly owns the term). Don't target these.
- `opportunity` = `popularity × (100 − difficulty) / 100`, a sort key, not a forecast.
- `rank` = position in Apple's own App Store search order (about 250 deep, unpersonalized iPhone results; `null` = not in the top 250). With `-p mac`: the Mac App Store's exact order for the top ~12 (its web search page), then the iTunes Search API's Mac results, which are close to but not exactly the store order. Popularity is Apple Ads data and is the same for both platforms.

## Tracking & history (local SQLite at `~/.aso/aso.db`)

| Command | What it does |
| --- | --- |
| `aso track add <appId> <terms…>` | Track keywords for an app in the current country. |
| `aso track rm <appId> <terms…>` | Stop tracking. |
| `aso track list [appId]` | Show tracked keywords. |
| `aso track run [appId]` | Refresh popularity, difficulty and rank for all tracked keywords; appends to history. Good for a daily cron. |
| `aso ranks <appId>` | Latest rank per tracked keyword with change vs the previous check. |
| `aso history <term> [--app <id>] [--days 90]` | Time series of popularity, difficulty and rank for a keyword. |
| `aso log add --app <id> --locale <loc> --field <title\|subtitle\|keywords\|…> --old <v> --new <v> [--note <why>]` | Record a metadata change (for before/after measurement). |
| `aso log list [--app <id>]` | List logged metadata changes. |
| `aso db [sql]` | No args: print the DB path and table list. With SQL: run a read-only query and print rows as JSON. |

## Metadata quality

| Command | What it does |
| --- | --- |
| `aso lint --title <t> --subtitle <s> --keywords <k> [--locale en-US]` | Checks lengths (title and subtitle 30 characters, keyword field 100 UTF-8 bytes), duplicate words across fields, spaces after commas, stop words, plurals, wasted characters, competitor-brand risk list. Returns `pass`, `score`, `issues[]`, `stats`. |
| `aso lint --fastlane <metadata dir>` | Same for every locale folder in a fastlane `metadata/` directory (`name.txt`, `subtitle.txt`, `keywords.txt`). |
| `aso storefronts` | Supported country codes. |

## Errors

Every error has a stable `code`, a `message` and usually a `hint` with the fix.

| Code | Meaning | Fix |
| --- | --- | --- |
| `AUTH_REQUIRED` | Not signed in, or the session expired | `aso login` (automatic when the password is in the Keychain) |
| `NO_APPLE_ADS_ACCOUNT` | The Apple ID has no Apple Ads account | Sign up free at searchads.apple.com (pick United States if your country is missing), then `aso login` |
| `NO_LINKED_APPS` / `ADS_ORG_NOT_LINKED` | Apple Ads can't see any App Store Connect apps | Apple Ads > account menu > Settings > Link Accounts, then `aso login` |
| `BAD_CREDENTIALS` | Apple rejected the saved password | `aso setup` to save the right one, or `aso login --manual` |
| `LOGIN_TIMEOUT` / `BROWSER_CLOSED` | Sign-in didn't finish | `aso login` again (`--timeout 600` for more time) |
| `NO_BROWSER` | Chrome not found | Install Google Chrome or run `npx playwright install chromium` |
| `APPLE_ADS_RATE_LIMITED` | Too many popularity requests | Wait a few minutes; popularity is cached for 24h |
| `NETWORK_ERROR` / `APP_STORE_UNAVAILABLE` | Offline, or Apple isn't answering | Check the connection and retry |
| `APP_NOT_FOUND` | No app with that id in that country | Use the number after `/id` in the App Store URL, or another `-c` |
| `BAD_COUNTRY` | Unknown storefront code | `aso storefronts` |
| `CLI_USAGE_ERROR` / `SQL_ERROR` | Wrong arguments or query | The hint shows the right form |
