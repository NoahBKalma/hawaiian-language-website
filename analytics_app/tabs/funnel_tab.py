from tkinter import ttk

from .. import queries
from ..widgets.table import DataTable

FUNNEL_COLUMNS = ("set_key", "mode", "min_frequency", "opened", "started", "completed",
                  "opened_not_started", "started_not_completed")
ROLLUP_COLUMNS = ("set_key", "mode", "min_frequency", "opened_not_started", "started_not_completed")
DETAIL_COLUMNS = ("visitor_id", "user_id", "source", "set_key", "mode", "min_frequency", "status",
                  "opened_at", "started_at", "completed_at")


class FunnelTab(ttk.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.funnel = self._section("Funnel per deck", 6)
        self.rollup = self._section("Drop-off per deck (most started-not-completed first)", 6)
        self.detail = self._section("Visitors who did not finish (first 2,000)", 8)
        self.detail_truncated = False

    def _section(self, title, height):
        ttk.Label(self, text=title).pack(anchor="w", padx=4, pady=(6, 0))
        table = DataTable(self, height=height)
        table.pack(fill="both", expand=True, padx=4)
        return table

    def refresh(self, conn, filters):
        self.funnel.set_rows(FUNNEL_COLUMNS, queries.funnel(conn, filters))
        rollup, detail, self.detail_truncated = queries.funnel_lists(conn, filters)
        self.rollup.set_rows(ROLLUP_COLUMNS, rollup)
        self.detail.set_rows(DETAIL_COLUMNS, detail)
