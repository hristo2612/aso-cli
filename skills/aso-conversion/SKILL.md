---
name: aso-conversion
description: Use to improve App Store conversion assets, the icon, screenshots, preview video, Custom Product Pages, Product Page Optimization, or In-App Events, for an iOS app once people are already finding the listing. Trigger on "improve my screenshots", "app icon feedback", "conversion rate", "custom product pages", "product page optimization", "in-app events", or "why isn't my listing converting even though it ranks fine". Qualitative playbook plus whatever `aso app`/`aso search` can show about the current listing and competitors; it is not about keyword ranking, see `aso-keyword-research` and `aso-metadata` for that.
---

# ASO Conversion Optimization

Getting found is `aso-keyword-research`/`aso-metadata`'s job. This skill is what happens after someone sees the listing: does it convert a view into an install. `aso` has no visual or analytics data, this is qualitative guidance plus what the CLI can show you about the current listing and competitors.

Preflight: see the `aso` router skill.

## Iron law

**Conversion assets carry no searchable text.** Icon, screenshots, preview video, and Custom Product Page content don't get indexed, so never claim screenshot captions or icon text rank for keywords; treat every recommendation here as a conversion lever only. Conversion rate and ratings are widely believed to feed back into ranking indirectly over time (see `aso`), which is why this work still matters for ASO, just not through indexing.

## What the CLI can tell you

```bash
aso app <appId> --lang en-US        # your own listing: screenshot count context via description, ratings, version
aso search "<core keyword>" --limit 20 -c US   # top competitors for the terms that matter
aso app <competitorId> --lang en-US            # pull a competitor's listing to compare against
```

`aso` doesn't fetch actual screenshot images or icon files, so ask the user to share screenshots/icon directly (a screen share, a file, or a description) for real feedback; use the commands above to identify who to compare against and to check basic facts like current rating and version recency.

## Icon

- No more than 2 visual elements. A cluttered icon reads as noise at thumbnail size.
- No text in the icon. It's unreadable at the sizes it actually displays (Spotlight, notifications, Settings), and Apple discourages it.
- Test legibility at actual thumbnail size, not the 1024×1024 master: view it in a search results mock-up or shrink it to ~60px before judging.
- Distinctive against the category's visual norms: if every competitor uses a blue gradient with a similar icon, sameness is not safety, it's invisibility.

## Screenshots

- **The first 2-3 screenshots carry most of the conversion weight.** Most viewers never scroll past them; front-load the strongest material.
- Sequence: hook (first screenshot, the single reason to care) → value (what the app does for the user) → features (specifics, differentiation) → trust (ratings, awards, press, social proof).
- Headlines lead with an action verb and are specific, not generic: "Track every workout automatically" beats "Powerful Fitness Features." A generic headline is a wasted screenshot regardless of the visual behind it.
- Show the actual product UI, not just marketing illustration: users are judging whether the real app looks usable.
- Localize screenshot text per locale you're filling (see `aso-localization`), a screenshot with untranslated English text in a non-English storefront undercuts trust.

## Preview video

- The value proposition must be clear in the first 3 seconds. Autoplay is brief and many viewers won't unmute or watch further.
- Must work with sound off: rely on on-screen text/captions and visuals, not narration, to carry the message.
- Show the real app in use, not an abstract brand film.

## Custom Product Pages (CPPs)

- Up to 70 per app, each with its own unique URL.
- Each CPP requires App Review before it goes live, same as a metadata update, plan lead time.
- **A CPP is not an A/B test by itself.** It's a targeted variant you drive specific traffic to (a specific ad campaign, a specific channel, a specific audience segment); it only becomes a comparison when that traffic is externally split (e.g. across ad campaigns pointing to different CPP URLs). Don't present "we made a CPP" as if it already proves anything about conversion lift.

## Product Page Optimization (PPO)

- Up to 3 treatments tested against the default page, for up to 90 days per test.
- Only icon, screenshots, and app previews (video) are testable in a PPO treatment: no title/subtitle/description/keywords changes inside a PPO test.
- This is Apple's native, traffic-split A/B test (unlike a CPP): it randomly assigns real App Store visitors, which is what makes its result a measured comparison, not a guess.
- One variable focus per treatment where possible (e.g. just the first screenshot) so a lift is attributable; a treatment that changes icon and all screenshots is hard to explain afterward even if it wins.

## In-App Events

- Up to 10 concurrent events per app, each running up to 31 days.
- Events can surface directly in App Store search results and on the Today/Games/Apps tabs, an additional discovery surface, not just an in-listing banner.
- Use for real, time-bound moments: a seasonal challenge, a content drop, a live tournament, a limited sale, not evergreen features dressed up as an "event."
- Pair with `aso-metadata`'s promotional text and What's New guidance so the messaging is consistent across every surface for the event's duration.

## Workflow

1. Ask for the current icon and screenshots (or view them via `aso app`'s listing link) and 1-2 competitor app IDs.
2. Pull competitor listings (`aso app <competitorId>`) and compare sequencing, headline style, and how recently their screenshots/preview look updated.
3. Give specific, per-asset feedback against the checklists above, not generic praise.
4. If the user has traffic to split (ad campaigns, multiple channels), recommend PPO for icon/screenshot testing and CPPs for channel-specific variants; if they don't have split-able traffic, say plainly that a CPP alone won't produce a measured comparison.
5. Hand off timely messaging (promotional text, What's New, In-App Events) to `aso-metadata` for the exact field content and character limits.

## Red flags

- Claiming any of this affects search ranking. It doesn't; `aso-metadata`/`aso-keyword-research` own ranking.
- Treating a single Custom Product Page as proof of a conversion lift with no external traffic split.
- Recommending a PPO treatment that changes more than a couple of variables at once.
- Generic screenshot headlines ("Amazing Features") presented as if they were benefit statements.
