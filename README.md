# ʻŌlelo Hawaiʻi: Hawaiian Language Learning App

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![Language](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Backend](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![Framework](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Status](https://img.shields.io/badge/status-in%20progress-yellow?style=flat-square)

This project is a web app for learning Hawaiian, with vocabulary organized by word type and categories. It currently contains a word bank and a flashcard system. This is also my first project working with HTML, CSS, and JavaScript, built full-stack with a Python/FastAPI backend for accounts and saved progress.

Vocabulary and language content developed with Kennedi-Grace Magaoay a linguistic anthropologist specializing in Austronesian Languages.

<!--
Vocabulary and language content developed with [Kennedi-Grace Magaoay](https://www.linkedin.com/in/INSERT KENNEDI LINKEDIN/) a linguistic anthropologist specializing in Austronesian Languages.
-->

---

## Demo

![Demo](demo.gif)

---

## Features

- **Word Bank**: browse Hawaiian vocabulary organized by part of speech (nouns, verbs, adjectives, etc.), with categories and subcategories, and a Hawaiian/English toggle
- **Flashcards**: study any word type, category, or set; flip, shuffle, and step through cards, with a live progress bar
- **Accounts**: register/login with JWT-based authentication and bcrypt-hashed passwords
- **Favorites**: save specific sets to revisit later, stored per-user on the backend
- *(Planned)*: per-word correct/incorrect tracking for spaced repetition

---

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript (vanilla, no frameworks)
- **Backend:** Python, FastAPI, SQLAlchemy
- **Database:** SQLite
- **Auth:** JWT tokens, bcrypt password hashing

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
This starts the API at `http://127.0.0.1:8000`.

**Frontend:**
Serve the project root with any static file server (e.g. VS Code's Live Server extension) and open `index.html`. The frontend talks to the backend at `http://127.0.0.1:8000` by default (see `scripts/config.js`).

---

## Project Structure

```
backend/       FastAPI app — auth, database models, API routes
scripts/       Frontend JS — one file per page/feature
components/    Reusable custom elements (header, nav, word bank display)
pages/         HTML pages
styles/        CSS
assets/        Icons and images
```

---

## Status

Actively in development. Core browsing, flashcards, accounts, and favorites all work. Set and word-specific progress tracking is hopefully soon to come. Not yet deployed live, currently able to be developed and run locally for testing. Eventually, I want to run it on a pi hooked up to my basic homelab setup.