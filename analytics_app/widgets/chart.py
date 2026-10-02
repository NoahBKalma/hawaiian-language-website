import tkinter as tk
from tkinter import ttk

from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg, NavigationToolbar2Tk
from matplotlib.figure import Figure

DIRECTION_COLORS = {
    "hawaiian_to_english": "#2b6cb0",
    "english_to_hawaiian": "#dd6b20",
    "unknown": "#718096",
    "all": "#2b6cb0",
}


class _Chart(ttk.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.figure = Figure(figsize=(7, 3.4), dpi=100)
        self.ax = self.figure.add_subplot(111)
        self.canvas = FigureCanvasTkAgg(self.figure, master=self)
        toolbar = NavigationToolbar2Tk(self.canvas, self, pack_toolbar=False)
        toolbar.pack(side="bottom", fill="x")
        self.canvas.get_tk_widget().pack(side="top", fill="both", expand=True)
        self.containers = []

    def _finish(self, title):
        self.ax.set_title(title, fontsize=10)
        try:
            self.figure.tight_layout()
        except ValueError:
            pass
        self.canvas.draw_idle()

    def _empty(self, title):
        self.ax.clear()
        self.containers = []
        self.ax.text(0.5, 0.5, "No data", ha="center", va="center", transform=self.ax.transAxes)
        self.ax.set_xticks([])
        self.ax.set_yticks([])
        self._finish(title)


class BarChart(_Chart):
    """Grouped bars: one bar container (one color) per series."""

    def draw(self, labels, series, title, ylabel):
        if not labels:
            return self._empty(title)
        self.ax.clear()
        count = len(series)
        width = 0.8 / count
        self.containers = []
        for i, (name, values) in enumerate(series.items()):
            positions = [x + (i - (count - 1) / 2) * width for x in range(len(labels))]
            self.containers.append(self.ax.bar(
                positions, values, width, label=name.replace("_", " "), color=DIRECTION_COLORS.get(name)))
        self.ax.set_xticks(range(len(labels)))
        self.ax.set_xticklabels(labels, rotation=45, ha="right", fontsize=7)
        self.ax.set_ylabel(ylabel)
        if count > 1:
            self.ax.legend(fontsize=8)
        self._finish(title)


class LineChart(_Chart):
    def draw(self, days, series, title):
        if not days:
            return self._empty(title)
        self.ax.clear()
        self.containers = []
        for name, values in series.items():
            self.ax.plot(range(len(days)), values, marker="o", markersize=3, label=name)
        step = max(1, len(days) // 10)
        self.ax.set_xticks(range(0, len(days), step))
        self.ax.set_xticklabels(days[::step], rotation=45, ha="right", fontsize=7)
        self.ax.legend(fontsize=8)
        self._finish(title)
