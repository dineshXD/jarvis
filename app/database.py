"""
database.py — Single Database Connection
==========================================

WHY THIS FILE EXISTS:
    Before this file, BOTH feed.py and query.py created their own
    ChromaDB client:

        # feed.py
        client = chromadb.PersistentClient(path="./jarvis.db")
        collection = client.get_or_create_collection("jarvis")

        # query.py
        db = chromadb.PersistentClient(path="./jarvis.db")
        collection = db.get_or_create_collection("jarvis")

    This is a problem because:
    1. Two clients pointing to the same file can cause lock conflicts
    2. If you change the DB path, you have to change it in TWO places
    3. If you add a new file that needs DB access, you'd create ANOTHER client

    The fix: Create ONE client in ONE file, and import it everywhere.

    This is the "Singleton Pattern" — ensure only one instance exists.
    In Spring Boot, this would be a @Bean in a @Configuration class.
    Spring handles this automatically with dependency injection.
    In Python, we do it manually by creating the instance at module level.

WHAT IS CHROMADB?
    ChromaDB is a "vector database". Normal databases search by exact match:
        SELECT * FROM users WHERE name = 'Dinesh'

    Vector databases search by MEANING:
        collection.query(query_texts=["How does Rust handle memory?"])
        → Returns documents about memory management, even if they don't
          contain the exact words "Rust handle memory"

    It does this by converting text into vectors (arrays of numbers).
    Similar meanings → similar vectors → found by "nearest neighbor" search.
"""

import logging

import chromadb

from app.config import settings

# ── Logging Setup ─────────────────────────────────────────────
# WHY LOGGING INSTEAD OF print()?
#
# print() problems:
#   1. No timestamps — "Fed 5 chunks" but WHEN?
#   2. No severity levels — is this info? a warning? an error?
#   3. Can't be turned off — print() always prints
#   4. Can't be redirected — always goes to stdout
#
# logging solves all of these:
#   logger.info("Fed 5 chunks")   → [2026-04-11 14:30:00] INFO: Fed 5 chunks
#   logger.error("DB failed")     → [2026-04-11 14:30:01] ERROR: DB failed
#   logger.debug("chunk details") → Only shows if you set level to DEBUG
#
# In Spring Boot, you'd use: private static final Logger log = LoggerFactory.getLogger(...)
# In Python, it's: logger = logging.getLogger(__name__)
logger = logging.getLogger(__name__)

# ── Create the single database connection ─────────────────────
#
# chromadb.PersistentClient:
#   - Saves data to disk (survives server restarts)
#   - Path is where the files are stored
#   - This is like setting spring.datasource.url in Spring Boot
#
# chromadb.Client() (without Persistent):
#   - Stores everything in RAM only
#   - Data is LOST when the server stops
#   - Fast but useless for production
try:
    client = chromadb.PersistentClient(path=settings.CHROMADB_PATH)
    collection = client.get_or_create_collection(settings.COLLECTION_NAME)
    logger.info(
        "ChromaDB connected — path=%s, collection=%s",
        settings.CHROMADB_PATH,
        settings.COLLECTION_NAME,
    )
except Exception as e:
    # If DB fails to connect, the entire app should crash immediately.
    # This is "fail fast" — don't let the app start in a broken state.
    logger.critical("Failed to connect to ChromaDB: %s", e)
    raise
