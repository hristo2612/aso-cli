# aso-cli

Free, local App Store Optimization for you and your AI agent.

- **Keyword research**: Apple Search Ads popularity, difficulty, opportunity, top competitors, and your rank, in one command.
- **Ideas**: Apple Ads keyword recommendations plus App Store autocomplete.
- **History**: every lookup lands in a local SQLite file (`~/.aso/aso.db`). Track ranks daily and see what moved.
- **Metadata linter**: catches wasted characters, duplicate words, stop words and plurals before you ship.
- **Automatic Apple sign-in**: uses your Apple ID from the macOS Keychain and reads the 2FA code from the macOS prompt, so your agent can refresh the session on its own.
- **Agent skills**: 7 ASO playbooks (research, metadata, competitors, audit, tracking, localization) for Claude Code, Codex, Cursor and others.

No account, no server, no telemetry. MIT.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/hristo2612/aso-cli/main/install.sh | bash
```

Or step by step (Node.js 22.13+):

```bash
npm i -g @hristo2612/aso-cli                    # the `aso` command
npx skills add hristo2612/aso-cli  # optional: agent skills
aso setup                          # Apple ID → Keychain, your app, sign in
```

## Quick start

```bash
aso keywords "white noise,sleep sounds,rain sounds"   # popularity, difficulty, rank
aso suggest meditation                                 # keyword ideas
aso search "habit tracker"                             # who ranks right now
aso app 1083248251                                     # any app's public listing
aso lint --title "Lumen: Sleep Sounds" --subtitle "White noise & rain" --keywords "fan,ocean,storm"
```

Track rankings over time:

```bash
aso track add 1234567890 "white noise,sleep sounds"
aso track run                  # add to cron: 0 9 * * * aso track run --json >> ~/.aso/track.log 2>&1
aso ranks 1234567890           # rank, change since last check, popularity, difficulty
aso history "white noise" --app 1234567890
```

With the skills installed, just ask your agent: *"Do a full ASO audit of my app 1234567890 and propose a new subtitle and keyword field."*

## Apple Ads (for popularity)

Popularity scores come from Apple Search Ads. You need an Apple ID that can open [app-ads.apple.com](https://app-ads.apple.com):

1. Sign up at [searchads.apple.com](https://searchads.apple.com) (free, no campaign or billing required).
2. Link your App Store Connect account: Apple Ads → account menu → Settings → Link Accounts.
3. Run `aso setup`.

If your Apple Ads account has several orgs (campaign groups), pick the one that owns your app: `aso config orgId <id>`. The id is the number in `app-ads.apple.com/cm/app/<id>/…`.

Everything except popularity (search, ranks, difficulty, lint, history) works without Apple Ads.

**How sign-in works:** `aso login` opens your installed Chrome with a dedicated profile (`~/.aso/browser`). It fills your Apple ID from the Keychain and, on macOS, reads the verification code from the system "Apple Account Verification" prompt. That needs Accessibility permission for your terminal; otherwise you type the code yourself. Only the Apple Ads session cookies are saved, to `~/.aso/session.json` (mode 600). When the session expires, `aso` signs in again on its own (`aso config autoLogin false` turns that off). On Linux, set `ASO_APPLE_PASSWORD` instead of using the Keychain.

## What the numbers mean

| Field | Meaning |
| --- | --- |
| `popularity` | Apple Search Ads popularity, 5–100. Apple reports low-volume terms as `5`; `aso` re-checks those through recommendations, which often return the real value. |
| `difficulty` | 1–100 estimate from the top 5 apps (ratings, rating velocity, quality, recency, keyword in title/subtitle) and the number of competing apps. |
| `opportunity` | `popularity × (100 − difficulty) / 100`: a sort key, not a forecast. |
| `rank` | Your position in App Store search. The top ~10 come from the App Store web page, deeper positions from the iTunes Search API. `null` means not in the top 200. |

All commands print JSON when piped (for agents) and tables in a terminal. See [docs/COMMANDS.md](docs/COMMANDS.md) for the full reference.

## Skills

| Skill | Use it for |
| --- | --- |
| `aso` | Entry point: preflight, Apple search rules, routing |
| `aso-keyword-research` | Seed → ideas → scored shortlist |
| `aso-metadata` | Title, subtitle, keyword field drafts, linted and logged |
| `aso-competitors` | Who you're up against, keyword gaps |
| `aso-audit` | A–F health check of a listing |
| `aso-tracking` | Rank tracking and before/after measurement |
| `aso-localization` | New markets, native keywords, cross-locale indexing |

`aso` never uploads metadata. Ship changes with fastlane `deliver` or App Store Connect.

## Notes

- The Apple Ads popularity endpoints are the private API behind the Apple Ads dashboard. They're unofficial and can change. `aso` limits itself to about one request per second.
- The difficulty formula is adapted from [semihcihan/App-Store-Optimization-CLI](https://github.com/semihcihan/App-Store-Optimization-CLI) (MIT).

## Development

```bash
git clone https://github.com/hristo2612/aso-cli && cd aso-cli && npm install
npm test
node bin/aso.js --help
ASO_HOME=/tmp/aso-dev node bin/aso.js status   # isolated config/db
```

Releasing: bump `version` in `package.json` (`npm version patch`) and push to `main`. GitHub Actions publishes to npm via trusted publishing and creates the GitHub release.

No build step: plain Node ESM, SQLite via the built-in `node:sqlite`, and one dependency (`playwright-core`, used only for sign-in).
