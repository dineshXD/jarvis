"""
feed.py — Feed & Delete Operations (Service Layer)
====================================================

WHAT IS A "SERVICE LAYER"?
    In Spring Boot, you separate your code into layers:
        Controller → Service → Repository

    - Controller (main.py): Handles HTTP requests/responses
    - Service (this file): Contains business logic
    - Repository (database.py): Handles database operations

    feed.py is the "Service layer" — it contains the BUSINESS LOGIC
    for feeding URLs and deleting entries. It doesn't know about
    HTTP or JSON — it just works with Python objects.

WHAT DOES "FEEDING" MEAN?
    1. Scrape the website (get the text content)
    2. Split the text into chunks (pieces small enough for the LLM)
    3. Store each chunk in ChromaDB with metadata

    Later, when you ask a question, ChromaDB searches these chunks
    by meaning and returns the most relevant ones.

WHAT IS TEXT CHUNKING?
    Imagine you have a 10,000 word blog post. If you store it as ONE document:
    - ChromaDB's search has to match the ENTIRE document
    - If the answer is in paragraph 47, the other 9,900 words are noise
    - The LLM gets flooded with irrelevant context

    If you split it into 10 chunks of 1,000 chars:
    - ChromaDB can find the EXACT chunk that answers your question
    - The LLM gets focused, relevant context
    - Answers are more accurate

    RecursiveCharacterTextSplitter splits intelligently:
    - First tries to split at paragraph breaks (\n\n)
    - Then at sentence breaks (\n)
    - Then at spaces
    - Only splits mid-word as a last resort
"""

import logging
from datetime import date

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings
from app.database import collection
from app.exceptions import EntryNotFoundError, URLAlreadyExistsError
from app.scraper import read_website

logger = logging.getLogger(__name__)


def feed(url: str, silent: bool = False) -> int:
    """
    Scrape a website, chunk its text, and store in ChromaDB.

    Args:
        url: The URL to scrape and store.
        silent: If True, skip silently if URL already exists.
                If False, raise an error.

    Returns:
        The number of chunks that were stored.

    Raises:
        URLAlreadyExistsError: If the URL is already in the vault.
        ScrapingError: If the website can't be read (from scraper.py).

    STEP-BY-STEP FLOW:
        1. Check if URL already exists in ChromaDB
        2. Scrape the website (calls scraper.py)
        3. Split text into chunks
        4. Store all chunks in ChromaDB with metadata
        5. Return the number of chunks stored
    """

    # ── Step 1: Check for duplicates ──────────────────────────
    # collection.get(where={"url": url}) searches ALL documents
    # whose "url" metadata field matches the given URL.
    #
    # WHY "where" AND NOT "ids"?
    # Because each chunk has a unique ID like "https://example.com_0",
    # "https://example.com_1", etc. We can't query by URL using IDs.
    # The "where" filter searches metadata fields instead.
    existing = collection.get(where={"url": url})

    # existing["ids"] is a list of matching document IDs.
    # If it's not empty, the URL was already fed.
    if existing["ids"]:
        if silent:
            logger.debug("Skipping %s — already exists", url)
            return 0
        raise URLAlreadyExistsError(url)

    # ── Step 2: Scrape the website ────────────────────────────
    # read_website() is in scraper.py. It handles all the HTTP
    # and HTML parsing logic. If it fails, it raises ScrapingError
    # which our exception handler in main.py will catch.
    text, title = read_website(url)

    # ── Step 3: Split into chunks ─────────────────────────────
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
    )
    chunks = text_splitter.split_text(text)

    if not chunks:
        # This shouldn't happen if MIN_CONTENT_LENGTH is set properly,
        # but defensive programming never hurts.
        logger.warning("No chunks generated from %s", url)
        return 0

    # ── Step 4: Store in ChromaDB ─────────────────────────────
    # collection.add() stores multiple documents at once.
    #
    # Parameters:
    # - documents: The text chunks. ChromaDB will automatically
    #   convert these to vectors (embeddings) for similarity search.
    #
    # - ids: Unique identifier for each chunk. We use "{url}_{index}"
    #   so we can find all chunks for a URL and delete them together.
    #
    # - metadatas: Extra info stored alongside each chunk.
    #   When we query, ChromaDB returns these metadata fields
    #   so we can show "Source: example.com" in the UI.
    today = str(date.today())
    collection.add(
        documents=chunks,
        ids=[f"{url}_{i}" for i in range(len(chunks))],
        metadatas=[
            {"url": url, "title": title, "fed_at": today}
            for _ in chunks
        ],
    )

    logger.info("Fed %d chunks from %s (title='%s')", len(chunks), url, title)
    return len(chunks)


def delete_url(url: str) -> int:
    """
    Delete all chunks for a given URL from ChromaDB.

    Args:
        url: The URL whose chunks should be deleted.

    Returns:
        The number of chunks that were deleted.

    Raises:
        EntryNotFoundError: If no chunks exist for this URL.

    WHY DELETE ALL CHUNKS?
    When we fed the URL, we split it into multiple chunks.
    To fully remove a URL, we need to delete ALL its chunks.
    """
    results = collection.get(where={"url": url})

    if not results["ids"]:
        raise EntryNotFoundError(url)

    # Delete all chunks by their IDs
    collection.delete(ids=results["ids"])
    count = len(results["ids"])

    logger.info("Deleted %d chunks for %s", count, url)
    return count
