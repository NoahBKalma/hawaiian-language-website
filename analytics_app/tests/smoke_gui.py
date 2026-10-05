"""Manual GUI smoke test (needs matplotlib + Tk; not collected by pytest).

    <python with matplotlib> analytics_app\\tests\\smoke_gui.py
"""
import sys
import tempfile
from dataclasses import replace
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
for entry in (str(REPO_ROOT), str(REPO_ROOT / "backend"), str(Path(__file__).resolve().parent)):
    sys.path.insert(0, entry)

import conftest  # noqa: E402,F401  (stubs sqlalchemy.text when needed, puts backend/ on sys.path)
from analytics_app import queries  # noqa: E402
from analytics_app.app import App  # noqa: E402
from fixture_db import att, build_analytics_db, quiz, set_ev  # noqa: E402

failures = []


def check(condition, message):
    if not condition:
        failures.append(message)
        print("FAIL:", message)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        path = build_analytics_db(tmp / "analytics.db", [
            set_ev("v1", "set_opened", variant="hawaiian", mode="flashcards"),
            set_ev("v1", "set_started", variant="hawaiian", mode="flashcards"),
            set_ev("v2", "set_opened", variant="to_hawaiian"),
        ], [
            att("v1", "a", "incorrect", "2026-01-02 10:00:00", mode="flashcards", variant="hawaiian"),
            att("v1", "a", "correct", "2026-01-02 11:00:00", mode="flashcards", variant="english"),
            att("v2", "a", "correct", "2026-01-03 11:00:00", mode="writing", variant="to_hawaiian"),
            att("v2", "q", "incorrect", "2026-01-04 11:00:00", mode="quiz", variant="mc_to_eng"),
        ], [quiz("v2", "2026-01-04 11:00:00", score=3.0)])
        app = App(settings_path=tmp / "settings.json")
        try:
            check(app.title() == "Study analytics", "window title")
            check(app.load_file(path), "file loads")
            bar = app.filter_bar
            bar.min_sets.set(0)
            bar.min_words.set(0)

            def apply(split, tab="Total", preset="All"):
                bar.split.set(split)
                bar.preset.set(preset)
                app.notebook.select(app.views[tab])
                app.refresh()
                app.update()
                view = app.current_view()
                f = bar.build_filters()
                if view.mode is None:      # Total defaults to flashcards + writing
                    return view, replace(f, modes=frozenset({"flashcards", "writing"}))
                return view, replace(f, mode=view.mode)

            view, f = apply(True)
            rows = queries.set_difficulty(app.conn, f).rows
            check(view.sets_tab.table.row_count() == len(rows), "sets rows (split on)")
            check("direction" in view.sets_tab.table.columns(), "direction column with split on")
            check(len(view.sets_tab.chart.containers) == 2, "one bar container per direction")
            check("direction" in view.words_tab.table.columns(), "words direction column")

            view, f = apply(False)
            check(view.sets_tab.table.row_count() == len(queries.set_difficulty(app.conn, f).rows), "sets rows (split off)")
            check("direction" not in view.sets_tab.table.columns(), "no direction column with split off")
            check(len(view.sets_tab.chart.containers) == 1, "single bar container with split off")

            view, f = apply(True, tab="Writing practice")
            check(f.mode == "writing" and view.sets_tab.table.row_count() == 1, "writing tab shows only writing rows")
            view, f = apply(True, tab="Flashcards")
            check(f.mode == "flashcards" and view.sets_tab.table.row_count() == 2, "flashcards tab shows flashcards only")

            view, f = apply(True, preset="Hawaiian → English")
            check("hawaiian" in f.variants and "mc_to_eng" in f.variants, "direction filter")
            check(view.funnel_tab.funnel.row_count() == len(queries.funnel(app.conn, f)), "funnel rows")
            check(view.activity_tab.table.row_count() == len(queries.activity_by_day(app.conn, f)), "activity rows")

            view, f = apply(True, tab="Quizzes")
            check(view.results_table.row_count() == 1 and view.trend_table.row_count() == 1, "quizzes tab rows")
            check(view.words_tab.table.row_count() == 1, "quizzes hardest words")
            app.notebook.select(app.views["Total"])
            app.update()
            old = build_analytics_db(tmp / "old.db", [set_ev("v1", "set_opened")], [])
            check(app.load_file(old), "old export loads")
            view, f = apply(True, tab="Quizzes")
            check(view.empty.winfo_manager() == "pack", "quizzes empty state on old export")
        finally:
            app.conn.close()
            app.destroy()
    if failures:
        sys.exit(1)
    print("smoke ok")


if __name__ == "__main__":
    main()
