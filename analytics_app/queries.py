"""Query layer: plain sqlite3, every function takes (connection, Filters) and returns plain dicts.

Rules (the SQL views in backend/analytics_views.py are the semantic reference):
- Count metrics (attempts, correct, incorrect, hints, gave_up, retries, distinct visitors, activity):
  both filter stages are applied directly to the rows.
- First try: rank the partition-filtered, non-retry rows per visitor + deck + word (+ direction when
  split_by_direction is on) by (occurred_at, id), keep rn = 1, THEN apply the attribute filters to that
  row. A later row therefore never becomes a false first try.
- Split by direction (set_difficulty / word_difficulty only) deliberately differs from v_first_try:
  direction joins the first-try partition and the grouping. Funnel and activity ignore it.
- Funnel: aggregate per visitor + deck over all event types with only partition filters (like
  v_set_status), then filter on MIN(source), MAX(user_id), the variant of the earliest event and a
  cohort anchor = MIN(occurred_at) over events of any type.
- Activity: opens/starts = distinct (visitor, deck) per UTC day; attempts = raw answer rows per day.
"""
from dataclasses import dataclass, replace
from datetime import date, timedelta

from . import db
from .filters import DIRECTION_SQL, where_clause

ROW_CAP = 2000
ANSWER_ROWS = "('correct','correct_helped','incorrect','gave_up')"
INCORRECT_ROWS = "('incorrect','gave_up')"
HINT_ROWS = "('hint_blanks','hint_letter')"
DECK = "set_key, mode, min_frequency"


@dataclass(frozen=True)
class Result:
    rows: list
    hidden_count: int = 0      # rows removed by min-sample
    truncated: bool = False    # more than ROW_CAP rows passed min-sample


def _fetch(conn, sql, params=None):
    cursor = conn.execute(sql, params or {})
    names = [d[0] for d in cursor.description]
    return [dict(zip(names, row)) for row in cursor.fetchall()]


def _limited(conn, cte, select_from, order, min_clause, params):
    """Runs the capped select and the hidden-row count over the same CTE text."""
    rows = _fetch(conn, f"{cte} SELECT * FROM {select_from} WHERE {min_clause} ORDER BY {order} "
                        f"LIMIT {ROW_CAP + 1}", params)
    hidden = _fetch(conn, f"{cte} SELECT COUNT(*) AS n FROM {select_from} WHERE NOT ({min_clause})",
                    params)[0]["n"]
    truncated = len(rows) > ROW_CAP
    return Result(rows[:ROW_CAP], hidden, truncated)


def _attempt_ctes(f, key_cols):
    """CTEs base / counted / first for attempt_events. key_cols: grouping columns (no direction)."""
    part, pp = where_clause(f, "a", "partition")
    attr, ap = where_clause(f, "", "attribute")
    split = ", direction" if f.split_by_direction else ""
    cte = f"""WITH base AS (
            SELECT a.*, {DIRECTION_SQL} AS direction FROM attempt_events a WHERE {part}),
        counted AS (SELECT * FROM base WHERE {attr}),
        ranked AS (
            SELECT visitor_id, set_key, mode, min_frequency, word_hawaiian, direction, outcome,
                   occurred_at, source, user_id, variant,
                   ROW_NUMBER() OVER (PARTITION BY visitor_id, set_key, mode, min_frequency,
                                      word_hawaiian{split} ORDER BY occurred_at, id) AS rn
            FROM base WHERE is_retry = 0),
        first AS (SELECT * FROM ranked WHERE rn = 1 AND {attr})"""
    return cte, {**pp, **ap}, split


def set_difficulty(conn, f):
    cte, params, split = _attempt_ctes(f, DECK)
    keys = f"{DECK}{split}"
    join = " AND ".join(f"ft.{c} = acc.{c}" for c in (keys.replace(" ", "").split(",")))
    cte += f""",
        acc AS (
            SELECT {keys},
                   SUM(outcome IN {ANSWER_ROWS}) AS attempts,
                   SUM(outcome IN ('correct','correct_helped')) AS correct,
                   SUM(outcome IN {INCORRECT_ROWS}) AS incorrect,
                   SUM(outcome IN {HINT_ROWS}) AS hints,
                   SUM(outcome IN {ANSWER_ROWS} AND is_retry = 1) AS retry_attempts,
                   COUNT(DISTINCT visitor_id) AS distinct_visitors,
                   COUNT(DISTINCT user_id) AS distinct_accounts
            FROM counted GROUP BY {keys}),
        ft AS (
            SELECT {keys}, COUNT(*) AS words_seen, SUM(outcome = 'correct') AS first_try_correct_words
            FROM first GROUP BY {keys}),
        agg AS (
            SELECT {", ".join("acc." + c for c in keys.replace(" ", "").split(","))},
                   acc.attempts, acc.correct, acc.incorrect, acc.hints, acc.retry_attempts,
                   COALESCE(ft.words_seen, 0) AS words_seen,
                   COALESCE(ft.first_try_correct_words, 0) AS first_try_correct_words,
                   CASE WHEN COALESCE(ft.words_seen, 0) > 0
                        THEN 1.0 - 1.0 * ft.first_try_correct_words / ft.words_seen END
                        AS first_pass_incorrect_rate,
                   acc.distinct_visitors, acc.distinct_accounts
            FROM acc LEFT JOIN ft ON {join})"""
    params["min_words"] = f.min_set_words
    return _limited(conn, cte, "agg", keys, "words_seen >= :min_words", params)


def word_difficulty(conn, f):
    cte, params, split = _attempt_ctes(f, DECK)
    keys = f"word_hawaiian, {DECK}{split}"
    cols = keys.replace(" ", "").split(",")
    join = " AND ".join(f"ft.{c} = acc.{c}" for c in cols)
    cte += f""",
        acc AS (
            SELECT {keys},
                   SUM(outcome IN {ANSWER_ROWS}) AS attempts,
                   SUM(outcome IN {INCORRECT_ROWS}) AS incorrect,
                   SUM(outcome IN {HINT_ROWS}) AS hints,
                   SUM(outcome = 'gave_up') AS gave_up,
                   SUM(outcome IN {ANSWER_ROWS} AND is_retry = 1) AS retry_attempts
            FROM counted GROUP BY {keys}),
        ft AS (
            SELECT {keys}, COUNT(*) AS words_seen, SUM(outcome = 'correct') AS first_try_correct_words
            FROM first GROUP BY {keys}),
        agg AS (
            SELECT {", ".join("acc." + c for c in cols)},
                   acc.attempts, acc.incorrect, acc.hints, acc.gave_up, acc.retry_attempts,
                   COALESCE(ft.words_seen, 0) AS words_seen,
                   COALESCE(ft.first_try_correct_words, 0) AS first_try_correct_words
            FROM acc LEFT JOIN ft ON {join})"""
    params["min_attempts"] = f.min_word_attempts
    order = f"incorrect DESC, word_hawaiian, {DECK}{split}"
    return _limited(conn, cte, "agg", order, "attempts >= :min_attempts", params)


def _deck_cte(f):
    """CTE `deck_f`: one row per visitor + deck with the funnel attribute filters applied."""
    part, pp = where_clause(f, "", "partition")
    attr, ap = where_clause(f, "", "attribute")
    cte = f"""WITH ev AS (
            SELECT *, FIRST_VALUE(variant) OVER (
                       PARTITION BY visitor_id, {DECK} ORDER BY occurred_at, id) AS first_variant
            FROM set_events WHERE {part}),
        deck AS (
            SELECT visitor_id, {DECK},
                   MAX(user_id) AS user_id, MIN(source) AS source, MAX(first_variant) AS variant,
                   MIN(occurred_at) AS occurred_at,
                   MIN(CASE WHEN event_type = 'set_opened' THEN occurred_at END) AS opened_at,
                   MIN(CASE WHEN event_type = 'set_started' THEN occurred_at END) AS started_at,
                   MIN(CASE WHEN event_type = 'set_completed' THEN occurred_at END) AS completed_at
            FROM ev GROUP BY visitor_id, {DECK}),
        deck_f AS (
            SELECT *, CASE WHEN completed_at IS NOT NULL THEN 'completed'
                           WHEN started_at IS NOT NULL THEN 'started'
                           ELSE 'opened' END AS status
            FROM deck WHERE {attr})"""
    return cte, {**pp, **ap}


def funnel(conn, f):
    cte, params = _deck_cte(f)
    return _fetch(conn, f"""{cte}
        SELECT {DECK}, COUNT(*) AS opened,
               SUM(started_at IS NOT NULL) AS started,
               SUM(completed_at IS NOT NULL) AS completed,
               SUM(status = 'opened') AS opened_not_started,
               SUM(status = 'started') AS started_not_completed
        FROM deck_f GROUP BY {DECK} ORDER BY {DECK}""", params)


def funnel_lists(conn, f):
    """Returns (rollup, detail, detail_truncated)."""
    cte, params = _deck_cte(f)
    rollup = _fetch(conn, f"""{cte}
        SELECT {DECK}, SUM(status = 'opened') AS opened_not_started,
               SUM(status = 'started') AS started_not_completed
        FROM deck_f GROUP BY {DECK} ORDER BY started_not_completed DESC, {DECK}""", params)
    detail = _fetch(conn, f"""{cte}
        SELECT visitor_id, user_id, source, {DECK}, status, opened_at, started_at, completed_at
        FROM deck_f WHERE status != 'completed' ORDER BY {DECK}, visitor_id
        LIMIT {ROW_CAP + 1}""", params)
    return rollup, detail[:ROW_CAP], len(detail) > ROW_CAP


def _day_range(conn, f):
    options = filter_options(conn, include_quiz=f.include_quiz)
    start = f.date_from or (date.fromisoformat(options["date_min"]) if options["date_min"] else None)
    end = f.date_to or (date.fromisoformat(options["date_max"]) if options["date_max"] else None)
    if start is None or end is None or start > end:
        return []
    return [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]


def activity_by_day(conn, f):
    days = _day_range(conn, f)
    if not days:
        return []
    part, pp = where_clause(f, "", "partition")
    attr, ap = where_clause(f, "", "attribute")
    params = {**pp, **ap}
    counts = {day: {"day": day, "opens": 0, "starts": 0, "attempts": 0} for day in days}

    for event, column in (("set_opened", "opens"), ("set_started", "starts")):
        for row in _fetch(conn, f"""
                SELECT day, COUNT(*) AS n FROM (
                    SELECT DISTINCT substr(occurred_at, 1, 10) AS day, visitor_id, {DECK}
                    FROM set_events WHERE event_type = '{event}' AND {part} AND {attr})
                GROUP BY day""", params):
            if row["day"] in counts:
                counts[row["day"]][column] = row["n"]
    for row in _fetch(conn, f"""
            SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS n FROM attempt_events
            WHERE outcome IN {ANSWER_ROWS} AND {part} AND {attr} GROUP BY day""", params):
        if row["day"] in counts:
            counts[row["day"]]["attempts"] = row["n"]
    return [counts[day] for day in days]


def filter_options(conn, include_quiz=False):
    """Unfiltered: reflects the whole file. Without include_quiz, quiz-only sets, variants and dates are hidden."""
    quiz = include_quiz and db.has_quiz_data(conn)
    where = "" if include_quiz else "WHERE mode != 'quiz'"
    and_ = "" if include_quiz else "AND mode != 'quiz'"
    extra_keys = " UNION SELECT set_key FROM quiz_results" if quiz else ""
    set_keys = [r["set_key"] for r in _fetch(
        conn, f"SELECT set_key FROM set_events {where} UNION SELECT set_key FROM attempt_events {where}"
              f"{extra_keys} ORDER BY set_key")]
    levels = [r["min_frequency"] for r in _fetch(
        conn, f"SELECT min_frequency FROM set_events {where} UNION "
              f"SELECT min_frequency FROM attempt_events {where} ORDER BY min_frequency")]
    variants = [r["variant"] for r in _fetch(
        conn, f"SELECT variant FROM set_events WHERE variant IS NOT NULL {and_} UNION "
              f"SELECT variant FROM attempt_events WHERE variant IS NOT NULL {and_} ORDER BY variant")]
    extra_span = " UNION ALL SELECT MIN(occurred_at), MAX(occurred_at) FROM quiz_results" if quiz else ""
    span = _fetch(conn, f"""
        SELECT MIN(lo) AS lo, MAX(hi) AS hi FROM (
            SELECT MIN(occurred_at) AS lo, MAX(occurred_at) AS hi FROM set_events {where}
            UNION ALL SELECT MIN(occurred_at), MAX(occurred_at) FROM attempt_events {where}{extra_span})""")[0]
    return {"set_keys": set_keys, "min_frequencies": levels, "variants": variants,
            "date_min": span["lo"][:10] if span["lo"] else None,
            "date_max": span["hi"][:10] if span["hi"] else None}


# -- quizzes: quiz_results has no variant / mode / level column, so those filters are dropped here
def _quiz_where(f):
    f = replace(f, variants=None, mode=None, modes=None, min_frequency=None)
    part, pp = where_clause(f, "", "partition")
    attr, ap = where_clause(f, "", "attribute")
    return f"{part} AND {attr}", {**pp, **ap}


def quiz_score_trend(conn, f):
    """One row per UTC day: quizzes taken and mean score as a percentage of the question count."""
    if not db.has_quiz_data(conn):
        return []
    where, params = _quiz_where(f)
    return _fetch(conn, f"""
        SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS quizzes,
               100.0 * AVG(1.0 * score / question_count) AS avg_pct
        FROM quiz_results WHERE {where} GROUP BY day ORDER BY day""", params)


def quiz_type_accuracy(conn, f):
    """One row per question type with totals and accuracy (connect counts fractional credit)."""
    if not db.has_quiz_data(conn):
        return []
    where, params = _quiz_where(f)
    rows = _fetch(conn, f"""
        SELECT COALESCE(SUM(writing_total), 0) AS w_t, COALESCE(SUM(writing_correct), 0) AS w_c,
               COALESCE(SUM(mc_total), 0) AS m_t, COALESCE(SUM(mc_correct), 0) AS m_c,
               COALESCE(SUM(connect_total), 0) AS c_t, COALESCE(SUM(connect_score), 0) AS c_c
        FROM quiz_results WHERE {where}""", params)[0]
    out = []
    for name, total, correct in (("writing", rows["w_t"], rows["w_c"]), ("mc", rows["m_t"], rows["m_c"]),
                                 ("connect", rows["c_t"], rows["c_c"])):
        out.append({"question_type": name, "total": total, "correct": correct,
                    "accuracy": 100.0 * correct / total if total else None})
    return out


def quiz_results_list(conn, f):
    if not db.has_quiz_data(conn):
        return Result([])
    where, params = _quiz_where(f)
    rows = _fetch(conn, f"""
        SELECT occurred_at, set_key, source, user_id, visitor_id, question_count, score,
               writing_correct, writing_total, mc_correct, mc_total, connect_score, connect_total, unanswered
        FROM quiz_results WHERE {where} ORDER BY occurred_at DESC, id DESC LIMIT {ROW_CAP + 1}""", params)
    return Result(rows[:ROW_CAP], 0, len(rows) > ROW_CAP)
