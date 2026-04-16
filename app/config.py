"""
config.py — Centralized Configuration
======================================

WHY THIS FILE EXISTS:
    Before this file, settings were scattered everywhere:
    - "./jarvis.db" hardcoded in feed.py AND query.py
    - GEMINI_API_KEY loaded in query.py
    - chunk_size=1000 hardcoded in feed.py

    This is a problem because:
    1. If you want to change the DB path, you'd have to find and edit multiple files
    2. If you deploy to a server, you can't change settings without editing code
    3. Different environments (dev, staging, prod) need different settings

    With this file, ALL settings live in ONE place, loaded from environment
    variables (so you can change them without touching code).

HOW IT WORKS:
    We use Python's os.environ to read environment variables.
    If the variable isn't set, we use a default value.

    Example:
        In your .env file:       CHROMADB_PATH=./production.db
        In your code:             from app.config import settings
                                  print(settings.CHROMADB_PATH)  # → "./production.db"

    If .env doesn't have CHROMADB_PATH:
                                  print(settings.CHROMADB_PATH)  # → "./jarvis.db" (default)

PRODUCTION TIP:
    In Spring Boot you have application.properties / application.yml.
    In Python, the equivalent is a .env file + a config module like this.
    In Node.js, it's .env + process.env.
    Same concept, different syntax.
"""

import os

from dotenv import load_dotenv

# load_dotenv() reads the .env file in the project root and puts
# all key=value pairs into os.environ. This is the Python equivalent
# of Spring Boot's @Value("${property.name}") annotation.
load_dotenv()


class Settings:
    """
    All application settings in one place.

    WHY A CLASS AND NOT JUST VARIABLES?
        1. Groups related settings together (like a Java DTO/config class)
        2. You can add validation logic (e.g., raise error if API key is missing)
        3. Easy to pass around: just do `from app.config import settings`
        4. In tests, you can create a different Settings instance with test values

    In Spring Boot, this would be a @ConfigurationProperties class.
    """

    def __init__(self):
        # ── Database ──────────────────────────────────────────────
        # Path where ChromaDB stores its data files.
        # ChromaDB is a vector database — it stores text as mathematical
        # vectors (embeddings) so you can search by meaning, not just keywords.
        self.CHROMADB_PATH: str = os.getenv("CHROMADB_PATH", "./jarvis.db")

        # The name of the ChromaDB collection (like a "table" in SQL).
        self.COLLECTION_NAME: str = os.getenv("COLLECTION_NAME", "jarvis")

        # ── AI / Gemini ───────────────────────────────────────────
        # Your Google Gemini API key. This MUST be set in .env file.
        # Without this, the /query endpoint won't work.
        self.GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
        self.GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

        # ── Web Scraping ──────────────────────────────────────────
        # How many seconds to wait before giving up on a website.
        # Without a timeout, requests.get() waits FOREVER if the site is slow.
        # This is a common production bug — your server hangs because one
        # request is waiting on a dead website.
        self.SCRAPER_TIMEOUT: int = int(os.getenv("SCRAPER_TIMEOUT", "15"))

        # Minimum text length to consider a page "valid".
        # Pages with less text than this are probably error pages or paywalls.
        self.MIN_CONTENT_LENGTH: int = int(os.getenv("MIN_CONTENT_LENGTH", "500"))

        # ── Text Chunking ────────────────────────────────────────
        # When we feed a website, we split the text into chunks.
        # WHY? Because:
        # 1. ChromaDB has a limit on document size
        # 2. Smaller chunks = more precise search results
        # 3. LLMs have a context window limit
        #
        # chunk_size=1000 means each chunk is ~1000 characters (roughly 200 words)
        # chunk_overlap=200 means chunks overlap by 200 chars, so context isn't lost
        # at chunk boundaries. Think of it like a sliding window:
        #
        #   Text: [AAAAAAAAAA|BBBBBBBBBB|CCCCCCCCCC]
        #   Chunk 1: [AAAAAAAAAA|BB]        (1000 chars + 200 overlap)
        #   Chunk 2: [BB|BBBBBBBB|CC]       (200 from prev + 800 new + 200 overlap)
        #   Chunk 3: [CC|CCCCCCCC]          (200 from prev + rest)
        self.CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "1000"))
        self.CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "200"))

        # ── CORS ─────────────────────────────────────────────────
        # Which frontend URLs are allowed to call this API.
        # "*" means "anyone" — fine for development, dangerous for production.
        # In production, set this to your actual frontend URL like:
        #   CORS_ORIGINS=https://jarvis.yourdomain.com
        cors_origins = os.getenv("CORS_ORIGINS", "*")
        self.CORS_ORIGINS: list[str] = (
            ["*"] if cors_origins == "*" else cors_origins.split(",")
        )

        # ── Query Settings ────────────────────────────────────────
        # How many chunks to retrieve from ChromaDB when answering a question.
        # More chunks = more context for the LLM, but also more noise.
        # 2 is a good starting point for focused answers.
        self.QUERY_N_RESULTS: int = int(os.getenv("QUERY_N_RESULTS", "5"))

        # Maximum characters of context to send to Gemini.
        # Gemini 2.5 Flash has a huge context window, but sending too much
        # text costs more money and may dilute the answer.
        self.MAX_CONTEXT_LENGTH: int = int(
            os.getenv("MAX_CONTEXT_LENGTH", "20000")
        )

        # ── Relevance Filtering ───────────────────────────────────
        # ChromaDB uses "distance" to measure how similar two vectors are.
        # Distance = how far apart two meanings are in vector space.
        #
        #   distance ≈ 0.0  → nearly identical meaning (very relevant)
        #   distance ≈ 0.5  → related topic (probably relevant)
        #   distance ≈ 1.0  → loosely related (borderline)
        #   distance ≈ 1.5+ → unrelated (noise, should be filtered out)
        #
        # THE BUG WE'RE FIXING:
        #   ChromaDB ALWAYS returns N results, even if none are relevant.
        #   It's "nearest neighbor" search — it finds the N CLOSEST vectors,
        #   even if the closest one is still very far away.
        #
        #   Without this threshold, when you ask "what's the weather?" and your
        #   vault has no weather info, ChromaDB still returns 5 random chunks.
        #   The LLM correctly says "I don't know", but we still show those
        #   random chunks as "sources" — which is misleading.
        #
        #   With this threshold, we filter out any chunk whose distance is
        #   above 1.0, so only truly relevant sources are shown.
        #
        # TUNING GUIDE:
        #   Lower value (0.7) = stricter, fewer but more precise sources
        #   Higher value (1.5) = looser, more sources but risk showing noise
        #   Start at 1.0 and adjust based on your results.
        self.RELEVANCE_THRESHOLD: float = float(
            os.getenv("RELEVANCE_THRESHOLD", "1.0")
        )

    def validate(self):
        """
        Check that critical settings are properly configured.
        Call this at startup to fail fast if something is wrong.

        PRODUCTION PATTERN: "Fail fast, fail loud"
        It's better to crash at startup with a clear error message than to
        crash at runtime when a user hits the /query endpoint.
        """
        if not self.GEMINI_API_KEY:
            raise ValueError(
                "GEMINI_API_KEY is not set! "
                "Add it to your .env file: GEMINI_API_KEY=your-key-here"
            )


# Create a single instance that the entire app imports.
# This is the "Singleton pattern" — only one Settings object exists.
#
# Usage in other files:
#   from app.config import settings
#   print(settings.CHROMADB_PATH)
settings = Settings()
