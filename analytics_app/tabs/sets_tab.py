from .. import queries
from .difficulty import DifficultyTab


class SetsTab(DifficultyTab):
    METRICS = (("First-pass incorrect rate", "first_pass_incorrect_rate"),
               ("Incorrect answers", "incorrect"),
               ("Hints used", "hints"))
    COLUMNS = ("set_key", "mode", "min_frequency", "attempts", "correct", "incorrect", "hints",
               "retry_attempts", "words_seen", "first_try_correct_words", "first_pass_incorrect_rate",
               "distinct_visitors", "distinct_accounts")
    DIRECTION_AT = 3
    query = staticmethod(queries.set_difficulty)

    def label_of(self, row):
        return f"{row['set_key']} · {row['mode']} · L{row['min_frequency']}"

    def title(self, filters):
        return "Hardest sets (top 25)"
