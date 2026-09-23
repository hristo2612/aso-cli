---
name: aso-localization
description: Use to pick new App Store markets, research keywords natively per country, or exploit cross-locale keyword indexing with the `aso` CLI, the single most under-used ASO lever for most apps. Trigger on "localize my app", "target new markets", "international ASO", "which locales should I fill", "translate my keywords", or "how does cross-locale indexing work". Uses `aso storefronts` and the per-country `-c` flag for native market research plus `aso lint --fastlane` to validate every locale at once, and warns against ever just translating one locale's keywords into another instead of researching them fresh.
---

# ASO Localization

Fill more of a storefront's indexing capacity than the primary locale alone gives you: the single most under-used ASO lever for most apps.

Preflight: see the `aso` router skill.

## Iron law

**Research each locale natively: never translate.** A translated keyword is a guess about what a market searches; a keyword pulled from `aso suggest`/`aso keywords` with `-c <that country>` is measured. "Überwachungskamera" outperforms a literal translation of "security camera" in DE because it's what Germans actually type, not what English maps to.

## Step 1: Pick markets

```bash
aso storefronts
```

Lists supported country codes. Country codes to `-c` must be uppercase.

Beyond the obvious "which countries do I want revenue from," also fill secondary locales your **current** storefront already indexes: no new market entry required, just more of the same storefront's keyword space. A US-facing app, for example, gets credit not only for en-US but for the other locales the US store indexes alongside it (regional English variants, and non-English locales with meaningful US-resident search volume, e.g. es-MX, pt-BR, zh-Hans/Hant, ja). Exactly which locales a given storefront indexes can shift over time; confirm current App Store Connect locale options for the target storefront rather than assuming a fixed list.

## Step 2: Research per country, not per translation

For every locale you're filling, run the same research flow as `aso-keyword-research` but with `-c` set to that country:

```bash
aso suggest "<seed>" --limit 50 -c DE
aso keywords "<candidate1>" "<candidate2>" ... --app <appId> -c DE
aso search "<candidate>" --limit 20 -c DE
```

Seeds for non-English locales should themselves come from native speakers, translation as a *starting point* only, or `aso suggest`'s own autocomplete-derived ideas for that storefront: always confirm with real popularity/difficulty numbers from that country before trusting a term.

For English secondary locales indexed alongside your primary (e.g. en-GB, en-AU, en-CA under a US storefront), don't just re-run your en-US shortlist: look for regional spelling/vocabulary differences ("colour"/"color", "torch"/"flashlight") and overflow keywords that didn't fit your primary locale's 100-char budget. These count as genuinely different tokens even though the language is the same.

## Step 3: Dedup across locales in the same storefront

Within one storefront, the same word repeated across two of its indexed locales earns nothing extra: Apple already has it indexed once. Build a quick coverage table before finalizing:

```
| Term         | en-US | en-GB | es-MX | Locales |
|--------------|-------|-------|-------|---------|
| camera       | Yes   | -     | -     | 1       |
| cctv         | -     | Yes   | -     | 1       |
| cámara       | -     | -     | Yes   | 1       |
```

Across **different** storefronts (US vs GB as separate stores), duplication is fine: they don't share an index.

## Step 4: Assemble and validate every locale at once

Draft title/subtitle/keywords per locale following `aso-metadata`'s per-field rules (natural title, benefit subtitle, packed keywords field, no cross-field repeats). CJK and Arabic locales fit fewer keyword-field tokens than en-US for the same 100-byte limit (see `aso` for why); check `aso lint`'s byte count for that locale rather than counting characters. Then validate the whole fastlane metadata tree in one pass:

```bash
aso lint --fastlane <metadata dir>
```

This runs the same checks as single-locale `aso lint` (lengths, duplicate words, spacing, stop words, plurals, wasted characters, competitor-brand risk) across every locale folder (`name.txt`, `subtitle.txt`, `keywords.txt`) at once. Fix every flagged locale before presenting the set.

## Step 5: Apply and log

`aso` doesn't upload. Ship via fastlane `deliver` from the `metadata/<locale>/` tree, or manual paste per locale in App Store Connect: with the user's explicit approval of every locale's final text. Log each locale's change:

```bash
aso log add --app <appId> --locale es-MX --field keywords --old "<old>" --new "<new>" --note "initial es-MX fill"
```

Repeat per changed field per locale so `aso-tracking` can later attribute rank movement to the right locale and field.

## Seasonal keyword calendar

Seasonal pushes (holiday, back-to-school, a sale) need lead time and a plan to revert, they're not a permanent rewrite:

- **Creative** (screenshots, icon variants, preview video): plan 4-6 weeks lead time to design and get through App Review.
- **Localization QA** on any seasonal text change: 2-3 weeks lead time to check translations read naturally and lint clean across every locale.
- **Promotional text is the safest seasonal lever**: not indexed, editable anytime with no new build, so put the timely message there first (see `aso-metadata`).
- **Keywords field seasonal swaps**: touch only 2-4 of the weakest evergreen terms, not a wholesale rewrite. Log the swap (`aso log add`), then **revert after the peak** unless the swapped terms are measurably outperforming what they replaced.

## Output

Coverage table (which locales are filled, bytes used, unique-vs-primary term count), the per-locale draft metadata, the `aso lint --fastlane` result, and next steps (which unfilled locales are highest priority, based on their storefront's likely reach).

## Red flags

- Copy-pasting one locale's keywords into another within the same storefront.
- Trusting a machine translation without checking its popularity via `aso keywords -c <country>`.
- Filling title/subtitle for a locale but leaving its keywords field empty (or vice versa).
- Assuming a fixed locale-to-storefront index list without checking current App Store Connect options for that storefront.
