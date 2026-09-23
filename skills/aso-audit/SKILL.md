---
name: aso-audit
description: Use for a full App Store Optimization health check of an app listing with the `aso` CLI. Triggers on "audit my ASO", "how is my app doing?", "review my app store listing", "ASO health check", "what's wrong with my listing?". Grades metadata utilization, keyword coverage, ratings vs competitors, localization coverage, and conversion assets A-F, using `aso app`, `aso keywords`, `aso lint`, and `aso search`.
---

# ASO Audit

Produce a data-backed report card, not an opinion. Every grade must trace back to a number from the CLI, and every dimension you can't measure gets marked unknown instead of guessed at. Preflight: see the `aso` router skill.

## Iron law

**Grade on data, not impressions.** "Your keywords look fine" is not an audit finding. A grade needs a metric behind it: a lint score, a rank, a rating count, a character count. If you don't have the metric, the dimension is "unknown," not a guessed grade.

## Intake

1. App ID (required), primary storefront (default US)
2. Additional storefronts to check? (locale coverage dimension needs this)
3. 1–3 competitor app IDs for the ratings/rank comparison (ask, or derive via `aso-competitors`'s Step 1)

## Step 1: Gather data

```bash
aso app <appId> --lang en-US
aso lint --title "<current title>" --subtitle "<current subtitle>" --keywords "<current keywords>" --locale en-US
aso keywords <current keyword list + shortlist candidates> --app <appId> -c US
aso search "<core keyword>" --limit 20 -c US
```

If the project has a fastlane `metadata/` tree with multiple locale folders, also run:

```bash
aso lint --fastlane <metadata dir>
```

## Step 2: Set the brand-maturity tier first

Before grading title/subtitle/conversion, place the app in a rough tier by its own `ratingCount` from `aso app` (and the category norm from the competitor pulls), so a household name's brand-only title isn't penalized as if it were a weak, keyword-empty one. Treat bands as rough and category-relative, not fixed cutoffs: a dominant fitness app and a dominant utility app don't share a ratings count.

| Tier | Rough signal | Grading implication |
|---|---|---|
| Dominant | Very large ratings count, a recognizable brand name on its own | A brand-only title/subtitle is fine, don't dock it for "missing keywords" |
| Established | Solid, category-typical ratings count | Expect a mix of brand and functional/benefit keywords |
| Challenger | Small or new, ratings count well below category norm | Title/subtitle should work hard for keywords; brand alone can't carry search |

## Step 3: Grade five dimensions (A–F)

### 1. Metadata utilization
Driven directly by `aso lint`'s `score` and `issues[]`. Read the title/subtitle grade through the brand-maturity tier from Step 2: a Dominant app's brand-forward title is not itself an issue.

| Grade | Criteria |
|---|---|
| A | Lint passes, score in top band, 0 issues |
| B | Passes, 1 minor issue (e.g. a few chars/bytes unused) |
| C | Passes with warnings: noticeable wasted characters or a weak subtitle |
| D | Fails lint, several issues |
| F | Fails badly: empty/near-empty keywords field, duplicate words across fields |

### 2. Keyword coverage & ranks
From `aso keywords --app`. Exclude any `brand: true` terms from this count, they're not this app's keyword opportunity.

| Grade | Criteria |
|---|---|
| A | Ranked (non-null) for most tracked/candidate keywords, several top 10 |
| B | Ranked for most, mostly top 25–50 |
| C | Ranked for about half, mostly top 100 |
| D | Ranked for a minority, mostly deep or null |
| F | Null rank for nearly everything checked |

### 3. Ratings vs competitors
From `aso app` (your `rating`/`ratingCount`) vs the same for 1–3 competitors (`aso app <competitorId>`).

| Grade | Criteria |
|---|---|
| A | Rating ≥ competitors' and ratings count same order of magnitude or higher |
| B | Rating comparable, ratings count somewhat behind |
| C | Rating slightly below competitors, or ratings count an order of magnitude behind |
| D | Rating clearly below competitors |
| F | Very low rating or count relative to the category |

Note ratings and ASO are independent signals: this dimension measures competitive standing, not ASO effort, but low authority caps how aggressive a keyword strategy can be (see the difficulty ceiling table in `aso-keyword-research`).

**Ratings & reviews practice sub-check** (qualitative, ask the user or check what's live): review-prompt timing (fire only after a positive value moment, never on first launch/onboarding/error/crash; iOS caps the native prompt at 3 per user per 365 days) and negative-review response speed (within 24-48h, HEAR method). Full detail in `references/limitations-and-play.md`.

### 4. Localization coverage
From `aso lint --fastlane` output across locale folders, or a manual locale-by-locale check if no fastlane project exists.

| Grade | Criteria |
|---|---|
| A | Most locales the storefront indexes are filled, each with distinct (not copy-pasted) keywords |
| B | Majority filled |
| C | A few extra locales beyond primary |
| D | One or two locales only |
| F | Only the primary locale filled |

See `aso-localization` for which locales a storefront indexes and how to fill them, and for the 100-byte (not character) keywords-field limit that squeezes CJK/Arabic locales harder.

### 5. Conversion assets (qualitative)
`aso` has no data for icon/screenshot/video quality: grade this qualitatively based on what the user shares, or what's visible in `aso app`'s fields. Use `aso-conversion` for the full icon/screenshot/CPP/PPO/In-App-Events playbook; here, just check presence and freshness:

- Does the description open with a clear value statement (not a feature dump)?
- Do screenshots (if reviewed) lead with benefit-led headlines in a sensible order?
- Is the icon distinctive at thumbnail size (ask the user or view it)?

**Conversion-signals sub-check** (presence, not quality, each a yes/no/unknown): promotional text in use for something timely, What's New reads as a current-version benefit statement (not generic "bug fixes"), In-App Events configured where the app has event-worthy moments, Custom Product Pages present where distinct audiences or campaigns would benefit.

Flag this whole dimension explicitly as qualitative/judgment-based, unlike the other four.

## Step 4: Overall grade

Weight roughly: metadata utilization 30%, keyword coverage 30%, ratings vs competitors 15%, localization 15%, conversion assets 10%. Map A=4…F=0, weighted average, then back to a letter.

**Mark unknown, don't redistribute weight.** If a dimension can't be graded (no competitor IDs, no fastlane tree, nothing to show for conversion assets), mark it "unknown" and say so. Don't quietly drop its weight and rescale the rest, that inflates the grade with an unearned average; state the grade as computed from what's known, and note how many dimensions were unknown.

## Step 5: Prioritized action items

Sort by impact ÷ effort. Quick wins first (lint-flagged character/byte waste, duplicate words), then keyword gaps (hand off to `aso-keyword-research`/`aso-competitors`), then locale expansion (hand off to `aso-localization`), then conversion-asset fixes (hand off to `aso-conversion`), then a re-audit date (4 weeks out).

## Output: report card

```
ASO AUDIT: AppName (123456789), US
Brand-maturity tier: Challenger (1.2k ratings, category norm is tens of thousands)
Overall: B (2.9/4.0, all 5 dimensions graded)

  Metadata utilization:     C  (lint score 72/100, keywords field 72/100 bytes)
  Keyword coverage & ranks: B  (ranked for 8/15 tracked terms, 3 in top 25)
  Ratings vs competitors:   B  (4.6★/1.2k vs Ring 4.7★/48k, rating fine, authority far behind)
  Localization coverage:    F  (only en-US filled)
  Conversion assets:        B  (qualitative; What's New is generic "bug fixes", promo text unused)

Priority 1 (quick wins): fill keywords field to 95+ bytes per aso lint; dedupe "camera" across title/keywords.
Priority 2: close 3 competitor keyword gaps (see aso-competitors), projected +opportunity X.
Priority 3: fill 3–5 additional indexed locales (see aso-localization), biggest single lever, currently untouched.
Priority 4: write a benefit-led What's New and put a live promo for the current push (see aso-conversion).
Re-audit in 4 weeks after changes settle.
```

## Limitations, and Google Play (mental model only)

State plainly, don't let the report card imply more certainty than the CLI has: no true search volume (popularity is an Apple Ads proxy), no true conversion rate (no App Store Connect analytics access), no live PPO/CPP results (any such recommendation is a suggestion to test, not a measured outcome), difficulty/opportunity are relative models, not guarantees. `aso` is Apple-only; if the user also has an Android app, Google Play differs (full description indexing, stricter title rules, cumulative ratings, native store listing experiments), full detail in `references/limitations-and-play.md`.

## Red flags

- Grading without running `aso lint` first.
- Skipping the brand-maturity tier and penalizing a Dominant app's brand-only title as if it were a Challenger's weak one.
- Skipping localization coverage: usually the single biggest missed opportunity.
- Giving a grade with no number behind it.
- Redistributing weight away from a dimension you couldn't measure instead of marking it unknown.
- Treating a good rating as proof ASO is fine: they're independent.
