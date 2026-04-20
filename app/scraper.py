"""
scraper.py — Web Scraping Module (with JS Fallback)
=====================================================

TWO-STAGE SCRAPING STRATEGY:
    Stage 1: Direct scrape with requests + BeautifulSoup (fast, ~1 second)
        → Works for: blogs, documentation, static sites, wikis
        → Fails for: React/Next.js/Vue apps, SPAs, paywall sites

    Stage 2: Jina Reader API fallback (slower, ~3-5 seconds)
        → Free API: https://r.jina.ai/{url}
        → Renders JavaScript, returns clean Markdown
        → Works for: React apps, SPAs, JS-heavy sites
        → No API key required for basic usage

    WHY TWO STAGES?
    Most websites are static HTML — scraping them directly is instant.
    Only ~20% of sites need JS rendering. Running a headless browser
    (Playwright/Selenium) for EVERY URL would be slow and heavy.

    By trying the fast path first and falling back to Jina only when
    needed, we get the best of both worlds: speed + compatibility.

    This is the CIRCUIT BREAKER pattern — try the cheap option first,
    escalate only when it fails.
"""

import logging
import re

import requests
from bs4 import BeautifulSoup

from app.config import settings
from app.exceptions import ScrapingError

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

TAGS_TO_REMOVE = ["script", "style", "nav", "footer", "header", "aside", "noscript"]

# Jina Reader API — free service that renders JS and returns Markdown.
# No API key needed. Just prepend this to any URL.
# Example: https://r.jina.ai/https://www.0de5.net/explore
JINA_READER_PREFIX = "https://r.jina.ai/"


def read_website(url: str) -> tuple[str, str]:
    """
    Fetch a website and extract its text content and title.

    Uses a two-stage approach:
    1. Try direct scraping (fast, works for static sites)
    2. If that fails, fall back to Jina Reader (handles JS-rendered sites)

    Args:
        url: The URL to scrape.

    Returns:
        A tuple of (text_content, page_title).

    Raises:
        ScrapingError: If both scraping methods fail.
    """

    # ── Stage 1: Direct scrape ────────────────────────────────
    try:
        text, title = _direct_scrape(url)
        logger.info("Direct scrape succeeded: %s (%d chars)", url, len(text))
        return text, title
    except ScrapingError as e:
        logger.info(
            "Direct scrape failed for %s (%s), trying Jina Reader fallback...",
            url,
            e.reason,
        )

    # ── Stage 2: Jina Reader fallback ─────────────────────────
    logger.info("Calling Jina Reader for %s ...", url)
    try:
        text, title = _jina_scrape(url)
        logger.info("Jina Reader succeeded: %s (%d chars)", url, len(text))
        return text, title
    except ScrapingError as e:
        logger.warning("Jina Reader also failed for %s: %s", url, e.reason)
        raise
    except Exception as e:
        logger.error("Jina Reader unexpected error for %s: %s", url, e)
        raise ScrapingError(
            url,
            "Could not scrape this page. It may be a JavaScript-heavy app, "
            "behind a paywall, or blocking scrapers.",
        )


def _direct_scrape(url: str) -> tuple[str, str]:
    """
    Stage 1: Scrape directly with requests + BeautifulSoup.
    Fast (~1s) but can't execute JavaScript.
    """

    # ── Fetch the page ────────────────────────────────────────
    try:
        response = requests.get(
            url,
            timeout=(5, settings.SCRAPER_TIMEOUT),
            headers={"User-Agent": USER_AGENT},
            allow_redirects=True,
        )
    except requests.Timeout:
        raise ScrapingError(url, "Website took too long to respond (timeout)")
    except requests.ConnectionError:
        raise ScrapingError(url, "Could not connect to the website")
    except requests.RequestException as e:
        raise ScrapingError(url, str(e))

    if response.status_code != 200:
        raise ScrapingError(
            url, f"Website returned HTTP {response.status_code}"
        )

    # ── Parse HTML ────────────────────────────────────────────
    soup = BeautifulSoup(response.text, "html.parser")

    title = url
    if soup.title and soup.title.string:
        title = soup.title.string.strip()

    # Remove junk elements
    for tag in soup.find_all(TAGS_TO_REMOVE):
        tag.decompose()

    raw_text = soup.get_text(separator=" ")
    text = re.sub(r"\s+", " ", raw_text).strip()

    # ── Validate content ──────────────────────────────────────
    if len(text) < settings.MIN_CONTENT_LENGTH:
        raise ScrapingError(
            url,
            f"Too little content after parsing ({len(text)} chars). "
            "Likely a JS-rendered app or empty page.",
        )

    # Check for JS-required indicators
    js_indicators = [
        "JavaScript is disabled",
        "enable JavaScript",
        "JavaScript is required",
        "please enable javascript",
        "you need to enable javascript",
    ]
    if any(indicator.lower() in text.lower() for indicator in js_indicators):
        raise ScrapingError(url, "Page requires JavaScript to render content")

    # Detect SPA shells — pages where the HTML is mostly script tags
    # and the actual body has very little content.
    # A React app's HTML might have 10KB of <script> imports but only
    # 50 chars of actual visible text.
    script_count = len(response.text.split("<script"))
    if script_count > 5 and len(text) < 1000:
        raise ScrapingError(
            url,
            f"Detected SPA shell ({script_count} script tags, only {len(text)} chars text). "
            "Falling back to JS renderer.",
        )

    return text, title


def _jina_scrape(url: str) -> tuple[str, str]:
    """
    Stage 2: Scrape via Jina Reader API.

    WHAT IS JINA READER?
        A free API that renders any URL (including JS-heavy sites)
        and returns clean Markdown text.

        How it works:
        1. You send: GET https://r.jina.ai/https://example.com
        2. Jina opens a headless browser, loads the page, waits for JS
        3. Jina extracts the article content (like "Reader Mode" in browsers)
        4. Returns clean Markdown text

        It's like having a free Playwright/Selenium running in the cloud.

    WHY NOT USE JINA FOR EVERYTHING?
        1. Speed: Direct scrape = ~1s, Jina = ~3-5s
        2. Rate limits: Free tier has usage limits
        3. Dependency: If Jina's API goes down, your scraper is dead
        4. Privacy: You're sending URLs to a third-party service

        Direct scraping works for 80% of sites. Jina is the fallback for the rest.
    """

    jina_url = f"{JINA_READER_PREFIX}{url}"

    try:
        response = requests.get(
            jina_url,
            timeout=(5, 30),  # Jina takes longer — it's rendering JS
            headers={
                # DON'T send browser User-Agent to Jina — they'll 403 us
                # for pretending to be Chrome. Use a clean, honest UA.
                "Accept": "text/plain",
            },
        )
    except requests.Timeout:
        raise ScrapingError(url, "Jina Reader timed out")
    except requests.ConnectionError:
        raise ScrapingError(url, "Could not connect to Jina Reader API")
    except requests.RequestException as e:
        raise ScrapingError(url, f"Jina Reader error: {e}")

    if response.status_code != 200:
        raise ScrapingError(
            url,
            f"Jina Reader returned HTTP {response.status_code}",
        )

    text = response.text.strip()

    # ── Extract title from Jina's Markdown output ─────────────
    # Jina returns Markdown like:
    #   Title: My Blog Post
    #   URL Source: https://example.com/post
    #
    #   Content here...
    title = url
    lines = text.split("\n")
    for line in lines[:5]:  # Title is usually in the first few lines
        if line.startswith("Title:"):
            title = line.replace("Title:", "").strip()
            break

    # Remove Jina's metadata header (Title:, URL Source:, Markdown Content:)
    content_lines = []
    past_header = False
    for line in lines:
        if past_header:
            content_lines.append(line)
        elif line.strip() == "" and any(
            l.startswith(("Title:", "URL Source:", "Markdown Content:"))
            for l in lines[:5]
        ):
            past_header = True
        elif not line.startswith(("Title:", "URL Source:", "Markdown Content:")):
            content_lines.append(line)

    clean_text = "\n".join(content_lines).strip()

    # Convert markdown to plain text (remove # headers, ** bold, etc.)
    clean_text = re.sub(r"#{1,6}\s*", "", clean_text)  # Remove headers
    clean_text = re.sub(r"\*\*(.*?)\*\*", r"\1", clean_text)  # Remove bold
    clean_text = re.sub(r"\*(.*?)\*", r"\1", clean_text)  # Remove italic
    clean_text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", clean_text)  # Links → text
    clean_text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", clean_text)  # Remove images
    clean_text = re.sub(r"\s+", " ", clean_text).strip()

    if len(clean_text) < settings.MIN_CONTENT_LENGTH:
        raise ScrapingError(
            url,
            f"Jina Reader returned too little content ({len(clean_text)} chars). "
            "The page might be behind a login or paywall.",
        )

    return clean_text, title
