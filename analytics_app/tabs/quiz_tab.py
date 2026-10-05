from dataclasses import replace
from tkinter import ttk

from .. import db, queries
from ..widgets.chart import BarChart, LineChart
from ..widgets.table import DataTable
from .words_tab import WordsTab

RESULT_COLUMNS = ("occurred_at", "set_key", "source", "user_id", "visitor_id", "question_count", "score",
                  "writing_correct", "writing_total", "mc_correct", "mc_total", "connect_score",
                  "connect_total", "unanswered")
TREND_COLUMNS = ("day", "quizzes", "avg_pct")
TYPE_COLUMNS = ("question_type", "total", "correct", "accuracy")
EMPTY_TEXT = "No quiz data in this file (older exports have no quiz_results table)."
SUMMARY_NOTE = "Direction filter does not apply to quiz summaries."
WORDS_NOTE = "Hardest words: connect counted per pair, other types per question. Direction preset applies here only."


class QuizView(ttk.Frame):
    """Quizzes tab. Sub-tabs: Score trend, By type, Hardest words, Results."""

    mode = "quiz"

    def __init__(self, master):
        super().__init__(master)
        self.empty = ttk.Label(self, text=EMPTY_TEXT, anchor="center")
        self.notebook = ttk.Notebook(self)
        self.notes = {}
        self.trend_chart, self.trend_table = self._sub("Score trend", LineChart, TREND_COLUMNS)
        self.type_chart, self.type_table = self._sub("By type", BarChart, TYPE_COLUMNS)
        words = ttk.Frame(self.notebook)
        ttk.Label(words, text=WORDS_NOTE).pack(fill="x", padx=4, pady=2)
        self.words_tab = WordsTab(words)
        self.words_tab.pack(fill="both", expand=True)
        self.notebook.add(words, text="Hardest words")
        results = ttk.Frame(self.notebook)
        self.notes["Results"] = ttk.Label(results, text="")
        self.notes["Results"].pack(fill="x", padx=4, pady=2)
        self.results_table = DataTable(results, height=12)
        self.results_table.pack(fill="both", expand=True)
        self.notebook.add(results, text="Results")
        self.notebook.pack(fill="both", expand=True)

    def _sub(self, name, chart_class, columns):
        frame = ttk.Frame(self.notebook)
        self.notes[name] = ttk.Label(frame, text="")
        self.notes[name].pack(fill="x", padx=4, pady=2)
        chart = chart_class(frame)
        chart.pack(fill="both", expand=True)
        table = DataTable(frame, height=6)
        table.pack(fill="both", expand=True)
        self.notebook.add(frame, text=name)
        return chart, table

    def refresh(self, conn, filters):
        """Returns (filters used, results Result, words Result), like ModeView."""
        filters = replace(filters, mode="quiz", include_quiz=True, min_frequency=None)
        if not db.has_quiz_data(conn):
            self.notebook.pack_forget()
            self.empty.pack(fill="both", expand=True)
            return filters, queries.Result([]), queries.Result([])
        self.empty.pack_forget()
        self.notebook.pack(fill="both", expand=True)

        note = SUMMARY_NOTE if filters.variants is not None else ""
        for label in self.notes.values():
            label.configure(text=note)

        trend = queries.quiz_score_trend(conn, filters)
        self.trend_table.set_rows(TREND_COLUMNS, trend)
        self.trend_chart.draw([r["day"] for r in trend],
                              {"avg score %": [r["avg_pct"] for r in trend]}, "Mean quiz score by day (UTC)")
        types = queries.quiz_type_accuracy(conn, filters)
        self.type_table.set_rows(TYPE_COLUMNS, types)
        self.type_chart.draw([r["question_type"] for r in types],
                             {"all": [r["accuracy"] or 0 for r in types]}, "Accuracy by question type", "% correct")
        results = queries.quiz_results_list(conn, filters)
        self.results_table.set_rows(RESULT_COLUMNS, results.rows)
        words = self.words_tab.refresh(conn, filters)
        return filters, results, words
