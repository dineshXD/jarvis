# Jarvis — Personal Knowledge Vault

A personal knowledge management system that lets you save web content, search through it, and ask AI-powered questions about your saved knowledge.

## Architecture

```
Frontend (Next.js 16)  →  Backend (FastAPI)  →  ChromaDB (Vector DB)
     :3000                    :8000                   + Gemini AI
```

## Features

- **Feed URLs** — Scrape and store any web page
- **Smart Search** — Filter entries by title/URL/source
- **AI Chat** — Ask questions about your saved content (RAG)
- **Chat History** — Persistent conversations with search (Ctrl+K)
- **Dark Mode** — Eye-friendly dark theme

## Quick Start

### Backend
```bash
cd jarvis
python -m venv venv
.\venv\Scripts\activate        # Windows
source venv/bin/activate       # Mac/Linux
pip install -r requirements.txt
cp .env.example .env           # Add your GEMINI_API_KEY
uvicorn app.main:app --reload
```

### Frontend
```bash
cd jarvis/frontend
npm install
cp .env.example .env.local
npm run dev
```

Visit:
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, Vanilla CSS |
| Backend | Python, FastAPI, Pydantic |
| Database | ChromaDB (vector database) |
| AI | Google Gemini 2.5 Flash |
| Scraping | BeautifulSoup, requests |
