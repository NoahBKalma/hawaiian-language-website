from dataclasses import replace
from tkinter import ttk

from .activity_tab import ActivityTab
from .funnel_tab import FunnelTab
from .sets_tab import SetsTab
from .words_tab import WordsTab


class ModeView(ttk.Frame):
    """One top-level tab (Total / Flashcards / Writing): its own Sets, Words, Funnel and Activity stats."""

    def __init__(self, master, mode):
        super().__init__(master)
        self.mode = mode          # None = both modes
        self.notebook = ttk.Notebook(self)
        self.sets_tab, self.words_tab = SetsTab(self.notebook), WordsTab(self.notebook)
        self.funnel_tab, self.activity_tab = FunnelTab(self.notebook), ActivityTab(self.notebook)
        for tab, name in ((self.sets_tab, "Sets"), (self.words_tab, "Words"),
                          (self.funnel_tab, "Funnel"), (self.activity_tab, "Activity")):
            self.notebook.add(tab, text=name)
        self.notebook.pack(fill="both", expand=True)

    def refresh(self, conn, filters):
        """Returns (filters used, sets result, words result)."""
        if self.mode is None:      # Total: flashcards + writing, quizzes only when the toggle is on
            modes = {"flashcards", "writing"} | ({"quiz"} if filters.include_quiz else set())
            filters = replace(filters, modes=frozenset(modes))
        else:
            filters = replace(filters, mode=self.mode)
        sets = self.sets_tab.refresh(conn, filters)
        words = self.words_tab.refresh(conn, filters)
        self.funnel_tab.refresh(conn, filters)
        self.activity_tab.refresh(conn, filters)
        return filters, sets, words
