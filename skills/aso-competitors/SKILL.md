---
name: aso-competitors
description: Use to analyze specific App Store competitors, compare listings side by side, or find keyword gaps between your app and named rival apps with the `aso` CLI. Trigger on "who are my competitors", "compare my app to X", "what keywords does Ring or Headspace rank for that I don't", or "keyword gap analysis", even if the user only names one competitor. Finds competitors via `aso search`, pulls their listings with `aso app`, and diffs keyword coverage against your app into quick-win, defend, battleground, aspirational, and ignore buckets. Not for general keyword brainstorming with no specific competitor in view, use `aso-keyword-research` for that.
---

# ASO Competitor Analysis

Find keyword gaps and ranking opportunities by looking at who already ranks: not to copy them, but to find what they've validated that you haven't targeted yet.

Preflight: see the `aso` router skill.

## Iron law

**This is gap analysis, not copying.** The #1 app for a term already owns it: chasing it head-on is expensive. The value is in terms *they* rank for that you don't, and terms where you can realistically outrank a specific competitor, not the whole field.

## Step 1: Identify competitors

If the user already named competitor apps, get their app IDs. If not, find them from your own keyword data or a live search:

```bash
aso search "<core keyword>" --limit 20 -c US
aso keywords "<core keyword>" --app <yourAppId> -c US   # topApps in the result are candidate competitors
```

Pick 2-3 competitors that are: similar in function (not just category), comparable in scale (comparing a 100-review app to a 500k-review one is noise), and actively maintained.

## Step 2: Pull their listings

```bash
aso app <competitorAppId> --lang en-US
```

Gives name, subtitle, developer, rating, ratings count, version, genres, description, supported languages. Extract every word from their **title** and **subtitle**: these are the keywords they've committed real estate to.

## Step 3: Keyword-gap analysis

Build the word list from each competitor's title + subtitle, then score the gap terms against your own app:

```bash
aso keywords <competitor_title_words> <competitor_subtitle_words> --app <yourAppId> -c US
```

This returns popularity, difficulty, opportunity, and (because you passed `--app`) your current rank for each term. A `null` rank with the competitor visibly ranking is your gap.

Build the matrix:

```
| Keyword          | Your rank | Competitor rank (from aso search) | Pop | Diff | Opportunity |
|-------------------|-----------|-------------------------------------|-----|------|-------------|
| security camera   | 45        | 12                                   | 62  | 78   | 13.6        |
| baby cam          | -         | 5                                     | 44  | 18   | 36.1        |
```

Get the competitor's actual position for a term with `aso search "<term>" --limit 20` and locate their app ID in the results.

## Step 4: Categorize

| Bucket | Condition | Action |
|---|---|---|
| Quick win | Competitor ranks, you don't; difficulty low relative to your app's authority (see the ceiling table in `aso-keyword-research`) | Add now |
| Defend | You outrank all watched competitors | Keep, monitor via `aso-tracking` |
| Battleground | Both rank, close positions, decent popularity | Consider promoting to title/subtitle |
| Aspirational | Competitor ranks well, but difficulty is well above your app's realistic ceiling | Backlog, revisit after ratings grow |
| Ignore | Low popularity and low relevance | Skip |

## Step 5: Present and hand off

```
COMPETITIVE KEYWORD ANALYSIS: You vs Ring (ID 987654321)

QUICK WINS:
| Keyword    | Their rank | Pop | Diff | Opportunity |
|------------|-----------|-----|------|-------------|
| baby cam   | 5         | 44  | 18   | 36.1        |
| nanny cam  | 34        | 35  | 15   | 29.8        |
```

For quick wins, hand off to `aso-metadata` to actually fit them into title/subtitle/keywords and lint the result: don't edit metadata directly from this skill.

## Step 6: Ongoing monitoring

Gap analysis is a snapshot; competitors keep moving. Set up a weekly or biweekly check as a standing complement to any one-off analysis, not a replacement for it:

```bash
aso app <competitorAppId> --lang en-US   # re-pull title, subtitle, description, rating, ratingCount
```

Diff against the last pull for: title/subtitle/description text changes (a competitor adding a term is a signal that term is working for them), and rating/ratingCount deltas (a sudden jump in ratings velocity often precedes or follows their own metadata or feature push). Log anything material and revisit the gap matrix if their metadata shifted meaningfully.

## Rules

- **Never suggest adding a competitor's brand name as a keyword.** It risks App Review rejection and gains nothing Apple's algorithm rewards. `aso lint` flags competitor-brand risk: trust it.
- Don't chase difficulty far above what the app's ratings count can realistically win (see `aso-keyword-research`'s ceiling table) just because a competitor ranks there.
- 2-3 competitors give a cleaner signal than a long list: more just adds noise.
- Re-run the full gap analysis after shipping quick-win keywords (2-4 weeks later, via `aso-tracking`) to confirm the gap actually closed.
