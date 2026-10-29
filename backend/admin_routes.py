"""Admin-only study analytics API. Every route sits behind require_admin (401 no/invalid token, 403 not an admin).

Built by a factory so it can use main.py's get_db without a circular import. Data comes from a read-only
connection (admin_analytics.open_readonly), never from the users table.
"""
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

import admin_analytics as aa
from auth import admin_user_ids, get_current_user, oauth2_scheme


def build_router(get_db):
    def require_admin(token=Depends(oauth2_scheme), database=Depends(get_db)):
        user = get_current_user(token, database)  # 401 for a missing/invalid/expired token or a deleted account
        if user.user_id not in admin_user_ids():
            raise HTTPException(status_code=403, detail="Not authorized")
        return user

    router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])

    def analytics_conn():
        conn = aa.open_readonly()
        try:
            yield conn
        finally:
            conn.close()

    def common(
        tab: Literal["total", "flashcards", "writing"] = "total",
        include_quiz: bool = False,
        visitor_id: Optional[str] = None,
        user_id: Optional[int] = None,
        set_key: Optional[str] = None,
        min_frequency: Optional[int] = None,
        audience: Optional[Literal["account", "anonymous", "deleted"]] = None,
        direction: Optional[Literal["hawaiian_to_english", "english_to_hawaiian"]] = None,
        spaced: Optional[Literal["normal", "spaced"]] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        split_by_direction: bool = True,
        min_set_words: int = Query(0, ge=0),
        min_word_attempts: int = Query(0, ge=0),
    ):
        if date_from and date_to and date_from > date_to:
            raise HTTPException(status_code=422, detail="The From date is after the To date")
        f = aa.Filters(
            visitor_id=visitor_id or None, set_key=set_key, min_frequency=min_frequency, spaced=spaced,
            date_from=date_from, date_to=date_to,
            sources=frozenset({audience}) if audience else None, user_id=user_id,
            variants=aa.DIRECTIONS[direction] if direction else None,
            split_by_direction=split_by_direction, include_quiz=include_quiz,
            min_set_words=min_set_words, min_word_attempts=min_word_attempts)
        return f, tab

    def tabbed(c=Depends(common)):
        return aa.apply_tab(*c)

    def quiz(c=Depends(common)):
        return aa.quiz_filters(c[0])

    @router.get("/me")
    def admin_me(user=Depends(require_admin)):
        return {"admin": True, "user_id": user.user_id}

    @router.get("/analytics/options")
    def options(include_quiz: bool = False, conn=Depends(analytics_conn)):
        return aa.filter_options(conn, include_quiz)

    @router.get("/analytics/summary")
    def summary(date_from: date, date_to: date, c=Depends(common), conn=Depends(analytics_conn)):
        f = aa.apply_tab(*c)
        return aa.summary(conn, f)

    @router.get("/analytics/sets")
    def sets(f=Depends(tabbed), conn=Depends(analytics_conn)):
        r = aa.set_difficulty(conn, f)
        return {"rows": r.rows, "hidden_count": r.hidden_count, "truncated": r.truncated}

    @router.get("/analytics/words")
    def words(f=Depends(tabbed), conn=Depends(analytics_conn)):
        r = aa.word_difficulty(conn, f)
        return {"rows": r.rows, "hidden_count": r.hidden_count, "truncated": r.truncated}

    @router.get("/analytics/funnel")
    def funnel(f=Depends(tabbed), conn=Depends(analytics_conn)):
        rollup, detail, truncated = aa.funnel_lists(conn, f)
        return {"rows": aa.funnel(conn, f), "rollup": rollup, "detail": detail, "detail_truncated": truncated}

    @router.get("/analytics/activity")
    def activity(f=Depends(tabbed), conn=Depends(analytics_conn)):
        return {"rows": aa.activity_by_day(conn, f)}

    @router.get("/analytics/quiz/trend")
    def quiz_trend(f=Depends(quiz), conn=Depends(analytics_conn)):
        return {"rows": aa.quiz_score_trend(conn, f)}

    @router.get("/analytics/quiz/types")
    def quiz_types(f=Depends(quiz), conn=Depends(analytics_conn)):
        return {"rows": aa.quiz_type_accuracy(conn, f)}

    @router.get("/analytics/quiz/results")
    def quiz_results(f=Depends(quiz), conn=Depends(analytics_conn)):
        r = aa.quiz_results_list(conn, f)
        return {"rows": r.rows, "truncated": r.truncated}

    @router.get("/analytics/quiz/words")
    def quiz_words(f=Depends(quiz), conn=Depends(analytics_conn)):
        r = aa.word_difficulty(conn, f)
        return {"rows": r.rows, "hidden_count": r.hidden_count, "truncated": r.truncated}

    return router
