---
name: aso-metadata
description: Use to write or optimize App Store metadata, title, subtitle, or keywords field, for one locale with the `aso` CLI. Triggers on "optimize my metadata", "write my app title", "improve my keywords field", "my app isn't ranking", "rewrite my subtitle". Builds a token budget, drafts 2-3 options, validates every draft with `aso lint`, and logs the shipped change with `aso log add`. For finding candidate keywords first, see aso-keyword-research.
---

# ASO Metadata Optimizer

Craft title, subtitle, and keywords field for one locale so they both rank and convert.

Preflight: see the `aso` router skill.

## Iron law

**Never repeat a word across title, subtitle, and keywords.** Apple indexes all three independently and combines their tokens into phrases: repetition burns character budget for zero extra ranking benefit. Validate every draft with `aso lint` before presenting it.

## Step 1: Gather inputs

- Current metadata for the locale (ask the user, or read their fastlane `metadata/<locale>/{name.txt,subtitle.txt,keywords.txt}` if the project has one).
- A scored keyword shortlist. If you don't have one, run `aso-keyword-research` first: don't invent keywords here.
- Constraints: brand name, terms the user insists on keeping or dropping.

## Step 2: Token budget

| Field | Limit | Rough token count | Role |
|---|---|---|---|
| Title | 30 chars | ~3–4 tokens | Ranking + first thing users read |
| Subtitle | 30 chars | ~5–6 tokens | Ranking + sells the benefit |
| Keywords field | 100 chars | ~14–16 tokens | Pure ranking, invisible to users |

Total is roughly 22–26 unique tokens across the whole locale. Every token must earn its place: it should form at least one compound phrase (with another token in the same or a different field) that has real popularity and a realistic ranking path for this app (see the difficulty ceiling table in `aso-keyword-research`).

## Step 3: Build the compound-phrase matrix

List candidate tokens per field, then enumerate the phrases their combinations form, and score each with `aso keywords`:

```
Title tokens:    [security, camera]
Subtitle tokens: [home, monitor, baby, cam]
Keyword tokens:  [surveillance, motion, detect, night, vision, wifi, ...]

Phrases to score: "security camera", "home security", "baby cam", "home monitor", "motion detect", ...
```

```bash
aso keywords "security camera" "home security" "baby cam" "home monitor" "motion detect" --app <appId> -c US
```

Keep tokens whose phrases clear the bar; drop tokens that only form low-opportunity or irrelevant phrases. Sum the phrases' `opportunity` as your rough score to maximize per draft.

## Step 4: Draft 2–3 full options

For each draft:

- **Title**: `Brand - Natural Phrase` (or just the brand for very well-known single-word brands). It must read as a real product name a human would say out loud, not a keyword string. Fold in your #1 phrase naturally.
- **Subtitle**: a genuine benefit statement, not a second keyword dump, e.g. "Home Monitor & Baby Cam", not "Camera Security Monitor Home". Connectors (`&`, `+`, `-`, "and") are fine; Apple strips them for indexing but they make the phrase readable.
- **Keywords field**: everything else, comma-separated, **no spaces after commas**, singular forms (Apple stems plurals automatically, "camera" already covers "cameras"), no stop words ("the", "and", "for"...), packed toward 95–100 of 100 chars. Never include competitor brand names or Apple trademarks (iPhone, FaceTime, etc.), App Review risk, not just a ranking non-issue.

## Step 5: Validate every draft

```bash
aso lint --title "<title>" --subtitle "<subtitle>" --keywords "<keywords>" --locale en-US
```

This checks lengths, duplicate words across fields, spaces after commas, stop words, plurals, wasted characters, and competitor-brand risk, returning `pass`, `score`, `issues[]`, and `stats`. Fix every issue it raises before presenting the draft: don't hand-check what `aso lint` already checks for you. Re-run after every edit.

Present drafts side by side with their lint score and character usage so the user picks one; don't silently pick for them unless asked to.

## Step 6: Screenshot captions (brief)

Screenshot text is not confirmed to be part of Apple's search index: treat it purely as a **conversion** lever, not a keyword-placement opportunity. Write captions that lead with user benefit ("See who's at your door from anywhere"), one idea each, under ~40 characters for thumbnail readability. Do not stuff keywords into captions on the theory that they're indexed.

## Step 7: Apply and log

`aso` never uploads metadata. To ship:

- **fastlane `deliver`** (preferred): write `fastlane/metadata/<locale>/name.txt`, `subtitle.txt`, `keywords.txt`, then the user runs `fastlane deliver`.
- **Manual**: paste the exact strings into App Store Connect.

**Never push or submit metadata without the user's explicit approval of the final text.**

Once shipped, log it so `aso-tracking` can measure before/after:

```bash
aso log add --app <appId> --locale en-US --field keywords --old "<old value>" --new "<new value>" --note "why"
```

Log title/subtitle/keywords separately if more than one field changed. See `aso log list --app <appId>` to review history.
