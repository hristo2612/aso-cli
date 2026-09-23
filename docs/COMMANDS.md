# aso command reference

Output is JSON when stdout is not a TTY (agents, pipes) and a readable table in a terminal.
Force either with `--json` or `--table`. Errors are JSON on stdout (`{"error":{"code","message","hint"}}`) with a non-zero exit code.

Exit codes: `0` ok · `1` runtime error · `2` usage error · `3` Apple sign-in needed (run `aso login`).

Global flags: `-c, --country <CC>` (storefront, default from config, usually `US`) · `--json` · `--table`.

## Setup & auth

| Command | What it does |
| --- | --- |
| `aso setup` | Interactive first-run: Apple ID (password saved to macOS Keychain), your app, default country, then `aso login`. |
| `aso login [--manual] [--timeout 300] [--no-trust]` | Opens Chrome, signs in to Apple Ads with the Keychain credentials, auto-reads the macOS 2FA prompt when possible, saves the session to `~/.aso/session.json`. `--manual` = you type everything. |
| `aso status` | Config, session age, and a live check of Apple Ads access. |
| `aso config [key] [value]` | Show/set config (`appId`, `orgId`, `country`, `appleId`, `autoLogin`). `orgId` picks the Apple Ads org (campaign group) that owns your app when your account has several: it's the number in `app-ads.apple.com/cm/app/<orgId>/…`. |

Popularity needs an Apple Ads session. Everything else (search, ranks, difficulty, app lookup, lint) works without one; `popularity` is then `null`.
When a session has expired and credentials are in the Keychain, `aso` re-runs the login automatically once (disable with `--no-login` or `aso config autoLogin false`).

## Research

| Command | What it does |
| --- | --- |
| `aso keywords <terms…> [--app <id>] [--fresh]` | For each term (comma-separated or separate args, max 100): Apple Ads popularity (5–100), difficulty (1–100), `opportunity`, number of competing apps, top 5 apps, and your app's rank (`--app`, defaults to config `appId`). Saves a snapshot to history. Popularity is cached 24h unless `--fresh`. Terms Apple floors at 5 are re-checked once via recommendations (often returns the real value). |
| `aso suggest <seed> [--limit 50]` | Keyword ideas: Apple Ads recommendations (with popularity) + App Store autocomplete. |
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
      "appCount": 200,
      "rank": 34,
      "topApps": [{ "rank": 1, "id": "1083248251", "name": "…", "subtitle": "…", "ratingCount": 208000, "rating": 4.8 }]
    }
  ],
  "warnings": []
}
```

- `popularity` = Apple Search Ads popularity, 5–100. `5` is Apple's floor ("low or unknown"), flagged `popularityFloor: true`.
- `difficulty` = 1–100 heuristic from the top 5 apps (ratings volume, rating velocity, quality, recency, keyword-in-title/subtitle) and number of competing apps. Higher is harder.
- `opportunity` = `popularity × (100 − difficulty) / 100`, a sort key, not a forecast.
- `rank` = position in App Store search (top ~10 from the App Store web page, deeper from the iTunes Search API; `null` = not in the top 200).

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
| `aso lint --title <t> --subtitle <s> --keywords <k> [--locale en-US]` | Checks lengths (30/30/100), duplicate words across fields, spaces after commas, stop words, plurals, wasted characters, competitor-brand risk list. Returns `pass`, `score`, `issues[]`, `stats`. |
| `aso lint --fastlane <metadata dir>` | Same for every locale folder in a fastlane `metadata/` directory (`name.txt`, `subtitle.txt`, `keywords.txt`). |
| `aso storefronts` | Supported country codes. |
