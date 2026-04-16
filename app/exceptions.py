"""
exceptions.py — Custom Exceptions & Exception Handlers
========================================================

WHY CUSTOM EXCEPTIONS?
    Right now, when something goes wrong, you return a dict:
        return {"status": "error", "message": str(e)}

    Problems with this approach:
    1. HTTP status code is always 200 (OK) — even for errors!
       A REST client checking res.ok would think it succeeded.
    2. All errors look the same — a duplicate URL and a server crash
       both return the same format.
    3. No way for the frontend to distinguish error types.

    With custom exceptions, you get:
    - 409 Conflict for duplicate URLs
    - 404 Not Found for missing entries
    - 422 Unprocessable for invalid content
    - 500 Internal Server Error for unexpected crashes

    In Spring Boot, you'd use:
        @ResponseStatus(HttpStatus.CONFLICT)
        public class DuplicateResourceException extends RuntimeException { }

    In FastAPI, we register "exception handlers" that catch specific
    exception types and return the right HTTP status code.

WHAT IS AN EXCEPTION HANDLER?
    It's middleware that intercepts exceptions before they crash the app.

    Normal flow:  Request → Route → Return Response
    Error flow:   Request → Route → EXCEPTION → Handler → Error Response

    The handler converts the exception into a proper HTTP response
    with the right status code and a JSON body.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


# ── Custom Exception Classes ─────────────────────────────────
# Each class represents a specific type of error.
# We inherit from Python's built-in Exception class.
#
# WHY NOT JUST USE ValueError?
# Because catching ValueError catches ALL ValueErrors, including
# ones from Python's standard library that you didn't expect.
# Custom exceptions let you be precise about what you're catching.


class URLAlreadyExistsError(Exception):
    """Raised when trying to feed a URL that's already in the vault."""

    def __init__(self, url: str):
        self.url = url
        # super().__init__() calls the parent Exception class constructor.
        # This is like calling super() in a Java constructor.
        super().__init__(f"URL '{url}' is already in the vault")


class ScrapingError(Exception):
    """Raised when we fail to read/parse a website."""

    def __init__(self, url: str, reason: str = ""):
        self.url = url
        self.reason = reason
        super().__init__(
            f"Failed to scrape '{url}'" + (f": {reason}" if reason else "")
        )


class EntryNotFoundError(Exception):
    """Raised when trying to delete a URL that doesn't exist."""

    def __init__(self, url: str):
        self.url = url
        super().__init__(f"No entries found for URL '{url}'")


class EmptyVaultError(Exception):
    """Raised when querying an empty vault."""

    def __init__(self):
        super().__init__(
            "Your vault is empty. Feed some URLs first before asking questions."
        )


class AIServiceError(Exception):
    """Raised when the Gemini API call fails."""

    def __init__(self, reason: str = ""):
        self.reason = reason
        super().__init__(
            f"AI service error" + (f": {reason}" if reason else "")
        )


# ── Exception Handlers Registration ──────────────────────────
# This function registers ALL exception handlers with the FastAPI app.
# We call it once in main.py during app startup.
#
# HOW IT WORKS:
#   @app.exception_handler(SomeException)
#   def handle(request, exc):
#       return JSONResponse(status_code=..., content={...})
#
# When SomeException is raised ANYWHERE in a route, FastAPI:
# 1. Catches it (doesn't crash)
# 2. Calls this handler function
# 3. Returns the JSONResponse to the client
#
# This is similar to Spring Boot's @ControllerAdvice + @ExceptionHandler


def register_exception_handlers(app: FastAPI):
    """
    Register all custom exception handlers with the FastAPI app.

    In Spring Boot, this would be a @ControllerAdvice class with
    multiple @ExceptionHandler methods.
    """

    @app.exception_handler(URLAlreadyExistsError)
    async def handle_url_exists(request: Request, exc: URLAlreadyExistsError):
        # 409 Conflict = "the request conflicts with current state"
        # Perfect for "this URL is already saved"
        return JSONResponse(
            status_code=409,
            content={"status": "error", "message": str(exc)},
        )

    @app.exception_handler(ScrapingError)
    async def handle_scraping_error(request: Request, exc: ScrapingError):
        # 422 Unprocessable Entity = "I understood your request but can't process it"
        # The URL is valid, but the content couldn't be scraped
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": str(exc)},
        )

    @app.exception_handler(EntryNotFoundError)
    async def handle_not_found(request: Request, exc: EntryNotFoundError):
        # 404 Not Found = "the resource doesn't exist"
        return JSONResponse(
            status_code=404,
            content={"status": "error", "message": str(exc)},
        )

    @app.exception_handler(EmptyVaultError)
    async def handle_empty_vault(request: Request, exc: EmptyVaultError):
        # 404 because conceptually the "knowledge" resource doesn't exist yet
        return JSONResponse(
            status_code=404,
            content={"status": "error", "message": str(exc)},
        )

    @app.exception_handler(AIServiceError)
    async def handle_ai_error(request: Request, exc: AIServiceError):
        # 502 Bad Gateway = "upstream service (Gemini) failed"
        # Your API is the "gateway" between the frontend and Gemini
        return JSONResponse(
            status_code=502,
            content={"status": "error", "message": str(exc)},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception):
        """
        Catch-all handler for ANY exception we didn't explicitly handle.

        WHY THIS IS CRITICAL:
        Without this, an unexpected error returns a raw HTML error page
        from Uvicorn, which breaks your frontend's JSON parsing.
        With this, the frontend ALWAYS gets a JSON response.

        In Spring Boot, this would be:
            @ExceptionHandler(Exception.class)
            public ResponseEntity<ErrorResponse> handleAll(Exception e) { ... }
        """
        import logging

        logger = logging.getLogger(__name__)
        # Log the full traceback for debugging. In production, you'd
        # send this to a service like Sentry or Datadog.
        logger.exception("Unexpected error: %s", exc)

        # 500 Internal Server Error = "something broke on our side"
        # NEVER expose the real error message to the client in production!
        # It could contain sensitive info (DB credentials, file paths, etc.)
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "An unexpected error occurred. Please try again.",
            },
        )
