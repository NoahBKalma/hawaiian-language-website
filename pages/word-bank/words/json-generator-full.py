import os
import sys
import json
import unicodedata
from pathlib import Path

# Paths below are relative to this file, whatever the caller's CWD is
os.chdir(Path(__file__).parent)

KNOWN_POS = {"verbs", "nouns", "adjectives", "adverbs", "short_phrases", "pronouns",
             "prepositions", "conjunctions", "articles"}
DEFAULT_FREQUENCY = 3

class WordSet:
    def __init__(self):
        self.data = {"category_english": "",
                    "category_hawaiian": "",
                    "part_of_speech": "",
                    "in_category_english": "",
                    "in_category_hawaiian": "",
                    "words": []}

OKINA = "ʻ"

# Every character that might stand in for an okina
OKINA_VARIANTS = str.maketrans({
    "‘": OKINA,
    "’": OKINA,
    "'": OKINA,
    "`": OKINA,
    "ʼ": OKINA,
})

# Curly double quotes to straight
QUOTE_VARIANTS = str.maketrans({
    "“": "\"",
    "”": "\"",
})

def fail(lineNum, message):
    print(f"ERROR to-json.txt line {lineNum}: {message}", file=sys.stderr)
    sys.exit(1)

def normalizeEnglish(str):
    # Straighten curly double quotes
    return unicodedata.normalize("NFC", str.translate(QUOTE_VARIANTS))

def normalizeHawaiian(str):
    # Straighten double quotes and normalize every apostrophe variant to a real okina
    return unicodedata.normalize("NFC", str.translate(QUOTE_VARIANTS).translate(OKINA_VARIANTS))

def parseHeader(line, lineNum):
    # "<marker>Name (English)" -> [name, english]
    name, sep, rest = line.strip()[1:].partition("(")
    if not sep or not rest.endswith(")"):
        fail(lineNum, f"expected 'Name (English)' but got: {line.strip()}")
    return [name.strip(), rest[:-1].strip()]

# Read all the words and create an array with all the file objects
sets = []
missingFrequency = []
with open("to-json.txt", "r", encoding="utf-8") as file:

    curr_part_of_speech = [] # hawaiian then english
    curr_main_category = [] # hawaiian then english
    curr_set = [] # hawaiian then english

    in_category = False
    categoryLine = 0

    for lineNum, line in enumerate(file, 1):
        # guard to skip blank lines and // comments
        if not line.strip() or line.strip().startswith("//"):
            continue

        match line.strip()[0]:
            case "!": # part of speech
                if in_category:
                    fail(lineNum, f"part of speech header while category opened on line {categoryLine} is still open")
                curr_part_of_speech = parseHeader(line, lineNum)
                if curr_part_of_speech[1] not in KNOWN_POS:
                    fail(lineNum, f"unknown part of speech '{curr_part_of_speech[1]}' (known: {', '.join(sorted(KNOWN_POS))})")
                curr_set = []
                continue
            case "@": # main category
                # Get category info
                if not in_category:
                    curr_main_category = parseHeader(line, lineNum)
                    in_category = True
                    categoryLine = lineNum
                else:
                    closing = parseHeader(line, lineNum)
                    if closing != curr_main_category:
                        fail(lineNum, f"category '{closing[0]}' started while '{curr_main_category[0]}' (line {categoryLine}) is still open; close it by repeating its @ line")
                    curr_main_category = []
                    in_category = False

                continue
            case "#": # subcategory
                if not curr_part_of_speech:
                    fail(lineNum, "set before any part of speech header")
                # get set info then build set
                curr_set = parseHeader(line, lineNum)
                sets.append(WordSet())
                sets[-1].data["part_of_speech"] = curr_part_of_speech[1]
                sets[-1].data["category_hawaiian"] = normalizeHawaiian(curr_set[0])
                sets[-1].data["category_english"] = normalizeEnglish(curr_set[1])
                if in_category:
                    sets[-1].data["in_category_hawaiian"] = normalizeHawaiian(curr_main_category[0])
                    sets[-1].data["in_category_english"] = normalizeEnglish(curr_main_category[1])

            case _: # word
                if not curr_set:
                    fail(lineNum, "word before any set (#) header")
                word_def = [f.strip() for f in line.strip().split("|")]
                if len(word_def) not in (3, 4):
                    fail(lineNum, f"expected 'hawaiian | english | pronunciation [| frequency]' but got: {line.strip()}")
                frequency = DEFAULT_FREQUENCY
                if len(word_def) == 4 and word_def[3].isdigit() and 1 <= int(word_def[3]) <= 5:
                    frequency = int(word_def[3])
                else:
                    missingFrequency.append(lineNum)
                word = {"hawaiian": normalizeHawaiian(word_def[0]),
                        "english": normalizeEnglish(word_def[1]),
                        "pronunciation": word_def[2],
                        "frequency": frequency,
                        "part_of_speech": curr_part_of_speech[1],
                        "lesson": ""
                        }

                sets[-1].data["words"].append(word)

if in_category:
    fail(categoryLine, f"category '{curr_main_category[0]}' is never closed")

if missingFrequency:
    shown = ", ".join(str(n) for n in missingFrequency[:20])
    more = "..." if len(missingFrequency) > 20 else ""
    print(f"WARNING: {len(missingFrequency)} words missing/invalid frequency, defaulted to {DEFAULT_FREQUENCY} (to-json.txt lines: {shown}{more})")

# Work out every output path first (parsing is finished, so nothing below can hit a to-json.txt error)
PREFIX = "/pages/word-bank/words/"
filenames = []
for currSet in sets:
    if currSet.data["in_category_english"] == "": # make a .json if not in category
        filename = f"data/{currSet.data['category_english']}-{currSet.data['part_of_speech']}.json".replace(" ", "-")
    else: # puts json in folder with others in category
        filename = f"data/{currSet.data['in_category_english']}/{currSet.data['category_english']}-{currSet.data['part_of_speech']}.json".replace(" ", "-")
    filenames.append(filename)

# Case-insensitive check: two names differing only by case would overwrite each other on Windows/macOS
seen = set()
for filename in filenames:
    if filename.lower() in seen:
        print(f"ERROR: two sets would write the same file: {filename}", file=sys.stderr)
        sys.exit(1)
    seen.add(filename.lower())

# Remove stale data files (anything not in the new index, compared with exact case so that files whose
# name only differs by case are replaced too), then empty folders. Done before writing so a case-only
# rename is not deleted after being rewritten.
keep = set(filenames)
for stale in sorted(Path("data").rglob("*.json")):
    if stale.as_posix() not in keep:
        print(f"deleted stale {stale.as_posix()}")
        stale.unlink()
for folder in sorted((d for d in Path("data").rglob("*") if d.is_dir()), key=lambda d: len(d.parts), reverse=True):
    if not any(folder.iterdir()):
        folder.rmdir()

# Creates files with location based on catagery assignment
os.makedirs("data", exist_ok=True) # makes data/ if it doesn't already exist
paths = []
for currSet, filename in zip(sets, filenames):
    os.makedirs(os.path.dirname(filename), exist_ok=True)

    # dump json to file
    paths.append(PREFIX + filename)
    with open(filename, "w", encoding="utf-8") as file:
        json.dump(currSet.data, file, ensure_ascii=False, indent="\t")

# write all file paths to index.
with open("index.json", "w", encoding="utf-8") as file:
    json.dump(paths, file, ensure_ascii=False, indent="\t")

print(f"wrote {len(paths)} sets, {sum(len(s.data['words']) for s in sets)} words")
