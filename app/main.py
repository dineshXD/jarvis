"""
main.py — FastAPI Application Entry Point
============================================

WHAT IS FastAPI?
    FastAPI is a Python web framework for building APIs.
    Think of it as the Python equivalent of Spring Boot, but lighter.

    Spring Boot:
        @RestController
        @GetMapping("/list")
        public ResponseEntity<List<Entry>> listEntries() { ... }

    FastAPI:
        @app.get("/list")
        def list_entries():
            return {"entries": [...]}

    Key differences from Spring Boot:
    - No annotations on classes (Python uses decorators @app.get)
    - No explicit ResponseEntity (FastAPI auto-converts dicts to JSON)
    - No beans/DI container (Python uses module-level imports)
    - No application.properties (Python uses .env + config.py)

FILE STRUCTURE OVERVIEW:
    This file is the "Controller layer" in Spring Boot terms.
    It ONLY handles:
    1. Defining routes (endpoints)
    2. Parsing request parameters
    3. Calling service functions
    4. Returning responses

    It does NOT contain business logic (that's in feed.py, query.py).

HOW TO RUN:
    uvicorn app.main:app --reload

    This tells Uvicorn (the server) to:
    - Look in the 'app' package (directory)
    - Find the 'main' module (this file)
    - Use the 'app' variable (the FastAPI instance below)
    - --reload: restart on code changes (dev only!)

SWAGGER DOCS:
    FastAPI automatically generates API documentation!
    Start the server and visit:
    - http://localhost:8000/docs → Interactive Swagger UI
    - http://localhost:8000/redoc → Alternative docs format
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import collection
from app.exceptions import register_exception_handlers
from app.feed import delete_url, feed
from app.query import ask_jarvis
from app.schemas import (
    DeleteResponse,
    FeedResponse,
    HealthResponse,
    ListResponse,
    QueryResponse,
    URLRequest,
    EntryInfo,
)

# ── Logging Configuration ────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Lifespan Context Manager ─────────────────────────────────
# WHAT IS THIS?
#   The lifespan replaces the deprecated @app.on_event("startup") and
#   @app.on_event("shutdown") decorators.
#
#   It's an async context manager — the same pattern as:
#       async with open("file") as f:
#           # use f here
#       # f is automatically closed after
#
#   Everything BEFORE `yield` runs at startup (like @PostConstruct).
#   Everything AFTER `yield` runs at shutdown (like @PreDestroy).
#   The `yield` is where the server lives and handles requests.
#
# WHY IS THIS BETTER THAN on_event?
#   1. GUARANTEED CLEANUP: Code after yield ALWAYS runs, even on crashes.
#      With on_event("shutdown"), if the app crashes, shutdown might not run.
#
#   2. SHARED RESOURCES: You can pass objects from startup to shutdown.
#      Example: Open a DB connection before yield, close it after yield.
#      With on_event, you'd need a global variable.
#
#   3. SINGLE FUNCTION: Startup + shutdown logic in one place.
#      Easier to see what resources are opened and closed.
#
# IN SPRING BOOT, this would be:
#   @Bean
#   public CommandLineRunner onStartup() { return args -> { ... }; }
#   @PreDestroy
#   public void onShutdown() { ... }
#
# The @asynccontextmanager decorator converts an async generator function
# (a function with `yield`) into a context manager.
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown logic."""
    # ── STARTUP ───────────────────────────────────────────────
    # This code runs ONCE when the server starts.
    count = collection.count()
    logger.info("=" * 50)
    logger.info("Jarvis API started")
    logger.info("Database: %s", settings.CHROMADB_PATH)
    logger.info("Collection: %s (%d chunks)", settings.COLLECTION_NAME, count)
    logger.info("CORS origins: %s", settings.CORS_ORIGINS)
    logger.info("Relevance threshold: %.2f", settings.RELEVANCE_THRESHOLD)
    logger.info("Docs: http://localhost:8000/docs")
    logger.info("=" * 50)

    yield  # ← Server runs here, handling requests

    # ── SHUTDOWN ──────────────────────────────────────────────
    # This code runs ONCE when the server stops.
    # Use this to close database connections, flush logs,
    # save state, etc.
    logger.info("Jarvis API shutting down...")
    logger.info("Goodbye!")


# ── Create the FastAPI App ────────────────────────────────────
# The lifespan parameter connects our startup/shutdown logic.
# This replaces the old app.on_event("startup") decorator.
app = FastAPI(
    title="Jarvis API",
    description="Personal knowledge vault — feed URLs, ask questions, get answers.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS Middleware ───────────────────────────────────────────
# CORS = Cross-Origin Resource Sharing
#
# WHAT IS CORS?
# When your frontend (localhost:3000) calls your backend (localhost:8000),
# the browser blocks the request by default because the "origins" are different.
# This is a SECURITY feature to prevent malicious websites from calling
# YOUR API with YOUR cookies.
#
# CORS headers tell the browser: "It's OK, I trust this origin."
#
# allow_origins=["*"] means "trust ALL origins" — fine for development.
# In production, set this to your frontend's domain:
#   allow_origins=["https://jarvis.yourdomain.com"]
#
# In Spring Boot, this is:
#   @CrossOrigin(origins = "http://localhost:3000")
#   or WebMvcConfigurer.addCorsMappings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register Exception Handlers ──────────────────────────────
# This hooks up our custom exceptions (from exceptions.py) to
# return proper HTTP status codes instead of always returning 200.
register_exception_handlers(app)


# ══════════════════════════════════════════════════════════════
# ROUTES (ENDPOINTS)
# ══════════════════════════════════════════════════════════════


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["System"],
    summary="Health check",
)
def health_check():
    """
    Check if the API is running and the database is connected.

    WHY A HEALTH CHECK ENDPOINT?
    1. Monitoring tools (like Kubernetes) ping this to know if the app is alive
    2. Your frontend can call this to check if the backend is up
    3. Load balancers use it to route traffic away from unhealthy instances

    In Spring Boot, this is Spring Boot Actuator's /actuator/health endpoint.
    """
    try:
        count = collection.count()
        return HealthResponse(
            status="healthy",
            database="connected",
            entries_count=count,
        )
    except Exception:
        return HealthResponse(
            status="unhealthy",
            database="disconnected",
            entries_count=0,
        )


@app.post(
    "/feed",
    response_model=FeedResponse,
    tags=["Vault"],
    summary="Feed a URL into the vault",
)
def feed_url(request: URLRequest):
    """
    Scrape a website and store its content in the knowledge vault.

    The URL content is:
    1. Scraped (HTML → plain text)
    2. Chunked (split into ~1000 char pieces)
    3. Stored in ChromaDB with metadata (title, date, URL)

    Raises:
        409: URL already exists in the vault
        422: Website couldn't be scraped
    """
    # feed() handles all the logic. If something goes wrong,
    # it raises URLAlreadyExistsError or ScrapingError which
    # are caught by our exception handlers (exceptions.py).
    chunks_count = feed(request.url)
    return FeedResponse(
        status="success",
        message=f"Successfully fed {request.url}",
        chunks_count=chunks_count,
    )


@app.get(
    "/query",
    response_model=QueryResponse,
    tags=["AI"],
    summary="Ask Jarvis a question",
)
def query_vault(question: str):
    """
    Ask a question and get an AI-generated answer based on vault content.

    Uses RAG (Retrieval-Augmented Generation):
    1. Searches ChromaDB for relevant chunks
    2. Sends them as context to Gemini
    3. Returns the answer with source references

    Args:
        question: The question to ask (as a query parameter).
                  Example: /query?question=What is consistent hashing?

    WHY GET AND NOT POST?
    GET requests are for "reading" data (idempotent — same request = same result).
    POST requests are for "creating" data (non-idempotent — side effects).

    Asking a question doesn't modify anything, so GET is semantically correct.
    GET also allows the URL to be bookmarked/shared:
        /query?question=What+is+consistent+hashing

    In Spring Boot, this would be:
        @GetMapping("/query")
        public QueryResponse query(@RequestParam String question) { ... }
    """
    result = ask_jarvis(question)
    return QueryResponse(
        status="success",
        answer=result["answer"],
        sources=result["sources"],
    )


@app.get(
    "/list",
    response_model=ListResponse,
    tags=["Vault"],
    summary="List all entries in the vault",
)
def list_entries():
    """
    Get all unique URLs stored in the vault with their metadata and excerpts.

    Excerpts are generated from the first chunk of each URL's content,
    truncated to ~200 characters. This gives cards a meaningful preview.
    """
    # include=["documents", "metadatas"] fetches both text AND metadata.
    # Before we only fetched metadatas — excerpts were always empty.
    results = collection.get(include=["documents", "metadatas"])
    entries = []
    seen = set()

    docs = results.get("documents") or []
    metas = results.get("metadatas") or []

    for i, meta in enumerate(metas):
        url = meta.get("url", "")
        if not url or url in seen:
            continue
        seen.add(url)

        try:
            source = url.split("/")[2]
        except IndexError:
            source = url

        # Generate excerpt from the first chunk of this URL.
        # We take the first 200 chars and add "..." if truncated.
        excerpt = ""
        if i < len(docs) and docs[i]:
            raw = docs[i].strip()
            excerpt = raw[:200] + ("..." if len(raw) > 200 else "")

        entries.append(
            EntryInfo(
                url=url,
                title=meta.get("title", url),
                date=meta.get("fed_at", ""),
                source=source,
                type="blog",
                excerpt=excerpt,
            )
        )

    return ListResponse(status="success", entries=entries)


@app.delete(
    "/delete",
    response_model=DeleteResponse,
    tags=["Vault"],
    summary="Delete a URL from the vault",
)
def delete_entry(url: str):
    """
    Delete all chunks for a specific URL from the vault.

    Args:
        url: The URL to delete (as a query parameter).
             Example: /delete?url=https://example.com/blog

    Raises:
        404: URL not found in the vault
    """
    count = delete_url(url)
    return DeleteResponse(
        status="success",
        message=f"Deleted {count} chunks for {url}",
    )


@app.get(
    "/search",
    response_model=ListResponse,
    tags=["Vault"],
    summary="Search entries by title or URL",
)
def search_entries(q: str = ""):
    """
    Search vault entries by title or URL substring (case-insensitive).
    Includes excerpts from content.
    """
    if not q.strip():
        return ListResponse(status="success", entries=[])

    results = collection.get(include=["documents", "metadatas"])
    entries = []
    seen = set()
    query_lower = q.strip().lower()

    docs = results.get("documents") or []
    metas = results.get("metadatas") or []

    for i, meta in enumerate(metas):
        url = meta.get("url", "")
        if not url or url in seen:
            continue

        title = meta.get("title", url)
        if query_lower in title.lower() or query_lower in url.lower():
            seen.add(url)
            try:
                source = url.split("/")[2]
            except IndexError:
                source = url

            excerpt = ""
            if i < len(docs) and docs[i]:
                raw = docs[i].strip()
                excerpt = raw[:200] + ("..." if len(raw) > 200 else "")

            entries.append(
                EntryInfo(
                    url=url,
                    title=title,
                    date=meta.get("fed_at", ""),
                    source=source,
                    type="blog",
                    excerpt=excerpt,
                )
            )

    return ListResponse(status="success", entries=entries)

