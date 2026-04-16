"""
scraper.py — Web Scraping Module
==================================

WHY THIS FILE EXISTS:
    Before: read_website() lived inside feed.py alongside database logic.
    This violates the "Single Responsibility Principle" — one module should
    do ONE thing well.

    Now:
    - scraper.py → reads websites (HTTP + HTML parsing)
    - feed.py → stores content in the database
    - query.py → retrieves content and asks the LLM

    This is like separating Controller, Service, and Repository in Spring Boot.

WHAT DOES A WEB SCRAPER DO?
    1. Sends an HTTP GET request to the URL (like opening it in a browser)
    2. Gets back HTML (the raw source code of the page)
    3. Parses the HTML to extract just the text content
    4. Returns the clean text and the page title

    Why not just use the raw HTML?
    Because HTML is full of tags, scripts, styles, menus, footers, etc.
    We only want the ARTICLE text — the useful knowledge.

WHAT IS BeautifulSoup?
    A Python library for parsing HTML. It turns messy HTML into a
    searchable tree structure. Think of it like a DOM parser.

    soup = BeautifulSoup("<html><body><p>Hello</p></body></html>")
    soup.find("p").text  # → "Hello"
    soup.get_text()      # → "Hello" (all text, no tags)
"""

import logging
import re

import requests
from bs4 import BeautifulSoup

from app.config import settings
from app.exceptions import ScrapingError

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────

# User-Agent tells the website what "browser" is making the request.
# Many websites BLOCK requests without a User-Agent because they
# look like bots/scrapers (which we are, but we want to be polite).
#
# This User-Agent string identifies us as a real browser (Mozilla/5.0)
# so most websites will serve us the full page.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# Tags that contain non-content elements.
# We remove these BEFORE extracting text.
# Without this, your chunks would contain things like:
#   "function gtag(){dataLayer.push(arguments)}" (JavaScript)
#   ".container { max-width: 1200px }" (CSS)
#   "Subscribe to our newsletter" (nav/footer junk)
TAGS_TO_REMOVE = ["script", "style", "nav", "footer", "header", "aside", "noscript"]


def read_website(url: str) -> tuple[str, str]:
    """
    Fetch a website and extract its text content and title.

    Args:
        url: The URL to scrape.

    Returns:
        A tuple of (text_content, page_title).

    Raises:
        ScrapingError: If the website can't be read or has no useful content.

    HOW THIS FUNCTION WORKS STEP BY STEP:
        1. Send HTTP GET request with timeout and User-Agent
        2. Check if the response is valid (200 OK, enough text)
        3. Parse HTML with BeautifulSoup
        4. Remove junk elements (scripts, styles, navigation)
        5. Extract clean text
        6. Return text and title
    """

    # ── Step 1: Make the HTTP request ─────────────────────────
    try:
        response = requests.get(
            url,
            # timeout=(connect_timeout, read_timeout) in seconds.
            # connect_timeout: how long to wait to establish the TCP connection.
            # read_timeout: how long to wait for the server to send data.
            #
            # WITHOUT TIMEOUT: If the server is dead, requests.get() waits
            # FOREVER. Your API endpoint hangs. User sees a loading spinner
            # forever. Other requests queue up. Server overloads. Everything dies.
            #
            # This is one of the most common production bugs. ALWAYS set timeouts.
            timeout=(5, settings.SCRAPER_TIMEOUT),
            headers={"User-Agent": USER_AGENT},
            # allow_redirects: Follow HTTP redirects (301, 302).
            # Many URLs redirect: http → https, www → non-www, etc.
            allow_redirects=True,
        )
    except requests.Timeout:
        # The website took too long to respond.
        raise ScrapingError(url, "Website took too long to respond (timeout)")
    except requests.ConnectionError:
        # Can't connect to the server at all (DNS failure, server down, etc.)
        raise ScrapingError(url, "Could not connect to the website")
    except requests.RequestException as e:
        # Catch-all for any other request error (SSL, too many redirects, etc.)
        raise ScrapingError(url, str(e))

    # ── Step 2: Validate the response ─────────────────────────
    # HTTP status codes:
    #   200 = OK (everything is fine)
    #   301/302 = Redirect (handled by allow_redirects=True)
    #   403 = Forbidden (website blocks us)
    #   404 = Not Found (page doesn't exist)
    #   500 = Server Error (their problem, not ours)
    if response.status_code != 200:
        raise ScrapingError(
            url,
            f"Website returned HTTP {response.status_code}",
        )

    # ── Step 3: Parse HTML ────────────────────────────────────
    # "html.parser" is Python's built-in HTML parser.
    # Alternatives: "lxml" (faster), "html5lib" (more lenient).
    # "html.parser" is fine for our use case and has no extra dependencies.
    soup = BeautifulSoup(response.text, "html.parser")

    # Extract the page title (the text in the <title> tag).
    # soup.title returns the <title> element.
    # .string gets the text inside it.
    # If there's no title tag, use the URL as the title.
    title = url
    if soup.title and soup.title.string:
        title = soup.title.string.strip()

    # ── Step 4: Remove junk elements ──────────────────────────
    # soup.find_all() returns all matching elements.
    # .decompose() removes the element AND all its children from the tree.
    #
    # After this, soup only contains the "content" elements:
    # headings, paragraphs, lists, etc.
    for tag in soup.find_all(TAGS_TO_REMOVE):
        tag.decompose()

    # ── Step 5: Extract clean text ────────────────────────────
    # get_text(separator=" ") joins all text nodes with a space.
    # Without separator, "Hello</p><p>World" becomes "HelloWorld".
    # With separator=" ", it becomes "Hello World".
    raw_text = soup.get_text(separator=" ")

    # Clean up whitespace:
    # - Replace multiple spaces/newlines with a single space
    # - Strip leading/trailing whitespace
    # re.sub(r'\s+', ' ', text) replaces any sequence of whitespace
    # characters (spaces, tabs, newlines) with a single space.
    text = re.sub(r"\s+", " ", raw_text).strip()

    # ── Step 6: Validate content quality ──────────────────────
    if len(text) < settings.MIN_CONTENT_LENGTH:
        raise ScrapingError(
            url,
            f"Page has too little content ({len(text)} chars). "
            "It might be a login page, paywall, or error page.",
        )

    # Check for common "JavaScript required" messages.
    # Many modern sites (SPAs) render content with JavaScript.
    # Our scraper can't execute JavaScript, so we get an empty page
    # with a message like "Please enable JavaScript".
    js_indicators = [
        "JavaScript is disabled",
        "enable JavaScript",
        "JavaScript is required",
        "please enable javascript",
    ]
    if any(indicator.lower() in text.lower() for indicator in js_indicators):
        raise ScrapingError(
            url,
            "This website requires JavaScript to load content. "
            "Our scraper can't handle JavaScript-heavy sites.",
        )

    logger.info("Scraped %s — title='%s', text_length=%d", url, title, len(text))
    return text, title
