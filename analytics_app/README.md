# Study analytics viewer

A read-only Tkinter + matplotlib desktop app that explores study difficulty and funnel analytics from an
exported `analytics.db`.

## Install and run

```powershell
# 1. on the machine with hawaiian.db
cd backend
python export_analytics.py C:\path\analytics.db

# 2. on the viewing machine, from the repo root
pip install -r analytics_app\requirements.txt
python -m analytics_app
```

On launch the app regenerates `analytics.db` (repo root) from `backend\hawaiian.db` by running
`backend\export_analytics.py` in a subprocess (with `backend\.venv` Python if it exists), then opens it.
The new file is built as `analytics.db.tmp` and swapped in, so a failed export keeps the previous copy and
shows a warning. If `hawaiian.db` is missing the existing `analytics.db` is opened silently.
File > Refresh from database re-exports on demand. `hawaiian.db` is only read (read-only ATTACH).

File > Open loads any other export; the path is remembered in `~/.hawaiian_analytics.json` and reopened on the next
start. File > Reload re-reads the file. The file is opened with SQLite `mode=ro` and never written.
A missing file, a non-SQLite file, or an export missing tables/columns/views shows an error and the app keeps
running. A file with a `users` table (the live database) shows a warning but still loads. **Do not point the
app at the live `hawaiian.db`; use an export.**

## Tabs

Four top-level tabs: **Total**, **Flashcards**, **Writing practice** and **Quizzes**. The first three have Sets / Words / Funnel / Activity stats (Total combines flashcards and writing by default; the other two filter to one mode). **Quizzes** appears populated only when the file has quiz data. The shared filter bar sits above them.

- **Sets**: difficulty per deck (a deck is `set_key + mode + min_frequency`). Chart metric: first-pass incorrect rate, incorrect answers, or hints.
- **Words**: difficulty per word per deck (labelled "across all sets" when no set filter is chosen).
- **Funnel**: opened / started / completed per deck, a drop-off rollup, and a list of visitors who did not finish (first 2,000).
- **Activity**: daily opens, starts and attempts (UTC days, zero-filled).

## Quizzes tab

Shown only when the export has a `quiz_results` table with rows (`db.has_quiz_data`); older exports open fine and show an empty state.
Sub-tabs: **Score trend** (mean score % per UTC day), **By type** (writing / multiple choice / connect accuracy), **Hardest words**
(from quiz `attempt_events`; connect is counted per pair, other types per question) and **Results** (one row per quiz).

- The **Total** tab covers flashcards + writing unless **Include quizzes** is ticked, so its numbers match pre-quiz exports.
  The Set and date options are reloaded when the box is toggled (quiz-only sets and days appear only when it is on).
- The Direction presets also match quiz variants (`*_to_eng` under Hawaiian → English, `*_to_haw` under English → Hawaiian). The
  Score trend, By type and Results sub-tabs read `quiz_results`, which has no variant, so **they ignore Direction** (the tab says so
  when a preset is active). Hardest words does respect it.
- Funnel note: quiz `set_started` is written at submit time, so abandoned quizzes show as "opened, not started". Quiz set events have
  a NULL variant, so those decks are counted under Direction = All and excluded under a specific direction.

## Filters

One bar applies to every tab: Audience, Visitor ID, User ID, Set, Level, UTC date range, Direction
(All / Hawaiian → English / English → Hawaiian; All applies no filter, so rows with no direction are included), Split by direction, and the min-sample spinboxes
(both default to 0 = show everything; raise them to hide thin decks/words. They only affect those two tabs and
the status bar shows how many rows were hidden).

How filters are applied:

- **Partition filters** (visitor, set, mode, level) are applied to raw rows first, because they are part of the first-try / deck key.
- **Attribute filters** (date, audience, user, variant) are applied to a word's **actual first attempt** after ranking, so a later attempt never becomes a false first try. In the funnel they apply to the per-visitor deck: `MIN(source)`, `MAX(user_id)`, the variant of the deck's earliest event, and a cohort anchor = the earliest event of any type.
- Count metrics (attempts, incorrect, hints, activity) apply every filter directly to the rows.
- Dates are UTC (`occurred_at` is server UTC). `(none)` means rows with no variant.
- Switching variant inside one deck keeps it the same deck (variant is not part of the deck key).

## Mode and direction

- Direction: *Hawaiian → English* keeps `hawaiian` rows; *English → Hawaiian* keeps `english` + `to_hawaiian` rows (writing practice is always English → Hawaiian). Rows with no variant only appear under *All* (or as `unknown` when split).
- **Split by direction** (on by default) computes first try separately per direction and adds a `direction` column (`hawaiian_to_english`, `english_to_hawaiian`, `unknown` for NULL variant). Sets and Words show grouped bars, one color per direction.
- With the split **off**, first try is per browser and word: a visitor who studies a deck in both directions has a first try only in the direction done first, so the second direction looks easier. Leave the split on to compare directions.
- With the split **on**, first-try numbers deliberately differ from the SQL views, and first-try counts summed across directions can exceed the unsplit numbers (the app never shows such a sum). With the split off, min-sample 0 and no other filters, the numbers equal `v_set_accuracy`, `v_word_accuracy` and `v_set_funnel`. The status bar notes when the split is on.
- Typed (writing, English → Hawaiian) and self-graded (flashcards) rows are mixed only in the Activity tab and funnel totals when Mode = All. Difficulty rows are per deck and `mode` is part of the deck key, so they never mix. Use the Writing practice tab to isolate typed performance.

## Caveats

- A deleted account's browser merge: rows can appear under `deleted` and in the visitor's anonymous history.
- Narrow date windows can drop decks below min-sample.
- Funnel cohort: a deck whose first event falls inside the window counts its later start/completion even if those fall outside the window.

## Tests

From the repo root (the backend venv has pytest and sqlalchemy, which enables the model drift test):

```powershell
backend\.venv\Scripts\python.exe -m pytest analytics_app\tests -q -rs
```

The GUI smoke script needs an interpreter with matplotlib and Tk and is not part of the pytest run:

```powershell
python analytics_app\tests\smoke_gui.py
```
