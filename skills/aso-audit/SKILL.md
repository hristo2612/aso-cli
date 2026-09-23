---
name: aso-audit
description: Use for a full App Store Optimization health check of an app listing with the `aso` CLI. Triggers on "audit my ASO", "how is my app doing?", "review my app store listing", "ASO health check", "what's wrong with my listing?". Grades metadata utilization, keyword coverage, ratings vs competitors, localization coverage, and conversion assets A-F, using `aso app`, `aso keywords`, `aso lint`, and `aso search`.
---

# ASO Audit

Produce a data-backed report card, not an opinion. Every grade must trace back to a number from the CLI.

Preflight: see the `aso` router skill.

## Iron law

**Grade on data, not impressions.** "Your keywords look fine" is not an audit finding. A grade needs a metric behind it: a lint score, a rank, a rating count, a character count.

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

## Step 2: Grade five dimensions (A–F)

### 1. Metadata utilization
Driven directly by `aso lint`'s `score` and `issues[]`.

| Grade | Criteria |
|---|---|
| A | Lint passes, score in top band, 0 issues |
| B | Passes, 1 minor issue (e.g. a few chars unused) |
| C | Passes with warnings: noticeable wasted characters or a weak subtitle |
| D | Fails lint, several issues |
| F | Fails badly: empty/near-empty keywords field, duplicate words across fields |

### 2. Keyword coverage & ranks
From `aso keywords --app`.

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

### 4. Localization coverage
From `aso lint --fastlane` output across locale folders, or a manual locale-by-locale check if no fastlane project exists.

| Grade | Criteria |
|---|---|
| A | Most locales the storefront indexes are filled, each with distinct (not copy-pasted) keywords |
| B | Majority filled |
| C | A few extra locales beyond primary |
| D | One or two locales only |
| F | Only the primary locale filled |

See `aso-localization` for which locales a storefront indexes and how to fill them.

### 5. Conversion assets (qualitative)
`aso` has no data for icon/screenshots/description quality: grade this qualitatively based on what the user shares or what's visible in `aso app`'s description field:

- Does the description open with a clear value statement (not a feature dump)?
- Do screenshots (if reviewed) lead with benefit-led captions in a sensible order?
- Is the icon distinctive at thumbnail size (ask the user or view it)?

Flag this dimension explicitly as qualitative/judgment-based, unlike the other four.

## Step 3: Overall grade

Weight roughly: metadata utilization 30%, keyword coverage 30%, ratings vs competitors 15%, localization 15%, conversion assets 10% (adjust down the qualitative weight if you have little to go on). Map A=4…F=0, weighted average, then back to a letter.

## Step 4: Prioritized action items

Sort by impact ÷ effort. Quick wins first (lint-flagged character waste, duplicate words), then keyword gaps (hand off to `aso-keyword-research`/`aso-competitors`), then locale expansion (hand off to `aso-localization`), then a re-audit date (4 weeks out).

## Output: report card

```
ASO AUDIT: AppName (123456789), US
Overall: B (2.9/4.0)

  Metadata utilization:     C  (lint score 72/100, keywords field 72/100 chars)
  Keyword coverage & ranks: B  (ranked for 8/15 tracked terms, 3 in top 25)
  Ratings vs competitors:   B  (4.6★/1.2k vs Ring 4.7★/48k, rating fine, authority far behind)
  Localization coverage:    F  (only en-US filled)
  Conversion assets:        B  (qualitative, description leads with a feature list, not a benefit)

Priority 1 (quick wins): fill keywords field to 95+ chars per aso lint; dedupe "camera" across title/keywords.
Priority 2: close 3 competitor keyword gaps (see aso-competitors), projected +opportunity X.
Priority 3: fill 3–5 additional indexed locales (see aso-localization), biggest single lever, currently untouched.
Re-audit in 4 weeks after changes settle.
```

## Red flags

- Grading without running `aso lint` first.
- Skipping localization coverage: usually the single biggest missed opportunity.
- Giving a grade with no number behind it.
- Treating a good rating as proof ASO is fine: they're independent.
