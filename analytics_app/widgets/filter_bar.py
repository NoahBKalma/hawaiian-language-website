import tkinter as tk
from datetime import date
from tkinter import ttk

from ..filters import QUIZ_VARIANTS, Filters

ALL = "All"
# Direction = which language is shown first. "All" applies no filter (rows without a direction included).
DIRECTIONS = {
    "All": None,
    "Hawaiian → English": frozenset({"hawaiian"}) | QUIZ_VARIANTS["hawaiian_to_english"],
    "English → Hawaiian": frozenset({"english", "to_hawaiian"}) | QUIZ_VARIANTS["english_to_hawaiian"],
}
DEFAULT_MIN_SET_WORDS, DEFAULT_MIN_WORD_ATTEMPTS = 0, 0   # raise these once there is enough data


class FilterBar(ttk.Frame):
    def __init__(self, master, on_apply, on_quiz_toggle=None):
        super().__init__(master, padding=4)
        self.on_apply = on_apply
        self.on_quiz_toggle = on_quiz_toggle or on_apply
        self.audience = tk.StringVar()
        self.visitor = tk.StringVar()
        self.user = tk.StringVar()
        self.preset = tk.StringVar()
        self.split = tk.BooleanVar()
        self.include_quiz = tk.BooleanVar()
        self.set_key = tk.StringVar()
        self.level = tk.StringVar()
        self.date_from = tk.StringVar()
        self.date_to = tk.StringVar()
        self.min_sets = tk.IntVar()
        self.min_words = tk.IntVar()

        row1, row2 = ttk.Frame(self), ttk.Frame(self)
        row1.pack(fill="x")
        row2.pack(fill="x", pady=(4, 0))
        self._label(row1, "Audience")
        ttk.Combobox(row1, textvariable=self.audience, width=10, state="readonly",
                     values=[ALL, "account", "anonymous", "deleted"]).pack(side="left")
        self._label(row1, "Visitor ID")
        ttk.Entry(row1, textvariable=self.visitor, width=14).pack(side="left")
        self._label(row1, "User ID")
        ttk.Entry(row1, textvariable=self.user, width=6).pack(side="left")
        self._label(row1, "Set")
        self.set_box = ttk.Combobox(row1, textvariable=self.set_key, width=18, state="readonly")
        self.set_box.pack(side="left")
        self._label(row1, "Level")
        self.level_box = ttk.Combobox(row1, textvariable=self.level, width=5, state="readonly")
        self.level_box.pack(side="left")
        self._label(row1, "UTC date")
        ttk.Entry(row1, textvariable=self.date_from, width=11).pack(side="left")
        ttk.Label(row1, text="–").pack(side="left")
        ttk.Entry(row1, textvariable=self.date_to, width=11).pack(side="left")

        self._label(row2, "Direction")
        ttk.Combobox(row2, textvariable=self.preset, width=18, state="readonly",
                     values=list(DIRECTIONS)).pack(side="left")
        ttk.Checkbutton(row2, text="Split by direction", variable=self.split).pack(side="left", padx=(12, 0))
        ttk.Checkbutton(row2, text="Include quizzes", variable=self.include_quiz,
                        command=lambda: self.on_quiz_toggle()).pack(side="left", padx=(12, 0))
        self._label(row2, "Min words (sets)")
        ttk.Spinbox(row2, from_=0, to=100000, textvariable=self.min_sets, width=6).pack(side="left")
        self._label(row2, "Min attempts (words)")
        ttk.Spinbox(row2, from_=0, to=100000, textvariable=self.min_words, width=6).pack(side="left")
        ttk.Button(row2, text="Clear", command=self.clear).pack(side="right")
        ttk.Button(row2, text="Apply", command=self.on_apply).pack(side="right", padx=4)
        self.clear()

    @staticmethod
    def _label(parent, text):
        ttk.Label(parent, text=text).pack(side="left", padx=(8, 2))

    # -- state
    def set_options(self, options):
        self.set_box.configure(values=[ALL, *options["set_keys"]])
        self.level_box.configure(values=[ALL, *[str(v) for v in options["min_frequencies"]]])
        if self.set_key.get() not in self.set_box.cget("values"):
            self.set_key.set(ALL)
        if self.level.get() not in self.level_box.cget("values"):
            self.level.set(ALL)

    def clear(self):
        for var in (self.visitor, self.user, self.date_from, self.date_to):
            var.set("")
        for var in (self.audience, self.set_key, self.level):
            var.set(ALL)
        self.preset.set("All")
        self.split.set(True)
        self.include_quiz.set(False)
        self.min_sets.set(DEFAULT_MIN_SET_WORDS)
        self.min_words.set(DEFAULT_MIN_WORD_ATTEMPTS)

    def build_filters(self):
        """Builds Filters from the widgets. Raises ValueError with a readable message."""
        def parse_date(text, name):
            text = text.strip()
            if not text:
                return None
            try:
                return date.fromisoformat(text)
            except ValueError:
                raise ValueError(f"{name} must look like YYYY-MM-DD") from None

        user_text = self.user.get().strip()
        try:
            user_id = int(user_text) if user_text else None
        except ValueError:
            raise ValueError("User ID must be a whole number") from None
        try:
            min_sets, min_words = int(self.min_sets.get()), int(self.min_words.get())
        except (ValueError, tk.TclError):
            raise ValueError("Min-sample values must be whole numbers") from None
        date_from, date_to = parse_date(self.date_from.get(), "From date"), parse_date(self.date_to.get(), "To date")
        if date_from and date_to and date_from > date_to:
            raise ValueError("From date is after To date")

        pick = lambda var: None if var.get() in (ALL, "") else var.get()
        level = pick(self.level)
        return Filters(
            visitor_id=self.visitor.get().strip() or None,
            set_key=pick(self.set_key),
            min_frequency=int(level) if level is not None else None,
            date_from=date_from, date_to=date_to,
            sources=None if pick(self.audience) is None else frozenset({self.audience.get()}),
            user_id=user_id, variants=DIRECTIONS[self.preset.get()],
            split_by_direction=self.split.get(), include_quiz=self.include_quiz.get(),
            min_set_words=max(0, min_sets), min_word_attempts=max(0, min_words))
