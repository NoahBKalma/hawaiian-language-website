from tkinter import ttk


def _format(value):
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.3f}"
    return str(value)


class DataTable(ttk.Frame):
    """Sortable Treeview showing exactly the rows it is given (queries already cap them)."""

    def __init__(self, master, height=10):
        super().__init__(master)
        self.tree = ttk.Treeview(self, show="headings", height=height)
        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.empty = ttk.Label(self, text="No data", anchor="center")
        self.tree.grid(row=0, column=0, sticky="nsew")
        scroll.grid(row=0, column=1, sticky="ns")
        self.rowconfigure(0, weight=1)
        self.columnconfigure(0, weight=1)
        self._rows, self._columns, self._sort = [], [], (None, False)

    def set_rows(self, columns, rows):
        self._columns, self._rows = list(columns), list(rows)
        self._sort = (None, False)
        self.tree.configure(columns=self._columns)
        for column in self._columns:
            self.tree.heading(column, text=column, command=lambda c=column: self._sort_by(c))
            self.tree.column(column, width=max(70, 9 * len(column)), anchor="w")
        self._render()

    def row_count(self):
        return len(self.tree.get_children())

    def columns(self):
        return list(self._columns)

    def _render(self):
        self.tree.delete(*self.tree.get_children())
        for row in self._rows:
            self.tree.insert("", "end", values=[_format(row.get(c)) for c in self._columns])
        if self._rows:
            self.empty.place_forget()
        else:
            self.empty.place(relx=0.5, rely=0.5, anchor="center")

    def _sort_by(self, column):
        descending = self._sort == (column, False)
        self._sort = (column, descending)
        present = [r for r in self._rows if r.get(column) is not None]
        missing = [r for r in self._rows if r.get(column) is None]
        try:
            present.sort(key=lambda r: r[column], reverse=descending)
        except TypeError:
            present.sort(key=lambda r: str(r[column]), reverse=descending)
        self._rows = present + missing
        self._render()
