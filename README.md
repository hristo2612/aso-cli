<p align="center">
  <img src="https://raw.githubusercontent.com/hristo2612/aso-cli/main/assets/banner.webp" alt="ASO CLI" width="100%">
</p>

# ASO CLI 📈

<p align="center">
  <a href="https://github.com/hristo2612/aso-cli#install">Install</a> | <a href="https://github.com/hristo2612/aso-cli/blob/main/docs/COMMANDS.md">Commands</a> | <a href="https://github.com/hristo2612/aso-cli#skills">Agent Skills</a>
</p>

<p align="center">
  <a href="https://github.com/hristo2612/aso-cli/blob/main/docs/COMMANDS.md"><img src="https://img.shields.io/badge/docs-commands-00e5e5?style=for-the-badge&labelColor=555" alt="Docs"></a>
  <a href="https://www.npmjs.com/package/aso-kit"><img src="https://img.shields.io/npm/v/aso-kit?style=for-the-badge&label=npm&labelColor=555&color=cb3837" alt="npm"></a>
  <a href="https://skills.sh"><img src="https://img.shields.io/badge/skills-skills.sh-7c3aed?style=for-the-badge&labelColor=555" alt="Skills"></a>
  <a href="https://github.com/hristo2612/aso-cli/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-4c1?style=for-the-badge&labelColor=555" alt="License"></a>
  <a href="https://github.com/hristo2612"><img src="https://img.shields.io/badge/built%20by-hristo2612-0a7ea4?style=for-the-badge&labelColor=555" alt="Built by"></a>
</p>
<p align="center">
  <a href="https://github.com/hristo2612/aso-cli/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/hristo2612/aso-cli/ci.yml?branch=main&style=for-the-badge&label=ci&labelColor=555" alt="CI"></a>
  <img src="https://img.shields.io/badge/node-22.13%2B-339933?style=for-the-badge&labelColor=555" alt="Node 22.13+">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-6e7781?style=for-the-badge&labelColor=555" alt="Platform">
</p>

**Free App Store Optimization for you and your AI agent.** Real Apple Search Ads popularity, keyword difficulty, live App Store ranks, and a local history of all of it. Your agent signs in to Apple on its own (Keychain plus automatic 2FA), so it can research keywords, write metadata and track rankings while you build your app.

No account, no server, no telemetry, no subscription. One install and `aso setup`.

<table>
  <tr><td><b>Real Apple data</b></td><td>Popularity straight from Apple Search Ads (with a re-check for terms Apple floors at 5), difficulty from the apps you'd have to beat, and your live rank in App Store search. 55+ storefronts.</td></tr>
  <tr><td><b>Signs in by itself</b></td><td>Chrome plus your macOS Keychain plus the system 2FA prompt. Expired sessions refresh automatically, even mid-task.</td></tr>
  <tr><td><b>Remembers everything</b></td><td>Every lookup lands in a local SQLite file. Rank tracking, keyword history, a metadata change log, and raw SQL when you want it.</td></tr>
  <tr><td><b>Ships clean metadata</b></td><td><code>aso lint</code> catches duplicate words, wasted characters, stop words, plurals and trademark risks, for one locale or a whole fastlane metadata folder.</td></tr>
  <tr><td><b>Built for agents</b></td><td>JSON when piped, stable exit codes, and 8 ASO skills for Claude Code, Codex, Cursor and more.</td></tr>
  <tr><td><b>Small and free</b></td><td>MIT licensed, plain Node, one dependency, nothing leaves your machine except requests to Apple.</td></tr>
</table>

## Install

Needs Node.js 22.13+.

```bash
npm i -g hristo2612/aso-cli && aso setup
```

Try it without installing:

```bash
npx hristo2612/aso-cli search "habit tracker"
```

Give your agent the ASO skills:

```bash
npx skills add hristo2612/aso-cli
```

<details>
<summary>Other ways to install</summary>

From the npm registry (same package, published as <code>aso-kit</code>):

```bash
npm i -g aso-kit
```

One line that checks Node, installs the CLI and offers the skills:

```bash
curl -fsSL https://raw.githubusercontent.com/hristo2612/aso-cli/main/install.sh | bash
```

</details>

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

That's all. `aso login` finds the Apple Ads org that can read popularity and the apps linked to it by itself, even if your account has several orgs.

Everything except popularity (search, ranks, difficulty, lint, history) works without Apple Ads.

**How sign-in works:** `aso login` opens your installed Chrome with a dedicated profile (`~/.aso/browser`). It fills your Apple ID from the Keychain and, on macOS, reads the verification code from the system "Apple Account Verification" prompt. That needs Accessibility permission for your terminal; otherwise you type the code yourself. Only the Apple Ads session cookies are saved, to `~/.aso/session.json` (mode 600). Apple Ads sessions last about an hour; when one expires, `aso` signs in again on its own, invisibly in the background, and only opens Chrome if Apple needs you (`aso config autoLogin false` turns this off). On Linux, set `ASO_APPLE_PASSWORD` instead of using the Keychain.

## If setup gets stuck

| You see | Do this |
| --- | --- |
| `NO_APPLE_ADS_ACCOUNT` | Create a free Apple Ads account at [searchads.apple.com](https://searchads.apple.com) with the same Apple ID (pick United States if your country is missing), then `aso login`. |
| `NO_LINKED_APPS` | In Apple Ads: account menu > Settings > Link Accounts, link App Store Connect, then `aso login`. |
| `BAD_CREDENTIALS` | `aso setup` to save the right password, or `aso login --manual`. |
| 2FA code isn't filled in | Allow your terminal in System Settings > Privacy & Security > Accessibility, or type the code in the browser (or the terminal). |
| Popularity is 5 for many terms | Normal: Apple reports low-volume terms as 5. |
| Anything else | `aso status` says what's missing and what to run next. Full error list in [docs/COMMANDS.md](https://github.com/hristo2612/aso-cli/blob/main/docs/COMMANDS.md#errors). |

## What the numbers mean

| Field | Meaning |
| --- | --- |
| `popularity` | Apple Search Ads popularity, 5–100. Apple reports low-volume terms as `5`; `aso` re-checks those through recommendations, which often return the real value. |
| `difficulty` | 0–100, higher is harder. Our ASOManiac model, calibrated against third-party difficulty scores (Pearson r 0.87): competition from the top 10 apps' ratings (55%), demand (10%), their average rating (35%). |
| `brand` | `true` when the term is another app's brand name, like "spotify". Skip those. |
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
| `aso-localization` | New markets, native keywords, cross-locale indexing, seasonal keywords |
| `aso-conversion` | Icon, screenshots, preview video, custom product pages, in-app events |

`aso` never uploads metadata. Ship changes with fastlane `deliver` or App Store Connect.

## Notes

- The Apple Ads popularity endpoints are the private API behind the Apple Ads dashboard. They're unofficial and can change. `aso` limits itself to about one request per second.
- Thanks to [semihcihan/App-Store-Optimization-CLI](https://github.com/semihcihan/App-Store-Optimization-CLI) (MIT) for the App Store search parsing approach and brand-keyword detection.

## Development

```bash
git clone https://github.com/hristo2612/aso-cli && cd aso-cli && npm install
npm test
node bin/aso.js --help
ASO_HOME=/tmp/aso-dev node bin/aso.js status   # isolated config/db
```

Releasing: bump `version` in `package.json` (`npm version patch`) and push to `main`. GitHub Actions publishes to npm via trusted publishing and creates the GitHub release.

No build step: plain Node ESM, SQLite via the built-in `node:sqlite`, and one dependency (`playwright-core`, used only for sign-in).
