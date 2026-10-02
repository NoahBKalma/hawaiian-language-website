from analytics_app.chart_data import top_series


def label(row):
    return row["set_key"]


def test_single_series_ranked_and_capped():
    rows = [{"set_key": k, "incorrect": n} for k, n in (("a", 1), ("b", 5), ("c", 3), ("d", None))]
    labels, series = top_series(rows, label, "incorrect", limit=3)
    assert labels == ["b", "c", "a"] and series == {"all": [5, 3, 1]}


def test_split_ranks_by_max_across_directions():
    rows = [
        {"set_key": "a", "direction": "english_to_hawaiian", "hints": 1},
        {"set_key": "a", "direction": "hawaiian_to_english", "hints": 9},
        {"set_key": "b", "direction": "english_to_hawaiian", "hints": 4},
    ]
    labels, series = top_series(rows, label, "hints")
    assert labels == ["a", "b"]
    assert series == {"english_to_hawaiian": [1, 4], "hawaiian_to_english": [9, 0]}
