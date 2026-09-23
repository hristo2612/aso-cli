# Grading rubrics

Open this file when you're ready to assign the actual letter grades in Step 3 and Step 4 of `aso-audit`'s SKILL.md. It has the brand-maturity tiers and the A-F criteria for all five dimensions; the SKILL.md workflow tells you which data to gather first.

## Brand-maturity tier

Set this before grading title/subtitle/conversion, from the app's own `ratingCount` (`aso app`) and the category norm from the competitor pulls, so a household name's brand-only title isn't penalized as if it were a weak, keyword-empty one. Treat bands as rough and category-relative, not fixed cutoffs: a dominant fitness app and a dominant utility app don't share a ratings count.

| Tier | Rough signal | Grading implication |
|---|---|---|
| Dominant | Very large ratings count, a recognizable brand name on its own | A brand-only title/subtitle is fine, don't dock it for "missing keywords" |
| Established | Solid, category-typical ratings count | Expect a mix of brand and functional/benefit keywords |
| Challenger | Small or new, ratings count well below category norm | Title/subtitle should work hard for keywords; brand alone can't carry search |

## 1. Metadata utilization

Driven directly by `aso lint`'s `score` and `issues[]`. Read the title/subtitle grade through the brand-maturity tier above: a Dominant app's brand-forward title is not itself an issue.

| Grade | Criteria |
|---|---|
| A | Lint passes, score in top band, 0 issues |
| B | Passes, 1 minor issue (e.g. a few chars/bytes unused) |
| C | Passes with warnings: noticeable wasted characters or a weak subtitle |
| D | Fails lint, several issues |
| F | Fails badly: empty/near-empty keywords field, duplicate words across fields |

## 2. Keyword coverage & ranks

From `aso keywords --app`. Exclude any `brand: true` terms from this count, they're not this app's keyword opportunity.

| Grade | Criteria |
|---|---|
| A | Ranked (non-null) for most tracked/candidate keywords, several top 10 |
| B | Ranked for most, mostly top 25-50 |
| C | Ranked for about half, mostly top 100 |
| D | Ranked for a minority, mostly deep or null |
| F | Null rank for nearly everything checked |

## 3. Ratings vs competitors

From `aso app` (your `rating`/`ratingCount`) vs the same for 1-3 competitors (`aso app <competitorId>`).

| Grade | Criteria |
|---|---|
| A | Rating >= competitors' and ratings count same order of magnitude or higher |
| B | Rating comparable, ratings count somewhat behind |
| C | Rating slightly below competitors, or ratings count an order of magnitude behind |
| D | Rating clearly below competitors |
| F | Very low rating or count relative to the category |

Ratings and ASO are independent signals: this dimension measures competitive standing, not ASO effort, but low authority caps how aggressive a keyword strategy can be (see the difficulty ceiling table in `aso-keyword-research`).

**Ratings & reviews practice sub-check** (qualitative, ask the user or check what's live): review-prompt timing (fire only after a positive value moment, never on first launch/onboarding/error/crash; iOS caps the native prompt at 3 per user per 365 days) and negative-review response speed (within 24-48h, HEAR method: Hear, Empathize, Act, Resolve). A pattern of unanswered negative reviews is itself a finding worth flagging.

## 4. Localization coverage

From `aso lint --fastlane` output across locale folders, or a manual locale-by-locale check if no fastlane project exists.

| Grade | Criteria |
|---|---|
| A | Most locales the storefront indexes are filled, each with distinct (not copy-pasted) keywords |
| B | Majority filled |
| C | A few extra locales beyond primary |
| D | One or two locales only |
| F | Only the primary locale filled |

See `aso-localization` for which locales a storefront indexes and how to fill them, and for the 100-byte (not character) keywords-field limit that squeezes CJK/Arabic locales harder.

## 5. Conversion assets (qualitative)

`aso` has no data for icon/screenshot/video quality: grade this qualitatively based on what the user shares, or what's visible in `aso app`'s fields. Use `aso-conversion` for the full icon/screenshot/CPP/PPO/In-App-Events playbook; here, just check presence and freshness:

- Does the description open with a clear value statement (not a feature dump)?
- Do screenshots (if reviewed) lead with benefit-led headlines in a sensible order?
- Is the icon distinctive at thumbnail size (ask the user or view it)?

**Conversion-signals sub-check** (presence, not quality, each a yes/no/unknown): promotional text in use for something timely, What's New reads as a current-version benefit statement (not generic "bug fixes"), In-App Events configured where the app has event-worthy moments, Custom Product Pages present where distinct audiences or campaigns would benefit.

Flag this whole dimension explicitly as qualitative/judgment-based, unlike the other four.

## Overall grade

Weight roughly: metadata utilization 30%, keyword coverage 30%, ratings vs competitors 15%, localization 15%, conversion assets 10%. Map A=4...F=0, weighted average, then back to a letter.

**Mark unknown, don't redistribute weight.** If a dimension can't be graded (no competitor IDs, no fastlane tree, nothing to show for conversion assets), mark it "unknown" and say so. Don't quietly drop its weight and rescale the rest, that inflates the grade with an unearned average; state the grade as computed from what's known, and note how many dimensions were unknown.
