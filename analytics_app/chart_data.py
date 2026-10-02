"""Pure helpers that turn query rows into chart series (no matplotlib, so they are unit-tested)."""

TOP_N = 25


def top_series(rows, label_of, metric, limit=TOP_N):
    """Returns (labels, {series_name: [values aligned to labels]}).

    Bars are ranked by each item's max value of `metric` across directions. Without a `direction`
    column there is a single series called 'all'.
    """
    items = {}
    for row in rows:
        label = label_of(row)
        series = row.get("direction", "all")
        items.setdefault(label, {})[series] = row.get(metric) or 0
    ranked = sorted(items, key=lambda label: (-max(items[label].values()), label))[:limit]
    names = sorted({name for label in ranked for name in items[label]})
    return ranked, {name: [items[label].get(name, 0) for label in ranked] for name in names}
