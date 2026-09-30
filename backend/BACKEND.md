# Backend stack

A small JSON API that stores accounts and learning progress for the Hawaiian language website.
The website itself is static HTML/CSS/JS (served by VS Code Live Server on port 5501 during development);
this backend only exists so the pages can log in, save progress and track stats.

- **Language / runtime:** Python 3.14 (the project virtualenv is `backend/.venv`)
- **Web framework:** FastAPI, served by Uvicorn (ASGI server)
- **Validation:** Pydantic v2 (comes with FastAPI)
- **Database:** SQLite (one file, `backend/hawaiian.db`) accessed through SQLAlchemy 2.x
- **Passwords:** bcrypt
- **Sessions:** stateless JWT bearer tokens (python-jose, HS256)
- **Config:** a `.env` file read by python-dotenv
- **Tests:** pytest with FastAPI's `TestClient`

```
Browser (scripts/*.js)
   |  fetch() with  Authorization: Bearer <JWT>
   v
Uvicorn  ->  FastAPI app (main.py)
                |-- CORS middleware
                |-- Pydantic schemas validate the request body   (schemas.py)
                |-- auth helpers check the token                  (auth.py)
                |-- route handler runs, using a DB session        (main.py + get_db)
                v
           SQLAlchemy ORM models (models.py)  ->  SQLite file hawaiian.db
```

## Files

| File | What it does |
|---|---|
| `main.py` | Creates the app, CORS, all the routes, the activity/achievement logic, the study-events endpoint |
| `models.py` | SQLAlchemy table definitions (one class per table) |
| `schemas.py` | Pydantic models that describe and validate request bodies |
| `auth.py` | Password hashing, JWT creation/verification, the "who is this user" helpers |
| `database.py` | The SQLAlchemy engine, session factory, `Base` class, SQLite settings |
| `achievements.py` | The achievement catalog and the functions that decide what a user has unlocked |
| `analytics_views.py` | SQL views used for study analytics (see `ANALYTICS.md`) |
| `export_analytics.py` | Command-line tool that writes an analytics-only copy of the database |
| `tests/` | `conftest.py` (test setup), `test_progress.py`, `test_study_events.py` |
| `requirements.txt` | Runtime dependencies |
| `ANALYTICS.md` | How the analytics tables/views work and how to pull them to your PC |

## The pieces, one by one

### FastAPI and Uvicorn
FastAPI maps a Python function to a URL, e.g. `@app.post("/login")`. It reads the JSON body, checks it against a
Pydantic model, calls your function, and turns the returned dict into JSON. It also generates interactive docs at
`http://127.0.0.1:8000/docs` while the server runs, which is the easiest way to try an endpoint by hand.

Uvicorn is the process that actually listens on a port and speaks HTTP. You start everything with:

```
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

`main:app` means "the variable `app` in `main.py`". `--reload` restarts the server when a Python file changes
(development only).

**Dependency injection.** Routes declare what they need as default arguments:
`database=Depends(get_db)` gives the handler a database session (opened for the request, closed afterwards), and
`token=Depends(oauth2_scheme)` pulls the bearer token out of the `Authorization` header.

**CORS.** Browsers block a page on one origin from calling an API on another. The page is on
`http://127.0.0.1:5501` and the API on `:8000`, so `main.py` whitelists exactly `http://127.0.0.1:5501`. When the site
moves to the Raspberry Pi, that origin has to be updated or the browser will refuse the responses.

### Pydantic (schemas.py)
Every request body has a class: `UserRegister`, `UpdateContinueStudy`, `ActivityEvent`, `StudyEventBatch` and so on.
They enforce types and limits before your code runs (usernames match `^[a-zA-Z0-9_.-]+$`, emails are valid,
`min_frequency` is 1 to 5, `local_date` looks like `YYYY-MM-DD`). Bad input gets an automatic HTTP 422 response.
`ActivityEvent.type` is a `Literal` of three allowed values, and the study-event models use `extra='forbid'` so a client
can never smuggle in fields like `user_id` or `source`.

### SQLite and SQLAlchemy (database.py, models.py)
SQLite is a database in a single file, with no server to run. SQLAlchemy lets you describe tables as Python classes
and query them without writing SQL strings. `database.py` holds:

- `engine`: the connection factory for `sqlite:///./hawaiian.db`. The path is **relative to the directory you start the
  server from**, which is why commands say `cd backend` first.
- `SessionLocal`: makes a session (a unit of work) per request.
- `Base`: the parent class all models inherit from.
- `configure_sqlite()`: sets a 5 second busy timeout on every connection, so a write that hits a lock waits instead of
  failing. Write-ahead logging is opt-in via the environment variable `SQLITE_WAL=1` (recommended on the Pi, left off in
  development because its extra `-wal`/`-shm` files made Live Server reload the page).

At startup `main.py` runs `Base.metadata.create_all(engine)`, which creates any table that does not exist yet, and then
`create_views(engine)` for the analytics views. **There are no migrations.** `create_all` never changes an existing
table, so adding a column to an existing table needs a manual `ALTER TABLE`. That is why new features use new tables.

### Tables

| Table | Purpose |
|---|---|
| `users` | `user_id`, `username`, `email` (both unique), `password_hash`. IDs are never reused (`sqlite_autoincrement`) |
| `favorites` | Sets a user starred |
| `continue_sets` | "Resume here" slot: one row per user and set with `last_studied` and `set_size`. Removed when the set is finished |
| `user_stats` | One row per user: cards studied, words written, sets completed, current/best daily streak, last active date |
| `set_progress` | Per user and set: best writing streak, perfect-run flag, completed flag |
| `set_completions` | One row per user, set and frequency level that was finished (unique, so it counts once) |
| `user_achievements` | Which achievements a user has unlocked, and when |
| `set_events`, `attempt_events` | Analytics logs (see `ANALYTICS.md`) |

Two design notes worth knowing: the tables reference users by a plain `user_id` integer with **no foreign key**, so the
database does not enforce the link; the code deletes a user's rows by hand in `/delete-account`. The analytics tables
skip the link on purpose so their rows can outlive an account.

### Authentication (auth.py)
1. **Register:** `/register` hashes the password with **bcrypt** (slow on purpose, salted automatically) and stores only
   the hash. It checks for a duplicate username or email first because hashing is the expensive step.
2. **Login:** `/login` verifies the password with `bcrypt.checkpw` and returns a **JWT**: a signed token containing the
   `user_id` and an expiry time (7 days). It is signed with `HS256` using `SECRET_KEY`. Nothing about the session is
   stored on the server.
3. **Every later request:** the page sends `Authorization: Bearer <token>`. `get_current_user` verifies the signature and
   expiry, loads the user from the database, and raises HTTP 401 if the token is bad, expired, or the account was deleted.
4. **Front end:** `scripts/auth.js` keeps the token in `localStorage`. `authFetch` adds the header and, if the server
   answers 401, logs out and redirects to the login page.
5. **Optional auth:** `get_optional_user` and `oauth2_optional` are the "maybe logged in" versions used by
   `/study-events`; any failure quietly means "anonymous".

`SECRET_KEY` lives in `.env` at the repository root (the only variable there). `load_dotenv()` walks up the folders from
`auth.py` to find it. `.env` is git-ignored. If the key changes, all existing tokens stop working.

## The API

All bodies are JSON. "Auth" means a valid bearer token is required.

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /register` | no | Create an account |
| `POST /login` | no | Returns `access_token` |
| `GET /signed-in-user` | yes | Username and email of the current user |
| `POST /edit-user` | yes | Change username/email (rejects duplicates) |
| `POST /edit-password` | yes | Change password (needs the current one) |
| `POST /delete-account` | yes | Deletes the account after a password check |
| `GET` / `POST /favorites` | yes | List favorites / toggle one |
| `GET` / `POST /continue-sets` | yes | List resume slots / save one (finishing the set deletes it) |
| `POST /activity` | yes | Report a study event; updates streaks, counters and achievements |
| `GET /progress?today=YYYY-MM-DD` | yes | Stats, display streak and every achievement with its progress |
| `GET /set-progress?set_key=...` | yes | Best writing streak for one set |
| `POST /study-events` | optional | Analytics event intake (works logged out) |

Handlers follow the same pattern: resolve the user, read or change rows through the session, call `commit()`, return a
small dict. SQLAlchemy sessions here do not auto-flush or auto-commit, so nothing is saved until an explicit commit.

### How `/activity` works
The front end reports three kinds of event: `card_graded`, `word_correct` and `set_completed`. For each one the server:

1. Checks `local_date` (the user's local calendar day, sent by the browser) is within two days of the server's UTC date.
2. Takes a process-wide lock (`activity_lock`), so two simultaneous events cannot both read and overwrite the same counters.
   This is correct for **one Uvicorn worker only**; running several workers would need a different approach.
3. Updates the **daily streak** for graded cards and correct words: consecutive days extend it, a gap resets it to 1, a
   late event from an earlier day leaves it alone.
4. Increments the counters, records the best writing streak for a set, and sets the perfect-run flag when a full run
   reaches the set size with no help.
5. On `set_completed`, records each (set, frequency level) **once**.
6. Asks `achievements.py` what is now earned, stores any newly unlocked ones, and returns them so the page can show a toast.

Retry rounds, hints and given-up words deliberately report nothing here, so they cannot inflate counters or unlock
perfect-run achievements.

### Achievements (achievements.py)
Six ladders (cards studied, words written, sets completed, daily streak, in-a-row streak, plus a one-off "Perfect Set"),
each with tiers defined by thresholds in one list. The catalog is data, so adding a tier means editing a list. A user's
current values come from `user_stats` and `set_progress`; an achievement is earned when its value reaches its threshold.
Old thresholds were kept so achievements unlocked earlier keep the same ids.

## Study analytics (summary)
`POST /study-events` accepts batches of up to 50 events from logged-in users and anonymous visitors, stores them in
`set_events` and `attempt_events`, and the views in `analytics_views.py` answer questions such as "which sets are missed
most" and "which sets are opened but never finished". It has a per-IP rate limit, deleted accounts are anonymized rather
than erased, and `export_analytics.py` produces a copy with no user data in it for your PC.
Everything about it is documented in `ANALYTICS.md`.

## Tests
`tests/` uses pytest and FastAPI's `TestClient`, which calls the app in-process without a network.
`conftest.py` does the important setup **before** `main` is imported: it creates a temporary SQLite file, points
`database.engine` at it, then imports the app, so tests never touch `hawaiian.db`. Each test starts with a dropped and
recreated schema plus the analytics views, a pinned server date (so literal dates like `2026-01-02` work) and a reset
rate limiter. The `auth` fixture registers a user and returns ready-to-use bearer headers.

Run them from `backend/`:

```
.\.venv\Scripts\python.exe -m pytest tests -q
```

`pytest` and `httpx` (used by `TestClient`) are listed in `requirements.txt`, so `pip install -r requirements.txt`
sets up everything needed to run the tests.

## Running it

```
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload     # http://127.0.0.1:8000, docs at /docs
```

The front end finds the API through `scripts/config.js` (`API_BASE_URL`). On the Raspberry Pi: drop `--reload`, run a
single worker, set `SQLITE_WAL=1` if you want write-ahead logging, update the CORS origin in `main.py`, and start Uvicorn
with `--proxy-headers` if a reverse proxy sits in front (so the rate limiter sees real client addresses).

## Known limitations and things to watch

- **No migrations and no foreign keys:** schema changes to existing tables are manual, and orphaned rows are possible if
  a delete path forgets a table.
- **Token storage:** the JWT is kept in `localStorage`, so any cross-site scripting bug on the site could read it. There
  are no refresh tokens; it simply expires after 7 days.
- **Weak password rule:** the only requirement is one character. There is no login rate limiting or lockout.
- **Single worker:** the activity lock and the study-events rate limiter are in-memory per process.
- **Hard-coded CORS origin:** only `http://127.0.0.1:5501` is allowed.
- **Deprecation warnings:** the code uses `datetime.utcnow()`, which Python 3.12+ flags as deprecated; it works today.
- **Leftover table:** the old `card_results` table (removed from the code) may still exist in an older `hawaiian.db`.
  SQLite files are never pruned by `create_all`; it is harmless and can be dropped with `DROP TABLE card_results;`.
- **SQLite file location:** `hawaiian.db` is resolved relative to the working directory, so starting the server from the
  wrong folder creates a fresh empty database there.
