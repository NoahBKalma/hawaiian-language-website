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

def normalizeQuotes(str):
    # Replace every quote with " to normalize them
    new_str = str.replace('“', '"')
    new_str = new_str.replace('”', '"')
    
    return new_str

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
                sets[-1].data["part_of_speech"] = curr_part_of_speech[1]
                sets[-1].data["category_hawaiian"] = curr_set[0]
                sets[-1].data["category_english"] = curr_set[1]
                if in_category:
                    sets[-1].data["in_category_hawaiian"] = curr_main_category[0]
                    sets[-1].data["in_category_english"] = curr_main_category[1]
                    
                pass
            case _: # word
                word_def = line.strip().split("|")
                word = {"hawaiian": normalizeQuotes(word_def[0].strip()),
                        "english": normalizeQuotes(word_def[1].strip()),
                        "pronounciation": normalizeQuotes(word_def[2].strip())
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