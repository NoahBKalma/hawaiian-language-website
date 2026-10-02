from tkinter import ttk

from .. import queries
from ..widgets.chart import LineChart
from ..widgets.table import DataTable

COLUMNS = ("day", "opens", "starts", "attempts")


class ActivityTab(ttk.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.chart = LineChart(self)
        self.chart.pack(fill="both", expand=True)
        self.table = DataTable(self, height=6)
        self.table.pack(fill="both", expand=True)

    def refresh(self, conn, filters):
        rows = queries.activity_by_day(conn, filters)
        self.table.set_rows(COLUMNS, rows)
        self.chart.draw([r["day"] for r in rows],
                        {name: [r[name] for r in rows] for name in COLUMNS[1:]},
                        "Daily activity (UTC)")
