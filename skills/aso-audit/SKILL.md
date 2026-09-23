---
name: aso-audit
description: Use for a full App Store Optimization health check or report card on an existing app listing with the `aso` CLI, when the ask is "how healthy is my listing overall" rather than one specific fix. Trigger on "audit my ASO", "how is my app doing", "review my app store listing", "ASO health check", "what's wrong with my listing", or "give me a report card", even if the user is vague about what exactly to check. Grades metadata utilization, keyword coverage and ranks, ratings vs competitors, localization coverage, and conversion assets on an A-F scale, each dimension backed by a number from `aso app`, `aso keywords`, `aso lint`, and `aso search`, never a guess.
---

# ASO Audit

Produce a data-backed report card, not an opinion. Every grade must trace back to a number from the CLI, and every dimension you can't measure gets marked unknown instead of guessed at. Preflight: see the `aso` router skill.

## Iron law

**Grade on data, not impressions.** "Your keywords look fine" is not an audit finding. A grade needs a metric behind it: a lint score, a rank, a rating count, a character count. If you don't have the metric, the dimension is "unknown," not a guessed grade.

## Intake

1. App ID (required), primary storefront (default US)
2. Additional storefronts to check? (locale coverage dimension needs this)
3. 1-3 competitor app IDs for the ratings/rank comparison (ask, or derive via `aso-competitors`'s Step 1)

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

Before grading title/subtitle/conversion, place the app in a rough tier (Dominant, Established, or Challenger) by its own `ratingCount` from `aso app` and the category norm from the competitor pulls, so a household name's brand-only title isn't penalized as if it were a weak, keyword-empty one. Exact tier signals and grading implications are in `references/grading-rubrics.md`, open it now.

## Step 3: Grade five dimensions (A-F)

Grade each of these against the exact A-F criteria in `references/grading-rubrics.md` (read it before assigning any letter): metadata utilization (from `aso lint`'s `score`/`issues[]`, read through the brand-maturity tier), keyword coverage & ranks (from `aso keywords --app`, excluding `brand: true` terms), ratings vs competitors (from `aso app` on you and 1-3 competitors, plus the ratings/reviews practice sub-check), localization coverage (from `aso lint --fastlane` or a manual locale check), and conversion assets (qualitative, presence and freshness only, using `aso-conversion`'s checklist).

## Step 4: Overall grade

Weight roughly: metadata utilization 30%, keyword coverage 30%, ratings vs competitors 15%, localization 15%, conversion assets 10%. Map A=4...F=0, weighted average, then back to a letter.

**Mark unknown, don't redistribute weight.** If a dimension can't be graded (no competitor IDs, no fastlane tree, nothing to show for conversion assets), mark it "unknown" and say so. Don't quietly drop its weight and rescale the rest, that inflates the grade with an unearned average.

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
Priority 3: fill 3-5 additional indexed locales (see aso-localization), biggest single lever, currently untouched.
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
