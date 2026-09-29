"""One-off, idempotent: append a demo ` | N` frequency (1-5) to every 3-field word line in to-json.txt.

Frequencies are DEMO values for testing filters; hand-edit them later. Lines that already have a
4th field, and every non-word line, are left byte-identical. Run from anywhere.
"""
import hashlib
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

PATH = Path(__file__).parent / "to-json.txt"

CORE = """aloha mahalo ʻae ʻaʻole wai hale kāne wahine keiki ʻai inu hele noho nui liʻiliʻi maikaʻi pehea
ʻo wau ʻoe ia mākou kākou lākou ʻaneʻi ʻanei ʻo wai he aha hea ka wā kēia kēlā ke kai ka lā mahina
hoʻokahi lua kolu ʻehā lima ʻeono hiku walu iwa ʻumi ʻohana makuahine makuakāne kaikamahine keikikāne
hoaloha kumu haumāna kula home lumi ʻai mea ʻono pono hewa nani ʻino ola make hiamoe ala hana ʻike
lohe ʻōlelo heluhelu kākau nānā ʻaʻe hele mai hoʻi lawe haʻi noi hōʻike aloha ʻia pau hou nō
ʻae ʻaʻole mālama e kōkua mahalo nui hauʻoli kaumaha makemake ʻohana keʻokeʻo ʻulaʻula uliuli
lā ao pō kakahiaka awakea ahiahi ala nui kaʻa moku waʻa hale kula lumi kaiāulu mauna kahakai
ʻaila pia ʻiʻo kalo ʻuala palaoa waiū kope wai ʻāpala hua lau ʻōpala lima maka pepeiao ihu waha
poʻo wāwae ʻēkolu pōʻalua pōʻakolu pōʻahā pōʻalima pōʻaono lāpule uku kālā""".split()
CORE_SET = {unicodedata.normalize("NFC", w) for w in CORE}

SHORT_CATS = {"Food & Drink", "Numbers & Measures", "Time", "People & Roles", "Body & Health",
              "Feelings", "Places", "Social Life"}
LONG_CATS = {"Materials & Substances", "Money & Property", "Making & Building", "Objects & Tools"}
RARE_SETS = {"Insects & Small Creatures", "Plants", "Religious Acts"}


def h(hawaiian, english):
    return int(hashlib.md5(f"{hawaiian}|{english}".encode("utf-8")).hexdigest()[:8], 16)


def heuristic(w):
    """Return a level or None (None = 'everything else')."""
    hv = h(w["haw"], w["eng"])
    r = hv % 100
    nfc = unicodedata.normalize("NFC", w["haw"]).lower()
    plain = nfc.replace(" ", "").replace("ʻ", "")
    if nfc in CORE_SET:
        return 5
    if w["pos"] in ("pronouns", "prepositions", "conjunctions"):
        return 5 if r < 60 else 4
    if w["pos"] == "adverbs":
        return 4 if r < 60 else 3
    if w["cat"] in SHORT_CATS and len(plain) <= 5 and r < 65:
        return 4
    if w["cat"] in LONG_CATS and len(plain) >= 10 and r < 65:
        return 2
    if (w["set"] in RARE_SETS or w["cat"] in RARE_SETS) and r < 70:
        return 1
    return None


def default_level(w):
    r = h(w["haw"], w["eng"]) % 100
    return 1 if r < 12 else 2 if r < 34 else 3 if r < 74 else 4 if r < 92 else 5


def main():
    raw = PATH.read_bytes().decode("utf-8")
    nl = "\r\n" if "\r\n" in raw else "\n"
    lines = raw.split(nl)

    pos = cat = setname = ""
    in_cat = False
    words = []  # dicts for the 3-field lines we will annotate
    all_levels = Counter()
    for i, line in enumerate(lines):
        s = line.strip()
        if not s or s.startswith("//"):
            continue
        c = s[0]
        if c == "!":
            pos = s.split("(")[1].rstrip(")").strip()
        elif c == "@":
            in_cat = not in_cat
            cat = s.split("(")[1].rstrip(")").strip() if in_cat else ""
        elif c == "#":
            setname = s.split("(")[1].rstrip(")").strip()
        else:
            f = s.split("|")
            if len(f) == 4:
                try:
                    all_levels[int(f[3])] += 1
                except ValueError:
                    pass
            elif len(f) == 3:
                words.append({"i": i, "haw": f[0].strip(), "eng": f[1].strip(), "pos": pos,
                              "cat": cat or setname, "set": setname})

    for w in words:
        lvl = heuristic(w)
        w["lvl"] = lvl if lvl is not None else default_level(w)

    if words:
        rebalance(words, all_levels)
        for w in words:
            lines[w["i"]] = lines[w["i"]].rstrip() + f" | {w['lvl']}"
        PATH.write_bytes(nl.join(lines).encode("utf-8"))
    print(f"annotated {len(words)} word lines")
    hist = Counter(all_levels)
    for w in words:
        hist[w["lvl"]] += 1
    total = sum(hist.values())
    for lvl in range(5, 0, -1):
        print(f"  level {lvl}: {hist[lvl]:5d} ({100 * hist[lvl] / total:5.1f}%)")


def rebalance(words, pre):
    """Deterministic passes so every level holds 8-35% and each big POS/category has >=3 levels."""
    total = len(words) + sum(pre.values())
    lo, hi = int(total * 0.10), int(total * 0.32)  # inside the required 8-35% band, with margin

    def counts():
        c = Counter(pre)
        for w in words:
            c[w["lvl"]] += 1
        return c

    def group_fix():
        changed = False
        for key in ("pos", "cat"):
            groups = defaultdict(list)
            for w in words:
                groups[w[key]].append(w)
            for g, ws in groups.items():
                if len(ws) < 10 or len({w["lvl"] for w in ws}) >= 3:
                    continue
                present = {w["lvl"] for w in ws}
                missing = [l for l in (3, 2, 4, 1, 5) if l not in present]
                ordered = sorted(ws, key=lambda w: h(w["haw"], w["eng"]))
                # give the missing levels to a couple of words each, taken from the majority level
                for n, l in enumerate(missing[: 3 - len(present)]):
                    for w in ordered[n * 3: n * 3 + 3]:
                        w["lvl"] = l
                changed = True
        return changed

    for _ in range(50):
        c = counts()
        moved = False
        for lvl in range(1, 6):
            if c[lvl] < lo:
                nb = [x for x in (lvl - 1, lvl + 1) if 1 <= x <= 5]
                src = max(nb, key=lambda x: c[x])
                need = lo - c[lvl]
                cand = sorted((w for w in words if w["lvl"] == src), key=lambda w: h(w["haw"], w["eng"]))
                for w in cand[:need]:
                    w["lvl"] = lvl
                moved = True
                break
            if c[lvl] > hi:
                nb = [x for x in (lvl - 1, lvl + 1) if 1 <= x <= 5]
                dst = min(nb, key=lambda x: c[x])
                excess = c[lvl] - hi
                cand = sorted((w for w in words if w["lvl"] == lvl), key=lambda w: h(w["haw"], w["eng"]))
                for w in cand[:excess]:
                    w["lvl"] = dst
                moved = True
                break
        if not moved and not group_fix():
            return
    print("warning: rebalance did not converge")


if __name__ == "__main__":
    main()
