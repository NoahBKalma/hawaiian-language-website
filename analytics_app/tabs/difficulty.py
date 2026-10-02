from tkinter import ttk

from ..chart_data import top_series
from ..widgets.chart import BarChart
from ..widgets.table import DataTable


class DifficultyTab(ttk.Frame):
    """Shared layout for the Sets and Words tabs: metric selector, grouped bar chart, table."""
    METRICS = ()          # (label, row key)
    COLUMNS = ()
    query = None          # callable (conn, Filters) -> Result

    def __init__(self, master):
        super().__init__(master)
        top = ttk.Frame(self)
        top.pack(fill="x", padx=4, pady=2)
        ttk.Label(top, text="Chart metric").pack(side="left")
        self.metric = ttk.Combobox(top, state="readonly", width=26, values=[m[0] for m in self.METRICS])
        self.metric.current(0)
        self.metric.pack(side="left", padx=4)
        self.metric.bind("<<ComboboxSelected>>", lambda _e: self._draw())
        self.chart = BarChart(self)
        self.chart.pack(fill="both", expand=True)
        self.table = DataTable(self, height=8)
        self.table.pack(fill="both", expand=True)
        self.result = None
        self._filters = None

    def label_of(self, row):
        raise NotImplementedError

    def title(self, filters):
        return ""

    def refresh(self, conn, filters):
        self.result = type(self).query(conn, filters)
        self._filters = filters
        rows = self.result.rows
        columns = list(self.COLUMNS)
        if filters.split_by_direction:
            columns.insert(self.DIRECTION_AT, "direction")
        self.table.set_rows(columns, rows)
        self._draw()
        return self.result

    def _draw(self):
        if self.result is None:
            return
        label, key = self.METRICS[self.metric.current()]
        labels, series = top_series(self.result.rows, self.label_of, key)
        self.chart.draw(labels, series, self.title(self._filters), label)
