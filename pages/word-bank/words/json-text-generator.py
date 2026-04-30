import os
import json

words = []
word = []

with open("to-json.txt", "r", encoding="utf-8") as file:
    # Get word list info
    word_types = file.readline().strip().split("|")
    if len(word_types) == 1:
        word_type = word_types[0]
        in_category = ""
    else:
        word_type = word_types[0].strip()
        in_category = word_types[1].strip().title()
    category_name = file.readline().strip().split("(")
    category_name_haw = category_name[0].strip()
    category_name_en = category_name[1].strip()[:-1]
    
    # Get words
    for line in file:
        for element in line.strip().split("|"):
            word.append(element.strip())
        words.append(word[:])
        word.clear()

def fixQuotes(str):
    # Replace every quote with \"
    new_str = str.replace("\"", "\\\"")
    new_str = new_str.replace("“", "\\\"")
    new_str = new_str.replace("”", "\\\"")
    
    return new_str


if in_category == "":
    filename = f"data/{category_name_en}.json".replace(" ", "-")
else:
    filename = f"data/{in_category}/{category_name_en}.json".replace(" ", "-")
    os.makedirs(f"data/{in_category}", exist_ok=True)
    
with open(filename, "w", encoding="utf-8") as file:
    
    file.write("{\n")
    
    # Write category info
    file.write("\t\"category_english\": " + f"\"{category_name_en}\",\n")
    file.write("\t\"category_hawaiian\": " + f"\"{category_name_haw}\",\n")
    file.write("\t\"part_of_speech\": " + f"\"{word_type}\",\n")
    file.write("\t\"in_category\": " + f"\"{in_category}\",\n")

    file.write("\t\"words\": [\n")
    
    # Write each word with comma after
    for word in words[:-1]:
        file.write("\t\t{ \"hawaiian\": " + f"\"{fixQuotes(word[0])}\", ")
        file.write("\"english\": " + f"\"{fixQuotes(word[1])}\", ")
        file.write("\"pronunciation\": " + f"\"{fixQuotes(word[2])}\" }},\n")
        
    # Write last word without trailing comma
    file.write("\t\t{ \"hawaiian\": " + f"\"{fixQuotes(words[-1][0])}\", ")
    file.write("\"english\": " + f"\"{fixQuotes(words[-1][1])}\", ")
    file.write("\"pronunciation\": " + f"\"{fixQuotes(words[-1][2])}\" }}\n")
    
    file.write("\t]\n")
    file.write("}")
    
# Add file to json
with open("index.json", "r", encoding="utf-8") as index_json:
    index = json.load(index_json)

if filename not in index:
    index.append("/pages/word-bank/words/" + filename)
    with open("index.json", "w", encoding="utf-8") as index_json:
        json.dump(index, index_json, indent="\t", ensure_ascii=False)