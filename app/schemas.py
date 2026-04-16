"""
schemas.py — Request & Response Models (DTOs)
===============================================

WHY THIS FILE EXISTS:
    In Spring Boot, you create DTOs (Data Transfer Objects) like:

        public class URLRequest {
            @NotNull
            private String url;
        }

        public class ApiResponse<T> {
            private String status;
            private String message;
            private T data;
        }

    Pydantic models serve the SAME purpose in Python/FastAPI:
    1. Validate incoming data (is the URL a real URL? is it a string?)
    2. Document the API (FastAPI auto-generates Swagger docs from these)
    3. Serialize outgoing data (convert Python dicts to JSON)

WHAT IS PYDANTIC?
    Pydantic is Python's most popular data validation library.
    It uses Python type hints to validate data at runtime.

    class User(BaseModel):
        name: str           # Must be a string
        age: int            # Must be an integer
        email: EmailStr     # Must be a valid email

    # This works:
    user = User(name="Dinesh", age=25, email="dinesh@example.com")

    # This CRASHES with a clear error:
    user = User(name="Dinesh", age="not a number", email="bad")
    # → ValidationError: age must be an integer, email is not valid

    FastAPI uses Pydantic automatically. When you write:
        @app.post("/feed")
        def feed_url(request: URLRequest):

    FastAPI will:
    1. Parse the JSON body
    2. Create a URLRequest object
    3. Validate all fields
    4. Return a 422 error with details if validation fails
"""

from pydantic import BaseModel, Field


# ── Request Models ────────────────────────────────────────────

class URLRequest(BaseModel):
    """
    Request body for the /feed endpoint.

    Field(...) is Pydantic's way to add constraints and docs:
    - min_length=1: URL can't be empty
    - examples: Shown in the auto-generated Swagger docs

    In Spring Boot, this would be:
        @NotBlank
        @URL
        private String url;
    """

    url: str = Field(
        ...,  # ... means "this field is required" (like @NotNull in Java)
        min_length=1,
        examples=["https://example.com/blog/interesting-article"],
        description="The URL of the website to scrape and store",
    )


class QueryRequest(BaseModel):
    """Request body for the /query endpoint."""

    question: str = Field(
        ...,
        min_length=1,
        examples=["What is consistent hashing?"],
        description="The question to ask Jarvis about your saved content",
    )


# ── Response Models ───────────────────────────────────────────
# WHY RESPONSE MODELS?
# Without them, your API returns raw dicts and the Swagger docs
# just say "Response: object". With models, the docs show the
# exact shape of the response, making it easy for frontend devs
# to know what to expect.


class SourceInfo(BaseModel):
    """A single source reference returned with query answers."""

    url: str
    title: str = ""
    fed_at: str = ""


class EntryInfo(BaseModel):
    """A single entry in the vault list."""

    url: str
    title: str
    date: str
    source: str
    type: str = "blog"
    excerpt: str = ""


class FeedResponse(BaseModel):
    """Response from the /feed endpoint."""

    status: str
    message: str
    chunks_count: int = 0


class QueryResponse(BaseModel):
    """Response from the /query endpoint."""

    status: str
    answer: str = ""
    sources: list[SourceInfo] = []
    message: str = ""


class ListResponse(BaseModel):
    """Response from the /list endpoint."""

    status: str
    entries: list[EntryInfo] = []


class DeleteResponse(BaseModel):
    """Response from the /delete endpoint."""

    status: str
    message: str


class HealthResponse(BaseModel):
    """Response from the /health endpoint."""

    status: str
    database: str
    entries_count: int
