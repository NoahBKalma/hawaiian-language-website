"""SQL views over set_events / attempt_events for study analytics.

The views are recreated (DROP + CREATE) every time create_views() runs so their definitions
always match this file. They are deliberately not registered in Base.metadata.

Definitions used below
- answer rows: outcome in (correct, correct_helped, incorrect, gave_up); hint rows: hint_blanks, hint_letter
- attempts = answer rows; incorrect = incorrect + gave_up rows; correct = correct + correct_helped rows
- first try (per visitor + word + set/mode/level): the earliest is_retry = 0 row; the word is
  first_try_correct only if that row's outcome is 'correct'
- quiz views read quiz_results only. SQLite does not check referenced tables at CREATE VIEW time, so a
  view over a missing quiz_results is created fine and fails only when queried (the viewer gates on
  has_quiz_data). create_all runs before create_views, so live and exported DBs always have the table.
- people are counted per browser (visitor_id); user_id is kept for account roll-ups
"""
from sqlalchemy import text

ANSWER_ROWS = "('correct','correct_helped','incorrect','gave_up')"

VIEWS = [
    ("v_set_status", """
        CREATE VIEW v_set_status AS
        SELECT visitor_id, set_key, mode, min_frequency, user_id, source, opened_at, started_at, completed_at,
               CASE WHEN completed_at IS NOT NULL THEN 'completed'
                    WHEN started_at IS NOT NULL THEN 'started'
                    ELSE 'opened' END AS status
        FROM (
            SELECT visitor_id, set_key, mode, min_frequency,
                   MAX(user_id) AS user_id,
                   MIN(source) AS source,
                   MIN(CASE WHEN event_type = 'set_opened' THEN occurred_at END) AS opened_at,
                   MIN(CASE WHEN event_type = 'set_started' THEN occurred_at END) AS started_at,
                   MIN(CASE WHEN event_type = 'set_completed' THEN occurred_at END) AS completed_at
            FROM set_events
            GROUP BY visitor_id, set_key, mode, min_frequency
        )
    """),
    ("v_set_funnel", """
        CREATE VIEW v_set_funnel AS
        SELECT set_key, mode, min_frequency,
               COUNT(*) AS opened,
               SUM(started_at IS NOT NULL) AS started,
               SUM(completed_at IS NOT NULL) AS completed,
               SUM(status = 'opened') AS opened_not_started,
               SUM(status = 'started') AS started_not_completed
        FROM v_set_status
        GROUP BY set_key, mode, min_frequency
    """),
    ("v_first_try", """
        CREATE VIEW v_first_try AS
        SELECT visitor_id, set_key, mode, min_frequency, word_hawaiian,
               outcome AS first_outcome,
               (outcome = 'correct') AS first_try_correct
        FROM (
            SELECT visitor_id, set_key, mode, min_frequency, word_hawaiian, outcome,
                   ROW_NUMBER() OVER (
                       PARTITION BY visitor_id, set_key, mode, min_frequency, word_hawaiian
                       ORDER BY occurred_at, id) AS rn
            FROM attempt_events
            WHERE is_retry = 0
        )
        WHERE rn = 1
    """),
    ("v_set_accuracy", f"""
        CREATE VIEW v_set_accuracy AS
        SELECT a.set_key, a.mode, a.min_frequency,
               a.attempts, a.correct, a.incorrect, a.hints, a.retry_attempts,
               COALESCE(f.words_seen, 0) AS words_seen,
               COALESCE(f.first_try_correct_words, 0) AS first_try_correct_words,
               CASE WHEN COALESCE(f.words_seen, 0) > 0
                    THEN 1.0 - 1.0 * f.first_try_correct_words / f.words_seen END AS first_pass_incorrect_rate,
               a.distinct_visitors, a.distinct_accounts
        FROM (
            SELECT set_key, mode, min_frequency,
                   SUM(outcome IN {ANSWER_ROWS}) AS attempts,
                   SUM(outcome IN ('correct','correct_helped')) AS correct,
                   SUM(outcome IN ('incorrect','gave_up')) AS incorrect,
                   SUM(outcome IN ('hint_blanks','hint_letter')) AS hints,
                   SUM(outcome IN {ANSWER_ROWS} AND is_retry = 1) AS retry_attempts,
                   COUNT(DISTINCT visitor_id) AS distinct_visitors,
                   COUNT(DISTINCT user_id) AS distinct_accounts
            FROM attempt_events
            GROUP BY set_key, mode, min_frequency
        ) a
        LEFT JOIN (
            SELECT set_key, mode, min_frequency,
                   COUNT(*) AS words_seen, SUM(first_try_correct) AS first_try_correct_words
            FROM v_first_try
            GROUP BY set_key, mode, min_frequency
        ) f ON f.set_key = a.set_key AND f.mode = a.mode AND f.min_frequency = a.min_frequency
    """),
    ("v_word_accuracy", f"""
        CREATE VIEW v_word_accuracy AS
        SELECT a.word_hawaiian, a.set_key, a.mode, a.min_frequency,
               a.attempts, a.incorrect, a.hints, a.gave_up, a.retry_attempts,
               COALESCE(f.words_seen, 0) AS words_seen,
               COALESCE(f.first_try_correct_words, 0) AS first_try_correct_words
        FROM (
            SELECT word_hawaiian, set_key, mode, min_frequency,
                   SUM(outcome IN {ANSWER_ROWS}) AS attempts,
                   SUM(outcome IN ('incorrect','gave_up')) AS incorrect,
                   SUM(outcome IN ('hint_blanks','hint_letter')) AS hints,
                   SUM(outcome = 'gave_up') AS gave_up,
                   SUM(outcome IN {ANSWER_ROWS} AND is_retry = 1) AS retry_attempts
            FROM attempt_events
            GROUP BY word_hawaiian, set_key, mode, min_frequency
        ) a
        LEFT JOIN (
            SELECT word_hawaiian, set_key, mode, min_frequency,
                   COUNT(*) AS words_seen, SUM(first_try_correct) AS first_try_correct_words
            FROM v_first_try
            GROUP BY word_hawaiian, set_key, mode, min_frequency
        ) f ON f.word_hawaiian = a.word_hawaiian AND f.set_key = a.set_key
           AND f.mode = a.mode AND f.min_frequency = a.min_frequency
    """),
    ("v_quiz_summary", """
        CREATE VIEW v_quiz_summary AS
        SELECT set_key,
               COUNT(*) AS quizzes,
               100.0 * AVG(1.0 * score / question_count) AS avg_pct,
               SUM(score >= question_count - 1e-9) AS perfect,
               COUNT(DISTINCT visitor_id) AS distinct_visitors
        FROM quiz_results
        GROUP BY set_key
    """),
    ("v_quiz_type_accuracy", """
        CREATE VIEW v_quiz_type_accuracy AS
        SELECT question_type, total, correct,
               CASE WHEN total > 0 THEN 1.0 * correct / total END AS accuracy
        FROM (
            SELECT 'writing' AS question_type, COALESCE(SUM(writing_total), 0) AS total,
                   COALESCE(SUM(writing_correct), 0) AS correct FROM quiz_results
            UNION ALL
            SELECT 'mc', COALESCE(SUM(mc_total), 0), COALESCE(SUM(mc_correct), 0) FROM quiz_results
            UNION ALL
            SELECT 'connect', COALESCE(SUM(connect_total), 0), COALESCE(SUM(connect_score), 0) FROM quiz_results
        )
    """),
]

def create_views(bind):
    """(Re)creates every analytics view in one transaction. bind is an Engine."""
    with bind.begin() as connection:
        for name, _ in reversed(VIEWS):
            connection.execute(text(f"DROP VIEW IF EXISTS {name}"))
        for _, sql in VIEWS:
            connection.execute(text(sql))
