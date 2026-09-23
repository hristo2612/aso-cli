# Limitations and Google Play appendix

## Limitations

State these plainly whenever they apply, don't let the report card imply more certainty than the CLI has:

- No true search volume: popularity is an Apple Ads proxy, not query counts.
- No true conversion rate: the CLI can't see App Store Connect analytics (impressions, product page views, conversion rate).
- No access to live Product Page Optimization or Custom Product Page results: `aso` cannot read App Store Connect, so any PPO/CPP recommendation is a suggestion to test, not a measured outcome.
- Difficulty and opportunity are relative scoring models, not guarantees.

## Google Play appendix (mental model only, the CLI is Apple-only)

`aso` has no Google Play data or commands; this is background knowledge for a user who also has an Android app, not something the CLI can check.

- Google Play indexes the **full description**, not just a short keywords field: keyword placement and repetition throughout the description matters there in a way it doesn't on the App Store.
- Title rules are stricter in practice: avoid emoji, ALL CAPS, and superlative claims like "best" or "#1", these risk policy flags.
- Play ratings are cumulative and don't reset per version, unlike the App Store's per-version reset history; a bad release has a longer-lasting rating impact.
- Play has store listing experiments (A/B testing icon, screenshots, description variants against real traffic) built into the Play Console, a native equivalent to iOS Product Page Optimization.

## Ratings & reviews practice detail

- Review-prompt timing: the native review prompt should fire only after a positive value moment (a completed task, a milestone), never on first launch, during onboarding, or right after an error or crash. iOS caps the native `SKStoreReviewController` prompt at 3 shows per user per 365 days regardless of how it's triggered, so each trigger should be a high-value moment, not a frequent one.
- Negative-review response: respond within 24-48 hours using HEAR: Hear the complaint out, Empathize with the frustration, Act (state a concrete fix or workaround), Resolve (confirm it's addressed, invite them back). A pattern of unanswered negative reviews is itself a finding worth flagging.
