# Study analytics

The backend records set opens/starts/completions and every attempt in two tables, with SQL views on top.
A future Python tool reads an **analytics-only copy** of the database, never the live file. (The desktop viewer is in `analytics_app/`, see its README.)

## What is recorded

| Table | One row per | Key columns |
|---|---|---|
| `set_events` | set opened / first answer (started) / completed | `visitor_id`, `user_id`, `source`, `set_key`, `min_frequency`, `mode`, `variant`, `event_type`, `occurred_at` |
| `attempt_events` | flashcard grade, writing answer, wrong guess, hint, give up | the same identity/set columns + `word_hawaiian`, `outcome`, `is_retry` |

- `source` is `account` (signed in), `anonymous` (logged out) or `deleted` (the account was deleted; rows kept, unlinked).
- `user_id` is NULL for `anonymous` and `deleted` rows, so "all logged-out activity" is `WHERE source = 'anonymous'`.
- `visitor_id` is a random id kept in the browser's localStorage (no IP address or user agent is stored).
- `mode` is `flashcards` or `writing`; `variant` is the flashcard front language or `to_hawaiian`.
- `outcome` is `correct`, `correct_helped` (correct after a wrong guess or hint), `incorrect`, `hint_blanks`, `hint_letter` or `gave_up`.
- `is_retry` is 1 for attempts made in a retry round. Retry rounds never affect achievements or streaks.
- A frequency-filter change counts as opening a different deck, so everything is grouped by `set_key, mode, min_frequency`.

## Views

| View | Answers |
|---|---|
| `v_set_status` | per browser + set: `opened_at`, `started_at`, `completed_at`, `status` (`opened` / `started` / `completed`) |
| `v_set_funnel` | per set: how many opened, started, completed, `opened_not_started`, `started_not_completed` |
| `v_set_accuracy` | per set: `attempts`, `correct`, `incorrect`, `hints`, `retry_attempts`, `words_seen`, `first_try_correct_words`, `first_pass_incorrect_rate`, `distinct_visitors`, `distinct_accounts` |
| `v_word_accuracy` | the same per word inside a set (`gave_up`, `retry_attempts`, ...) |
| `v_first_try` | helper: each browser's first main-pass row per word |

Definitions: *attempts* are answer rows (`correct`, `correct_helped`, `incorrect`, `gave_up`); *incorrect* is `incorrect` + `gave_up`;
a word is *first-try correct* only if the earliest non-retry row for that browser and word is `correct`
(so a wrong guess or hint first makes it a miss, and re-grading a flashcard later does not change it).
People are counted per browser (`visitor_id`); use `user_id` to roll up per account.

### Example queries

```sql
-- Sets people get wrong the most on the first try (at least 20 words seen)
SELECT set_key, mode, min_frequency, words_seen, first_pass_incorrect_rate
FROM v_set_accuracy WHERE words_seen >= 20 ORDER BY first_pass_incorrect_rate DESC LIMIT 20;

-- Hardest words overall
SELECT word_hawaiian, set_key, attempts, incorrect, hints, gave_up
FROM v_word_accuracy ORDER BY incorrect DESC, hints DESC LIMIT 25;

-- Sets that are opened but never started, and started but never finished
SELECT set_key, mode, min_frequency, opened, started, completed, opened_not_started, started_not_completed
FROM v_set_funnel ORDER BY started_not_completed DESC;

-- Logged-out activity only
SELECT * FROM v_set_status WHERE source = 'anonymous';
```

## Getting the data onto your PC (the Pi keeps the live database)

Never copy `hawaiian.db` itself: it contains every user's email and password hash, and a plain file copy taken while the
site is running can be corrupt. Run the export script on the machine that hosts the database. It writes a new file with
**only** `set_events`, `attempt_events` and the views, so nothing credential-related leaves the Pi:

```bash
ssh pi "cd <path-to-repo>/backend && python3 export_analytics.py /tmp/analytics.db --force"
scp pi:/tmp/analytics.db .
```

(`hawaiian.db` is found relative to the directory the script runs in, so the `cd backend` matters.)
Open the copy read-only in your Python tool, e.g. `sqlite3.connect("file:analytics.db?mode=ro", uri=True)`.
Do not open the live database over a network share: SQLite file locking is not reliable there.

Useful sanity check on the Pi: `SELECT COUNT(*) FROM attempt_events;` and the size of `hawaiian.db`.

## Things to know

- **Deleting an account** keeps its analytics rows but sets `user_id` NULL, `source` to `deleted`, and gives them a fresh random
  `visitor_id` (shared by that account's rows). Snapshots you already copied to your PC still contain the old link.
- **Lost events:** events are sent in the background and flushed when the page is hidden. A request that is still in flight
  when the tab closes can be dropped (browsers don't always finish cross-origin requests with headers on unload).
- **Re-grading** a flashcard logs another attempt row (the history stays accurate); first-try stats ignore it.
- **Rate limit:** `POST /study-events` accepts at most 300 events per minute per client IP (env `STUDY_EVENTS_PER_MINUTE`),
  in memory, single worker. Behind a reverse proxy or Tailscale Serve start uvicorn with `--proxy-headers`
  (and `--forwarded-allow-ips`) so the limiter sees real client addresses instead of one shared proxy address.
- **CORS:** `main.py` currently allows only `http://127.0.0.1:5501`. Add the Pi's site origin when you deploy.
- **SQLite settings:** every connection sets a 5 s busy timeout (`database.py`). Write-ahead logging is **off by default**
  because it creates `hawaiian.db-wal` / `-shm` files that change on every write, which makes the VS Code Live Server
  reload the page while you develop. On the Pi (no Live Server) set the environment variable `SQLITE_WAL=1` for better
  read/write concurrency; unset it and restart to go back (the mode is stored in the database file and is reset on connect).
- **Live Server:** `.vscode/settings.json` tells Live Server to ignore `backend/`, `.omc/` and database files. Only patterns
  starting with `**/` work on Windows, because the extension joins other patterns to the workspace path with backslashes.
