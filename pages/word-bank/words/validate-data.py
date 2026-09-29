"""Checks index.json and data/**/*.json for consistency. Exit 1 on any failure."""
import json
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
PREFIX = "/pages/word-bank/words/"
DATA_PREFIX = PREFIX + "data/"
FIELDS = {"hawaiian": str, "english": str, "pronunciation": str, "frequency": int,
          "part_of_speech": str, "lesson": str}
BAD_APOSTROPHES = ("'", "‘", "’")

errors = []


def err(msg):
    errors.append(msg)


index = json.loads((ROOT / "index.json").read_text(encoding="utf-8"))

# every index path exists (exact case) and every data file is in the index
on_disk = {p.relative_to(ROOT).as_posix() for p in (ROOT / "data").rglob("*.json")}
indexed = set()
for path in index:
    if not path.startswith(DATA_PREFIX) or not path.endswith(".json"):
        err(f"index path has unexpected shape: {path}")
        continue
    rel = path[len(PREFIX):]
    if rel in indexed:
        err(f"duplicate index entry (set id not unique): {path}")
    indexed.add(rel)
    if rel not in on_disk:
        err(f"index path missing on disk (or wrong case): {path}")
for rel in sorted(on_disk - indexed):
    err(f"data file not in index: {rel}")

ids = set()
levels = Counter()
pos_levels = defaultdict(Counter)
cat_levels = defaultdict(Counter)
for path in index:
    rel = path[len(PREFIX):]
    if rel not in on_disk:
        continue
    set_id = path[len(DATA_PREFIX):-len(".json")]
    if set_id in ids:
        err(f"set id not unique: {set_id}")
    ids.add(set_id)
    data = json.loads((ROOT / rel).read_text(encoding="utf-8"))
    for key in ("category_english", "category_hawaiian", "part_of_speech",
                "in_category_english", "in_category_hawaiian", "words"):
        if key not in data:
            err(f"{rel}: missing set field {key}")
    category = data.get("in_category_english") or data.get("category_english", "")
    for n, word in enumerate(data.get("words", []), 1):
        where = f"{rel} word {n}"
        if set(word) != set(FIELDS):
            err(f"{where}: fields {sorted(word)} != {sorted(FIELDS)}")
            continue
        for field, typ in FIELDS.items():
            if type(word[field]) is not typ:
                err(f"{where}: {field} should be {typ.__name__}")
        freq = word["frequency"]
        if type(freq) is int and not 1 <= freq <= 5:
            err(f"{where}: frequency {freq} not in 1..5")
        haw = word["hawaiian"]
        if unicodedata.normalize("NFC", haw) != haw:
            err(f"{where}: hawaiian not NFC: {haw}")
        if any(c in haw for c in BAD_APOSTROPHES):
            err(f"{where}: hawaiian contains an apostrophe instead of ʻokina: {haw}")
        if word["part_of_speech"] != data.get("part_of_speech"):
            err(f"{where}: part_of_speech differs from its set")
        if type(freq) is int:
            levels[freq] += 1
            pos_levels[data.get("part_of_speech")][freq] += 1
            cat_levels[category][freq] += 1

# frequency spread: every level 8-35% of all words; every POS / category with >=10 words has >=3 levels
total = sum(levels.values())
print(f"{len(index)} sets, {total} words")
for lvl in range(5, 0, -1):
    pct = 100 * levels[lvl] / total if total else 0
    print(f"  level {lvl}: {levels[lvl]:5d} ({pct:5.1f}%)")
    if total and not 8 <= pct <= 35:
        err(f"frequency level {lvl} holds {pct:.1f}% of words (must be 8-35%)")
for label, groups in (("part of speech", pos_levels), ("category", cat_levels)):
    for name, counter in groups.items():
        if sum(counter.values()) >= 10 and len(counter) < 3:
            err(f"{label} '{name}' has {sum(counter.values())} words but only {len(counter)} distinct frequency levels")

if errors:
    print(f"\nFAILED: {len(errors)} problem(s)")
    for e in errors[:50]:
        print("  -", e)
    if len(errors) > 50:
        print(f"  ... and {len(errors) - 50} more")
    sys.exit(1)
print("OK")
