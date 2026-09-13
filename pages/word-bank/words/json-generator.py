import os
import json

word_set = {"category_english": "",
       "category_hawaiian": "",
       "part_of_speech": "",
       "in_category_english": "",
       "in_category_hawaiian": "",
       "words": []}

def fixQuotes(str):
    # Replace every quote with " to normalize them
    new_str = str.replace("\"", "\"")
    new_str = new_str.replace("“", "\"")
    new_str = new_str.replace("”", "\"")
    
    return new_str

with open("to-json.txt", "r", encoding="utf-8") as file:

    # Get category info
    word_types = file.readline().strip().split("|")
    if len(word_types) == 1: # just word_set part of speech
        word_set["part_of_speech"] = word_types[0]
    else: # this word_set is in a broader category
        word_type = word_types[0].strip()
        word_set["in_category_hawaiian"] = word_types[0].strip()
        word_set["in_category_english"] = word_types[1].strip()[:-1]

    # Get word_set info
    category_name = file.readline().strip().split("(")
    word_set["category_hawaiian"] = category_name[0].strip()
    word_set["category_english"] = category_name[1].strip()[:-1]
    
    # Get words
    for line in file:
        word_def = line.strip().split("|")
        word = {"hawaiian": fixQuotes(word_def[0].strip()),
                "english": fixQuotes(word_def[1].strip()),
                "pronounciation": fixQuotes(word_def[2].strip())
                }

        word_set["words"].append(word)


# Assigns file path based on catagery assignment
if word_set["in_category_english"] == "":
    filename = f"data/{word_set["category_english"]}.json".replace(" ", "-")
else:
    filename = f"data/{word_set["in_category_english"]}/{word_set["category_english"]}.json".replace(" ", "-")
    os.makedirs(f"data/{word_set["in_category_english"]}", exist_ok=True)
    
with open(filename, "w", encoding="utf-8") as file:
    json.dump(word_set, file, ensure_ascii=False, indent="\t")


'''
# ACTIVATE ONLY WHEN ADDING NEW FILES
# Add file to json
with open("index.json", "r", encoding="utf-8") as index_json:
    index = json.load(index_json)

if filename not in index:
    index.append("/pages/word-bank/words/" + filename)
    with open("index.json", "w", encoding="utf-8") as index_json:
        json.dump(index, index_json, indent="\t", ensure_ascii=False)
'''