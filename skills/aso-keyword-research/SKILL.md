---
name: aso-keyword-research
description: Use to find, discover, brainstorm, or expand App Store keywords for an iOS/macOS app with the `aso` CLI. Triggers on "what keywords should I target?", "help me find keywords", "keyword research for my app", "long-tail keywords for a new app". Produces a ranked, scored keyword shortlist and a recommended token set, not a metadata draft (see aso-metadata for that).
---

# ASO Keyword Research

Find keywords the app can realistically win, backed by `aso` data: never gut feel.

Preflight: see the `aso` router skill (CLI installed, session status). Popularity needs a session; difficulty/rank/opportunity work without one.

## Iron law

**Never shortlist a keyword without running it through `aso keywords`.** Popularity and difficulty come from the CLI, not intuition.

## Step 1: Seed keywords

Brainstorm 10–20 seeds across categories, not just the obvious core term:

| Category | Example (a security-camera app) |
|---|---|
| Core function | security camera, home monitor |
| User intent / job-to-be-done | watch home, check on baby |
| Adjacent category | baby monitor, pet camera, nanny cam |
| Problem solved | package theft, break-in |
| Feature | motion detection, night vision |

## Step 2: Expand each seed

```bash
aso suggest "<seed>" --limit 50 -c US
```

Returns Apple Ads recommendations (with popularity) plus App Store autocomplete ideas. Run this for your top 3–5 seeds; pool and dedupe the results.

## Step 3: Score in batches

```bash
aso keywords <term1> <term2> ... <termN> --app <appId> -c US
```

Max 100 terms per call: chunk the pooled candidate list into batches of ≤100. Passing `--app` also returns your current rank per keyword, so you see baseline position, not just opportunity. Popularity is cached 24h; add `--fresh` if you need a live re-pull (e.g. right after a metadata change).

Each result gives `popularity` (5–100, `5` = Apple's floor, flagged `popularityFloor`), `difficulty` (1–100), `opportunity = popularity × (100 − difficulty) / 100`, `appCount`, `topApps`, and your `rank`.

## Step 4: Shortlist (relevance first, then opportunity)

1. **Cut anything irrelevant to the app**, no matter how good the score: an off-topic keyword that ranks well converts nobody and can hurt review signals.
2. Within the relevant set, sort by `opportunity` descending.
3. Watch the popularity/difficulty shape, not just the composite score:

| Popularity | Difficulty | Read |
|---|---|---|
| High | High | Trap: big number, you likely can't crack top 10 |
| High | Low | Best case: rare, grab it |
| Moderate | Low | Bread and butter: most of your shortlist should live here |
| Low (incl. floored `5`) | Low | Long-tail: cheap to win, worth it in volume |

## Long-tail strategy for new / small apps

An app with few ratings can't out-authority a competitor with 50k+ reviews on a `difficulty 80` keyword, no matter the popularity. Calibrate the difficulty ceiling to the app's own ratings count:

| App's rating count | Realistic difficulty ceiling | Focus |
|---|---|---|
| < 100 | ≤ 30 | Long-tail, multi-word phrases, low-competition niches |
| 100–1,000 | ≤ 50 | Mix of long-tail + a few moderate battles |
| 1,000–10,000 | ≤ 70 | Broader mid-competition terms, start contesting category leaders |
| 10,000+ | No hard ceiling | Compete on head terms, but still mind opportunity |

Bias new/small apps toward **more, narrower** keywords (3+ word phrases) over fewer broad ones: you win by being unambiguously the best answer to a specific query before you can compete on a generic one.

## Step 5: Output

Ranked table, sorted by opportunity, relevant-only:

```
| # | Keyword          | Pop | Diff | Opportunity | Your rank | Verdict |
|---|-------------------|-----|------|-------------|-----------|---------|
| 1 | baby cam          | 44  | 18   | 36.1        | -         | title/subtitle candidate |
| 2 | nanny cam         | 35  | 15   | 29.8        | 34        | keywords field |
| 3 | discreet camera   | 5*  | 22   | 3.9         | -         | long-tail, monitor only |
```
(`*` = popularity floor, treat as "no signal" not "dead")

Close with:
1. **Top 10–15 by opportunity**: the candidate pool.
2. **Recommended token set**: which terms are strong enough for title (1–2), subtitle (2–4), and keywords field (remaining, packed toward 100 chars), token-level, not a finished draft. Hand off to `aso-metadata` to actually assemble and lint the fields.
3. **Watchlist**: relevant but currently too competitive for this app's authority, revisit after ratings grow.
