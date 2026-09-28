# ʻŌlelo Hawaiʻi: Hawaiian Language Learning App

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![Language](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Backend](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![Framework](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![ORM](https://img.shields.io/badge/SQLAlchemy-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white)
![Database](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Status](https://img.shields.io/badge/status-in%20progress-yellow?style=flat-square)

A web app for learning Hawaiian, with vocabulary organized by word type and category. Includes a searchable word bank, flashcards, and writing practice, backed by a Python/FastAPI API with user accounts, favorites, and saved study progress.

Vocabulary and language content is developed with Kennedi-Grace Magaoay, a linguistic anthropologist specializing in Austronesian languages.

**Live demo:** [learnhawaiian.netlify.app](https://learnhawaiian.netlify.app/)

Warning: I am planning to begin running a server on a raspberry pi but, until then, the server only runs locally so this is a static site demo

---

## Demos

### Home and Profile Pages Demo
![Word Bank Demo](assets/home-and-profile.gif)

### Flashcard Demo
![Flashcard Demo](assets/flashcard_demo.gif)

### Writing Practice Demo
![Writing Demo](assets/writing_practice_demo.gif)

### Word Bank Demo
![Word Bank Demo](assets/word_bank_demo.gif)

---

## Features

### Learning
- **Word Bank**: browse Hawaiian vocabulary organized by part of speech (nouns, verbs, adjectives, etc.), with categories and subcategories, and a Hawaiian/English toggle
    - **Word Search**: search through the entire list of words in Hawaiian or English
- **Flashcards**: study any word type, category, or set; flip, shuffle, and step through cards with keyboard shortcuts and a live progress bar
- **Writing Practice**: study any word type, category, or set; shuffle, reset, and practice translation word-by-word with a streak counter

### Progress Tracking
- **Save Progress**: save your place in any flashcard set and pick up on the same card later. Saving on the last card marks the set complete and removes it from your in-progress list
- **Favorites**: favorite any set from the flashcard page, stored per user on the backend

### Profile
- **Continue Learning**: every saved in-progress set, sorted by most recently studied, with a progress bar and a resume button that opens the set on the saved card
- **Favorited Sets Display**: all favorited sets with their word counts, each linking straight to that set's flashcards
- **Account Settings**: change username, email, or password (the current password is required to set a new one), or delete your account along with all of its saved data
### Accounts
- Register and log in with a username or email
- JWT-based authentication with bcrypt-hashed passwords

---

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript (vanilla, no frameworks)
- **Backend:** Python, FastAPI, SQLAlchemy, Pydantic
- **Database:** SQLite
- **Auth:** JWT tokens (python-jose), bcrypt password hashing

---

## Highlights

- **Vocabulary data pipeline:** a Python script parses a marked-up source file of words, sets, and categories into one JSON file per set, plus an index the frontend loads at startup. It also normalizes every character commonly typed in place of the ʻokina (straight and curly apostrophes, backticks) into the real ʻokina, so Hawaiian text matches exactly everywhere in the app.
- **Shared set-selection module:** a single module handles set browsing, category navigation, the word list, and Hawaiian/English toggles for every practice page. Each page registers its own callback for when the set changes, so new practice modes plug in without duplicating the selection logic.
- **Deep links into study sessions:** the profile page's Resume and Favorites links carry the set name (URL-encoded, since set names contain the kahakō and ʻokina) and the saved card number in the query string. The flashcards page reads them and opens that set on that card.
- **Progress tracking in one endpoint:** saving progress creates or updates a user's entry for a set, and saving on the last card removes it and reports the set as complete. Each user's data is scoped to their account through the JWT.
- **Fresh data on the back button:** pages listen for restores from the browser's back/forward cache. The profile reloads its lists, while the flashcards page refreshes only the favorite icon so the user keeps their place in the set.

---

## API Overview

All routes except `/register` and `/login` require a bearer token.

| Method | Route | Purpose |
|---|---|---|
| POST | `/register` | Create an account |
| POST | `/login` | Log in with username or email, returns a JWT |
| GET | `/signed-in-user` | Current user's username and email |
| POST | `/edit-user` | Change username and email |
| POST | `/edit-password` | Change password (verifies the current one) |
| POST | `/delete-account` | Delete the account and all of its data (verifies the password) |
| GET | `/favorites` | List favorited sets |
| POST | `/favorites` | Favorite or unfavorite a set |
| GET | `/continue-sets` | In-progress sets, most recent first |
| POST | `/continue-sets` | Save progress in a set, or mark it complete |
| GET | `/card-results` | Per-word correct/incorrect counts |
| POST | `/card-results` | Record a card result |
| POST | `/card-results-reset` | Reset all card results |

With the backend running, interactive docs are available at `http://127.0.0.1:8000/docs`.

---

## Running it locally

```bash
git clone https://github.com/NoahBKalma/hawaiian-language-website.git
cd hawaiian-language-website
```

**Backend:**
```bash
cd backend
pip install -r requirements.txt
```
Create a `.env` file in `backend/` with:
```
SECRET_KEY=your-random-secret-here
```
Then run:
```bash
uvicorn main:app --reload
```
This starts the API at `http://127.0.0.1:8000` and creates `hawaiian.db` on first run.

**Frontend:**
Serve the project root with any static file server (e.g. VS Code's Live Server extension) and open `index.html`. The frontend talks to the backend at `http://127.0.0.1:8000` by default (see `scripts/config.js`).

If you use Live Server, add `"**/*.db"` and `"**/*.db-journal"` to `liveServer.settings.ignoreFiles` in your VS Code settings. Otherwise the page reloads every time the database is written to.

---

## Project Structure

```
backend/       FastAPI app: auth, database models, schemas, API routes
scripts/       Frontend JS, one file per page/feature
components/    Reusable custom elements (header, nav, set selection, word bank display)
pages/         HTML pages
styles/        CSS
assets/        Icons, images, and dictionary PDFs
```

---

## Status

This site is actively in development. Browsing, flashcards, writing practice, accounts, favorites, saved progress, the profile page, and account management are working. Next up (not in order): spaced repetition using per-word results, quizzes, and lessons.

A static frontend demo is live at the link above. The backend (accounts, favorites, progress) currently runs locally only; deployment to a self-hosted Raspberry Pi is planned.