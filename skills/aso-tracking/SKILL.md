---
name: aso-tracking
description: Use to set up or review App Store rank tracking over time with the `aso` CLI. Triggers on "track my keyword rankings", "set up rank tracking", "did that metadata change help?", "how are my rankings trending", "set up a cron job for ASO". Covers `aso track add/run/list`, `aso ranks`, `aso history`, and `aso log list` to evaluate whether a shipped metadata change worked.
---

# ASO Rank Tracking

Rank tracking exists to answer one question: **did the change help?** Set it up once, then use it to evaluate every metadata change against a real before/after.

Preflight: see the `aso` router skill. Tracking data lives locally in SQLite at `~/.aso/aso.db`.

## Step 1: Add keywords to track

```bash
aso track add <appId> <term1> <term2> <term3> ...
```

Track: everything currently in the keywords field, the title/subtitle phrases, plus the shortlist from `aso-keyword-research` you intend to chase. Don't track everything you've ever considered, that just adds noise and cron runtime.

```bash
aso track list <appId>       # see what's tracked
aso track rm <appId> <term>  # stop tracking a term
```

## Step 2: Refresh and read current state

```bash
aso track run <appId>        # refreshes popularity, difficulty, rank for all tracked terms; appends to history
aso ranks <appId>             # latest rank per tracked keyword, with change vs the previous check
```

`aso ranks` is the daily dashboard: it shows movement, not just position.

## Step 3: Automate with cron

```bash
0 9 * * * aso track run --json >> ~/.aso/track.log 2>&1
```

Daily at 9am is enough: rank movement is slow, and Apple's numbers don't need finer granularity. Point the user at `crontab -e` to install it; don't edit their crontab without asking first.

## Step 4: Look at trend, not a single snapshot

```bash
aso history <term> --app <appId> --days 90
```

Time series of popularity, difficulty, and rank for one keyword. Use this whenever a single day's number looks surprising: App Store rank is noisy day-to-day; a real trend needs multiple points.

## Step 5: Evaluate a shipped change

Every metadata change should already be logged (see `aso-metadata`'s Step 7):

```bash
aso log list --app <appId>
```

For each logged change, cross-reference its date against `aso history <affected term> --app <appId> --days 90`:

- Pull the rank/popularity trend for the terms the change targeted, both before and after the logged date.
- Compare to terms that were *not* touched by the change, as a rough control: if everything moved together, something else (seasonality, a competitor's own change) may be the real cause, not your edit.

## Rules for change velocity

- **Change one variable at a time.** If you edit the title and the keywords field in the same release, you can't attribute rank movement to either one.
- **Measure at least 7 days** before drawing any conclusion: Apple's re-indexing and rank movement are not instant.
- **Revert if there's no gain after 14 days.** A change that hasn't moved the needle in two weeks is not "about to work": treat it as a negative result, log the revert, and try the next hypothesis.
- Log every change (`aso log add`, see `aso-metadata`) including reverts, with a `--note` explaining why: the log is what makes the next audit or review actually evidence-based instead of a guess.

## Output when reviewing

```
RANK REVIEW: AppName (123456789), US, changes from 2026-09-01

Logged change: keywords field, en-US, 2026-09-01, added "baby cam, nanny cam"
  baby cam:  rank 34 → 19  (14 days)   IMPROVED
  nanny cam: rank,  → 41  (14 days)   IMPROVED (new entry)
  camera (control, untouched): rank 45 → 44   flat, supports attribution to the change

Verdict: keep the change. Next: consider promoting "baby cam" to the subtitle.
```

If a tracked term shows no movement after 14 days, say so explicitly and recommend reverting it via `aso-metadata`, logging the revert with `aso log add`.
