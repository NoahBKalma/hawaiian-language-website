"""Filter model shared by the query layer and the UI.

Partition filters (visitor, set_key, mode, min_frequency) are part of the first-try / deck key, so
they are applied to raw rows before any ranking or status grouping. Attribute filters (date, source,
user, variant) are applied afterwards: to the first-try row, or to the aggregated deck in the funnel.
"""
from dataclasses import dataclass
from datetime import date, timedelta

DIRECTION_SQL = ("CASE variant WHEN 'hawaiian' THEN 'hawaiian_to_english' "
                 "WHEN 'english' THEN 'english_to_hawaiian' "
                 "WHEN 'to_hawaiian' THEN 'english_to_hawaiian' ELSE 'unknown' END")


@dataclass(frozen=True)
class Filters:
    # partition filters
    visitor_id: str | None = None
    set_key: str | None = None
    mode: str | None = None
    min_frequency: int | None = None
    # attribute filters
    date_from: date | None = None          # inclusive, UTC
    date_to: date | None = None            # inclusive, UTC
    sources: frozenset | None = None
    user_id: int | None = None
    variants: frozenset | None = None      # a None member means variant IS NULL
    # difficulty tabs only
    split_by_direction: bool = False
    min_set_words: int = 0
    min_word_attempts: int = 0


def where_clause(f, alias, stage):
    """Returns (sql, params). `alias` may be '' for unqualified columns. Always parameterized."""
    p = f"{alias}." if alias else ""
    parts, params = [], {}

    def eq(column, name, value):
        parts.append(f"{p}{column} = :{name}")
        params[name] = value

    if stage == "partition":
        if f.visitor_id is not None:
            eq("visitor_id", "visitor_id", f.visitor_id)
        if f.set_key is not None:
            eq("set_key", "set_key", f.set_key)
        if f.mode is not None:
            eq("mode", "mode", f.mode)
        if f.min_frequency is not None:
            eq("min_frequency", "min_frequency", f.min_frequency)
    elif stage == "attribute":
        if f.date_from is not None:
            parts.append(f"{p}occurred_at >= :date_from")
            params["date_from"] = f.date_from.isoformat()
        if f.date_to is not None:
            parts.append(f"{p}occurred_at < :date_to_next")
            params["date_to_next"] = (f.date_to + timedelta(days=1)).isoformat()
        if f.sources is not None:
            names = []
            for i, source in enumerate(sorted(f.sources)):
                params[f"src{i}"] = source
                names.append(f":src{i}")
            parts.append(f"{p}source IN ({', '.join(names)})" if names else "0")
        if f.user_id is not None:
            eq("user_id", "user_id", f.user_id)
        if f.variants is not None:
            names, options = [], []
            for i, variant in enumerate(sorted(v for v in f.variants if v is not None)):
                params[f"var{i}"] = variant
                names.append(f":var{i}")
            if names:
                options.append(f"{p}variant IN ({', '.join(names)})")
            if None in f.variants:
                options.append(f"{p}variant IS NULL")
            parts.append(f"({' OR '.join(options)})" if options else "0")
    else:
        raise ValueError(f"unknown stage: {stage}")
    return (" AND ".join(parts) if parts else "1=1"), params
