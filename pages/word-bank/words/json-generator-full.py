import os
import json

class WordSet:
    def __init__(self):
        self.data = {"category_english": "",
                    "category_hawaiian": "",
                    "part_of_speech": "",
                    "in_category_english": "",
                    "in_category_hawaiian": "",
                    "words": []}

OKINA = "\u02bb"

# Every character that might stand in for an okina
OKINA_VARIANTS = str.maketrans({
    "\u2018": OKINA,
    "\u2019": OKINA,
    "\u0027": OKINA,
    "\u0060": OKINA,
    "\u02bc": OKINA,
})

# Curly double quotes to straight
QUOTE_VARIANTS = str.maketrans({
    "\u201c": "\"",
    "\u201d": "\"",
})

def normalizeEnglish(str):
    # Straighten curly double quotes
    return str.translate(QUOTE_VARIANTS)

def normalizeHawaiian(str):
    # Straighten double quotes and normalize every apostrophe variant to a real okina
    return str.translate(QUOTE_VARIANTS).translate(OKINA_VARIANTS)

# Read all the words and create an array with all the file objects
sets = []
with open("to-json.txt", "r", encoding="utf-8") as file:

    curr_part_of_speech = [] # hawaiian then english
    curr_main_category = [] # hawaiian then english
    curr_set = [] # hawaiian then english

    in_category = False

    for line in file:
        # guard to skip blank lines
        if not line.strip():
            continue

        match line.strip()[0]:
            case "!": # part of speech
                #get part of speech info
                curr_part_of_speech = line.split("(")
                curr_part_of_speech[0] = curr_part_of_speech[0].strip()[1:] # remove category marker
                curr_part_of_speech[1] = curr_part_of_speech[1].strip()[:-1] # remove trailing paranthesis

                continue
            case "@": # main category

                # Get category info
                if not in_category:
                    curr_main_category = line.split("(")
                    curr_main_category[0] = curr_main_category[0].strip()[1:] # remove category marker
                    curr_main_category[1] = curr_main_category[1].strip()[:-1] # remove trailing paranthesis 
                    in_category = True
                else:
                    curr_main_category = ""
                    in_category = False

                continue
            case "#": # subcategory

                # get set info then build set
                curr_set = line.split("(")
                curr_set[0] = curr_set[0].strip()[1:] # remove category marker
                curr_set[1] = curr_set[1].strip()[:-1] # remove trailing paranthesis
                print(curr_set[1])
                sets.append(WordSet())
                sets[-1].data["part_of_speech"] = normalizeEnglish(curr_part_of_speech[1])
                sets[-1].data["category_hawaiian"] = normalizeHawaiian(curr_set[0])
                sets[-1].data["category_english"] = normalizeEnglish(curr_set[1])
                if in_category:
                    sets[-1].data["in_category_hawaiian"] = normalizeHawaiian(curr_main_category[0])
                    sets[-1].data["in_category_english"] = normalizeEnglish(curr_main_category[1])
                    
                pass
            case _: # word
                word_def = line.strip().split("|")
                word = {"hawaiian": normalizeHawaiian(word_def[0].strip()),
                        "english": normalizeEnglish(word_def[1].strip()),
                        "pronunciation": word_def[2].strip()
                        }
                
                sets[-1].data["words"].append(word)

                
# Creates files with location based on catagery assignment
os.makedirs("data", exist_ok=True) # makes data/ if it doesn't already exist
paths = []
for currSet in sets:
    if currSet.data["in_category_english"] == "": # make a .json if not in category
        filename = f"data/{currSet.data["category_english"]}.json".replace(" ", "-")
    else: # puts json in folder with others in category
        filename = f"data/{currSet.data["in_category_english"]}/{currSet.data["category_english"]}.json".replace(" ", "-")
        os.makedirs(f"data/{currSet.data["in_category_english"]}", exist_ok=True)

    # dump json to file
    paths.append(f"/pages/word-bank/words/{filename}")
    with open(filename, "w", encoding="utf-8") as file:
        json.dump(currSet.data, file, ensure_ascii=False, indent="\t")

# write all file paths to index.
with open("paths.json", "w", encoding="utf-8") as file:
    json.dump(paths, file, ensure_ascii=False, indent="\t")