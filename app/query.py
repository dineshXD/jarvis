"""
query.py — AI Query Service
==============================

WHAT DOES THIS MODULE DO?
    This is the "brain" of Jarvis. When a user asks a question:

    1. Search ChromaDB for the most relevant chunks (semantic search)
    2. Build a prompt with the chunks as context
    3. Send the prompt to Google Gemini (LLM)
    4. Return the answer + source URLs

    This is called RAG — Retrieval-Augmented Generation:
    - Retrieval: Find relevant documents from your vault
    - Augmented: Add them to the prompt as context
    - Generation: LLM generates an answer based on that context

    WHY RAG AND NOT JUST ASK THE LLM DIRECTLY?
    If you ask Gemini "What is consistent hashing?", it answers from
    its training data (generic internet knowledge).

    With RAG, you're saying: "Here's MY saved article about consistent
    hashing. Answer based on THIS specific content."

    This means:
    - Answers are grounded in YOUR curated content
    - No hallucinations (making up facts)
    - You can trace every answer back to a source URL

WHAT IS SEMANTIC SEARCH?
    Regular search: "Find documents containing the word 'memory'"
    Semantic search: "Find documents about the CONCEPT of memory"

    If you saved an article about "garbage collection in JVM" and ask
    "how does Java manage memory?", semantic search finds it because
    garbage collection IS memory management — even though the words
    don't match exactly.

    ChromaDB does this by converting text into vectors (arrays of numbers).
    Similar meanings → similar vectors → close together in vector space.
"""

import logging

from google import genai

from app.config import settings
from app.database import collection
from app.exceptions import AIServiceError, EmptyVaultError

logger = logging.getLogger(__name__)

# ── Initialize the Gemini Client ──────────────────────────────
# genai.Client connects to Google's Gemini API.
# The API key authenticates your requests (proves you're allowed to use it).
#
# WHY NOT CREATE THIS IN EACH FUNCTION CALL?
# Creating a client is expensive (establishes a network connection).
# Creating it once and reusing it is the "connection pooling" pattern.
# In Spring Boot, you'd do this with @Bean or dependency injection.
_gemini_client = None


def _get_gemini_client():
    """
    Lazy initialization of the Gemini client.

    WHY "LAZY"?
    We don't create the client when this module is imported.
    We create it the FIRST TIME someone calls ask_jarvis().

    Benefits:
    1. App starts faster (no API connection at startup)
    2. If nobody uses /query, we never connect to Gemini
    3. We can validate the API key at usage time, not import time

    This is the "Lazy Singleton" pattern.
    """
    global _gemini_client
    if _gemini_client is None:
        # Validate that the API key exists before trying to connect
        settings.validate()
        _gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
        logger.info("Gemini client initialized (model=%s)", settings.GEMINI_MODEL)
    return _gemini_client


# ── The System Prompt ─────────────────────────────────────────
# This tells the LLM HOW to behave. It's like giving instructions
# to a human assistant before they start working.
#
# Key instructions:
# 1. "Answer ONLY from the context" → don't use training data
# 2. "If not in context, say I don't know" → prevent hallucination
# 3. We could add more: "Use bullet points", "Cite sources", etc.
SYSTEM_PROMPT = """You are Jarvis, a personal knowledge assistant.
Answer the user's question ONLY using the provided context.
If the answer is not in the context, say "I don't have information about that in your vault."
Be concise and direct. Use bullet points for lists."""


def ask_jarvis(query: str) -> dict:
    """
    Answer a question using RAG (Retrieval-Augmented Generation).

    Args:
        query: The user's question.

    Returns:
        dict with:
        - "answer": The LLM's response text
        - "sources": List of unique source URLs with metadata
                     (ONLY from relevant chunks — filtered by distance)

    Raises:
        EmptyVaultError: If the vault has no documents to search.
        AIServiceError: If the Gemini API call fails.

    FLOW:
        1. Query ChromaDB for relevant chunks (semantic search)
        2. Filter results by distance (relevance threshold)
        3. Build context string from RELEVANT chunks only
        4. Send to Gemini with the system prompt
        5. Extract unique source URLs from RELEVANT chunks only
        6. Return answer + sources
    """

    # ── Step 1: Check if vault has any documents ──────────────
    vault_count = collection.count()
    if vault_count == 0:
        raise EmptyVaultError()

    # ── Step 2: Semantic search in ChromaDB ───────────────────
    # CRITICAL CHANGE: We now request "distances" in the include list.
    #
    # What is include=["documents", "metadatas", "distances"]?
    #   By default, ChromaDB returns documents and metadatas.
    #   We explicitly ask for "distances" too — this tells us HOW CLOSE
    #   each result is to our query vector.
    #
    #   Think of it like a GPS search for "nearest pizza":
    #   - Result 1: 0.3 km away (very close — definitely relevant)
    #   - Result 2: 0.8 km away (walkable — probably relevant)
    #   - Result 3: 15 km away (another city — NOT relevant)
    #
    #   Without distances, we'd show all 3 as "nearby pizza places".
    #   With distances + a threshold, we filter out the far-away one.
    n_results = min(settings.QUERY_N_RESULTS, vault_count)

    try:
        results = collection.query(
            query_texts=[query],
            n_results=n_results,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as e:
        logger.error("ChromaDB query failed: %s", e)
        raise AIServiceError(f"Database search failed: {e}")

    # ── Step 3: Filter by relevance (THE BUG FIX) ────────────
    # results["distances"][0] is a list of distance values, one per result.
    # Lower distance = more relevant.
    # We keep only results below the threshold.
    #
    # BEFORE (the bug):
    #   Question: "give latest blog from yash garg"
    #   ChromaDB returns: [chunk1 (dist=0.85), chunk2 (dist=1.32), chunk3 (dist=1.45)]
    #   We used ALL of them → showed all as sources even though most were irrelevant
    #
    # AFTER (the fix):
    #   Same results, threshold=1.0
    #   chunk1 (0.85) → KEEP (below threshold)
    #   chunk2 (1.32) → FILTER OUT (above threshold)
    #   chunk3 (1.45) → FILTER OUT (above threshold)
    #   Only chunk1's source is shown
    distances = results["distances"][0]
    documents = results["documents"][0]
    metadatas = results["metadatas"][0]

    # Build lists of only the relevant results
    relevant_docs = []
    relevant_metas = []
    for i, dist in enumerate(distances):
        if dist <= settings.RELEVANCE_THRESHOLD:
            relevant_docs.append(documents[i])
            relevant_metas.append(metadatas[i])

    logger.info(
        "Query='%s' → %d/%d chunks passed relevance filter (threshold=%.2f, distances=%s)",
        query[:50],
        len(relevant_docs),
        len(documents),
        settings.RELEVANCE_THRESHOLD,
        [round(d, 3) for d in distances],
    )

    # ── Step 4: Handle "nothing relevant" case ────────────────
    # If ALL results were filtered out, there's nothing relevant in the vault.
    # We still send the query to Gemini (it will say "I don't know"),
    # but we return ZERO sources — because none were relevant.
    if not relevant_docs:
        # No relevant content found. Still let the LLM respond
        # (it will say "I don't have info about that"), but don't
        # show any misleading sources.
        context = "(No relevant content found in the vault for this question.)"
    else:
        context = "\n\n---\n\n".join(relevant_docs)
        context = context[: settings.MAX_CONTEXT_LENGTH]

    # ── Step 5: Call Gemini API ───────────────────────────────
    prompt = f"""{SYSTEM_PROMPT}

Context from your vault:
{context}

Question: {query}"""

    try:
        client = _get_gemini_client()
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
        )
    except Exception as e:
        logger.error("Gemini API call failed: %s", e)
        raise AIServiceError(str(e))

    # ── Step 6: Extract unique sources (ONLY from relevant chunks) ──
    # This is the key difference from before:
    # Before: sources came from ALL ChromaDB results (including irrelevant ones)
    # After:  sources come from ONLY the relevant chunks (filtered by distance)
    seen = set()
    unique_sources = []
    for meta in relevant_metas:
        if meta["url"] not in seen:
            seen.add(meta["url"])
            unique_sources.append(
                {
                    "url": meta["url"],
                    "title": meta.get("title", meta["url"]),
                    "fed_at": meta.get("fed_at", ""),
                }
            )

    answer_text = response.text if response.text else "I couldn't generate an answer."
    logger.info("Answered query='%s' with %d sources", query[:50], len(unique_sources))

    return {"answer": answer_text, "sources": unique_sources}
