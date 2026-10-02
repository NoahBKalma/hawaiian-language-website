from .. import queries
from .difficulty import DifficultyTab


class WordsTab(DifficultyTab):
    METRICS = (("Incorrect answers", "incorrect"),
               ("Hints used", "hints"),
               ("Gave up", "gave_up"))
    COLUMNS = ("word_hawaiian", "set_key", "mode", "min_frequency", "attempts", "incorrect", "hints",
               "gave_up", "retry_attempts", "words_seen", "first_try_correct_words")
    DIRECTION_AT = 4
    query = staticmethod(queries.word_difficulty)

    def label_of(self, row):
        return f"{row['word_hawaiian']} · {row['set_key']}/{row['mode']}/L{row['min_frequency']}"

    def title(self, filters):
        scope = "across all sets" if filters.set_key is None else f"in {filters.set_key}"
        return f"Hardest words {scope} (top 25)"
