import sqlite3
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from . import db, export, queries, settings
from .tabs.mode_view import ModeView
from .widgets.filter_bar import FilterBar


class App(tk.Tk):
    def __init__(self, settings_path=None):
        super().__init__()
        self.title("Study analytics")
        self.geometry("960x640")
        self.settings_path = settings_path
        self.conn = None
        self.path = None
        self.warnings = []

        menu = tk.Menu(self)
        file_menu = tk.Menu(menu, tearoff=0)
        file_menu.add_command(label="Open...", command=self.open_dialog)
        file_menu.add_command(label="Reload", command=self.reload)
        file_menu.add_command(label="Refresh from database", command=self.regenerate)
        file_menu.add_separator()
        file_menu.add_command(label="Quit", command=self.destroy)
        menu.add_cascade(label="File", menu=file_menu)
        self.config(menu=menu)

        self.filter_bar = FilterBar(self, self.refresh)
        self.filter_bar.pack(fill="x")
        self.notebook = ttk.Notebook(self)
        self.views = {}
        for name, mode in (("Total", None), ("Flashcards", "flashcards"), ("Writing practice", "writing")):
            self.views[name] = ModeView(self.notebook, mode)
            self.notebook.add(self.views[name], text=name)
        self.notebook.pack(fill="both", expand=True)
        self.notebook.bind("<<NotebookTabChanged>>", lambda _e: self.refresh())
        self.status = tk.StringVar(value="Open an analytics.db (File > Open)")
        ttk.Label(self, textvariable=self.status, anchor="w", relief="sunken").pack(fill="x", side="bottom")

    # -- loading
    def start(self):
        """Launch behaviour: refresh analytics.db from the live database, then open it."""
        if self.regenerate(quiet_if_missing=True) or export.OUTPUT.exists():
            if self.path is None:
                self.load_file(export.OUTPUT)
        else:
            self.open_last()

    def regenerate(self, quiet_if_missing=False):
        """Re-exports analytics.db and reloads it. Returns True when the export succeeded."""
        if self.conn is not None:
            self.conn.close()      # the old file must not be open while it is swapped out
            self.conn = None
        try:
            export.regenerate()
        except export.ExportError as error:
            if not (quiet_if_missing and not export.SOURCE.exists()):
                messagebox.showwarning("Could not refresh analytics.db",
                                       f"{error}\n\nUsing the existing copy if there is one.")
            if self.path and Path(self.path).exists():
                self.load_file(self.path)
            return False
        self.load_file(export.OUTPUT)
        return True

    def open_last(self):
        last = settings.load(self.settings_path).get("last_file")
        if last and Path(last).exists():
            self.load_file(last)

    def open_dialog(self):
        path = filedialog.askopenfilename(title="Open analytics export",
                                          filetypes=[("SQLite", "*.db *.sqlite *.sqlite3"), ("All files", "*.*")])
        if path:
            self.load_file(path)

    def load_file(self, path):
        """Opens `path` read-only. Returns True on success; errors are shown and the app keeps running."""
        try:
            conn = db.open_readonly(path)
            try:
                warnings = db.validate_schema(conn)
                options = queries.filter_options(conn)
            except (db.SchemaError, sqlite3.DatabaseError):
                conn.close()
                raise
        except (db.SchemaError, sqlite3.DatabaseError) as error:
            messagebox.showerror("Cannot open file", str(error))
            return False
        if self.conn is not None:
            self.conn.close()
        self.conn, self.path, self.warnings = conn, str(path), warnings
        settings.save({**settings.load(self.settings_path), "last_file": self.path}, self.settings_path)
        for warning in warnings:
            messagebox.showwarning("Warning", warning)
        self.filter_bar.set_options(options)
        self.refresh()
        return True

    def reload(self):
        if self.path:
            self.load_file(self.path)

    # -- refreshing
    def current_view(self):
        return self.nametowidget(self.notebook.select())

    def refresh(self):
        if self.conn is None:
            return
        try:
            filters = self.filter_bar.build_filters()
        except ValueError as error:
            messagebox.showerror("Invalid filter", str(error))
            return
        self.config(cursor="watch")
        self.update_idletasks()
        try:
            view = self.current_view()
            filters, sets, words = view.refresh(self.conn, filters)
        except Exception as error:  # a bad file must not kill the window
            messagebox.showerror("Query failed", str(error))
            return
        finally:
            self.config(cursor="")
        self._update_status(filters, sets, words, view)

    def _update_status(self, filters, sets, words, view):
        parts = [self.path]
        parts += self.warnings
        parts.append(f"{len(sets.rows)} sets, {len(words.rows)} words")
        hidden = sets.hidden_count + words.hidden_count
        if hidden:
            parts.append(f"{hidden} rows hidden by min-sample")
        if sets.truncated or words.truncated or view.funnel_tab.detail_truncated:
            parts.append(f"showing first {queries.ROW_CAP:,} rows")
        if filters.split_by_direction:
            parts.append("First-try per direction (differs from SQL views)")
        self.status.set(" | ".join(parts))


def main():
    app = App()
    app.start()
    app.mainloop()
