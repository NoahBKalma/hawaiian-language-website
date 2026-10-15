"""Remove saved rows that point at sets (or words) that no longer exist in the word bank.

Run from backend/ after pushing new word data:
    python prune_stale_sets.py                 # dry run: only prints what would go
    python prune_stale_sets.py --apply         # copies hawaiian.db to hawaiian.db.bak-<time>, then deletes
Options:
    --words        also prune review_states whose "hawaiian|english" word no longer exists
    --analytics    also prune set_events / attempt_events for dead sets (history; off by default)
    --db PATH      database file (default hawaiian.db)

Valid set keys: path ids from index.json, `freq-N`, `type:<pos>`, `cat:<pos>/<in_category_english>`.
Accounts, achievements, stats, unit progress and quiz results are never touched.
"""
import argparse
import json
import shutil
import sqlite3
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORDS = ROOT / "pages" / "word-bank" / "words"
PREFIX = "/pages/word-bank/words/data/"

SET_TABLES = ["favorites", "continue_sets", "set_progress", "set_completions"]
ANALYTICS_TABLES = ["set_events", "attempt_events"]


def load_valid():
    paths = json.loads((WORDS / "index.json").read_text(encoding="utf-8"))
    ids, words = set(), set()
    pos_seen, cats = set(), set()
    for p in paths:
        ids.add(p.replace(PREFIX, "", 1).removesuffix(".json"))
        data = json.loads((ROOT / p.lstrip("/")).read_text(encoding="utf-8"))
        pos = data.get("part_of_speech", "")
        pos_seen.add(pos)
        if data.get("in_category_english"):
            cats.add(f"{pos}/{data['in_category_english']}")
        for w in data.get("words", []):
            words.add(unicodedata.normalize("NFC", f"{w['hawaiian']}|{w['english']}"))
    return ids, pos_seen, cats, words


def key_ok(key, ids, pos_seen, cats):
    if key in ids or key.startswith("freq-"):
        return True
    if key.startswith("type:"):
        return key[5:] in pos_seen
    if key.startswith("cat:"):
        return key[4:] in cats
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--words", action="store_true")
    ap.add_argument("--analytics", action="store_true")
    ap.add_argument("--db", default="hawaiian.db")
    a = ap.parse_args()

    ids, pos_seen, cats, words = load_valid()
    print(f"word bank: {len(ids)} sets, {len(words)} words")

    if a.apply:
        bak = f"{a.db}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
        shutil.copy2(a.db, bak)
        print("backup:", bak)

    con = sqlite3.connect(a.db)
    tables = SET_TABLES + (ANALYTICS_TABLES if a.analytics else [])
    for t in tables:
        stale = [k for (k,) in con.execute(f"SELECT DISTINCT set_key FROM {t}") if not key_ok(k, ids, pos_seen, cats)]
        n = 0
        for k in stale:
            n += con.execute(f"SELECT COUNT(*) FROM {t} WHERE set_key=?", (k,)).fetchone()[0]
            if a.apply:
                con.execute(f"DELETE FROM {t} WHERE set_key=?", (k,))
        print(f"{t}: {n} stale rows across {len(stale)} keys" + (f"  e.g. {stale[:3]}" if stale else ""))

    if a.words:
        rows = con.execute("SELECT id, word_key FROM review_states").fetchall()
        dead = [i for i, k in rows if unicodedata.normalize("NFC", k) not in words]
        print(f"review_states: {len(dead)} of {len(rows)} point at words that no longer exist")
        if a.apply:
            con.executemany("DELETE FROM review_states WHERE id=?", [(i,) for i in dead])

    if a.apply:
        con.commit()
        print("applied.")
    else:
        print("dry run only; re-run with --apply to delete.")
    con.close()


if __name__ == "__main__":
    main()
